import { execSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import {
  classifyWorktreeError,
  envFilesToCopy,
  listWorktrees,
  parseBlockers,
  readSliceRecordFile,
  removalGuard,
  slugify,
} from "../../plugins/oc-worktree/lib"

const tmpDirs: string[] = []
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
})

describe("slugify", () => {
  it("makes short filesystem-safe slugs", () => {
    expect(slugify("Add password reset for admin users")).toBe("add-password-reset-for-admin-u")
    expect(slugify("Add password reset for admin users")).toHaveLength(30)
    expect(slugify("  --Weird!! Title--  ")).toBe("weird-title")
    expect(slugify("!!!")).toBe("slice")
    expect(slugify("a".repeat(100))).toHaveLength(30)
  })
})

describe("parseBlockers", () => {
  it("finds Blocked-by references in issue bodies", () => {
    const body = "## Blocked by\n\n- #12\n- #34\n\nRest of the body mentions #99 casually but not as a blocker."
    expect(parseBlockers(body)).toEqual([12, 34])
    expect(parseBlockers("blocked by #7 in a sentence")).toEqual([7])
    expect(parseBlockers("no blockers here")).toEqual([])
  })
})

describe("envFilesToCopy", () => {
  it("lists .env files except .env.example", () => {
    const dir = mkdtempSync(join(tmpdir(), "envcopy-"))
    tmpDirs.push(dir)
    for (const f of [".env", ".env.local", ".env.example", ".env.staging", "README.md"]) {
      writeFileSync(join(dir, f), "X=1\n")
    }
    expect(envFilesToCopy(dir).sort()).toEqual([".env", ".env.local", ".env.staging"])
    expect(envFilesToCopy(join(dir, "nowhere"))).toEqual([])
  })
})

describe("removalGuard (device/inode guard)", () => {
  it("allows a real child of the worktree root", () => {
    const root = mkdtempSync(join(tmpdir(), "guard-"))
    tmpDirs.push(root)
    const child = join(root, "repo", "slice-7-demo")
    mkdirSync(child, { recursive: true })
    expect(removalGuard(root, child)).toEqual({ ok: true })
  })

  it("refuses the root itself and paths outside it", () => {
    const root = mkdtempSync(join(tmpdir(), "guard-"))
    tmpDirs.push(root)
    const other = mkdtempSync(join(tmpdir(), "guard-"))
    tmpDirs.push(other)
    expect(removalGuard(root, root).ok).toBe(false)
    expect(removalGuard(root, join(other, "slice-1-x")).ok).toBe(false)
    expect(removalGuard(root, root + "/..").ok).toBe(false)
  })
})

describe("slice record file", () => {
  it("round-trips through a worktree's git dir", () => {
    const repo = mkdtempSync(join(tmpdir(), "sr-"))
    tmpDirs.push(repo)
    execSync("git init -q -b main", { cwd: repo })
    writeFileSync(join(repo, "f.txt"), "x\n")
    execSync("git add -A && git -c commit.gpgsign=false -c user.name=t -c user.email=t@t commit -qm init", { cwd: repo })
    const wt = join(repo, "..", "sr-wt")
    execSync(`git worktree add -q -b slice/7-demo ${JSON.stringify(wt)} main`, { cwd: repo })
    tmpDirs.push(wt)
    expect(readSliceRecordFile(wt)).toBeUndefined()
    const gitDir = execSync("git rev-parse --git-dir", { cwd: wt }).toString().trim()
    const recordPath = gitDir.startsWith("/") ? join(gitDir, "oc-slice.json") : join(wt, gitDir, "oc-slice.json")
    writeFileSync(
      recordPath,
      JSON.stringify({ issue: 7, title: "demo", labels: ["area:api"], branch: "slice/7-demo", directory: wt, state: "building", createdAt: 1 }),
    )
    expect(readSliceRecordFile(wt)?.issue).toBe(7)
    expect(readSliceRecordFile(repo)).toBeUndefined()
  })
})

describe("listWorktrees + error classification", () => {
  it("lists the root and its worktrees from porcelain output", () => {
    const repo = mkdtempSync(join(tmpdir(), "lw-"))
    tmpDirs.push(repo)
    execSync("git init -q -b main", { cwd: repo })
    writeFileSync(join(repo, "f.txt"), "x\n")
    execSync("git add -A && git -c commit.gpgsign=false -c user.name=t -c user.email=t@t commit -qm init", { cwd: repo })
    const wt = join(repo, "..", "lw-wt")
    execSync(`git worktree add -q -b slice/8-x ${JSON.stringify(wt)} main`, { cwd: repo })
    tmpDirs.push(wt)
    const list = listWorktrees(repo)
    expect(list.find((e) => e.directory === repo)?.type).toBe("root")
    expect(list.find((e) => e.directory === wt)?.type).toBe("worktree")
  })

  it("tells server-unreachable apart from not-a-worktree", () => {
    expect(classifyWorktreeError(new Error("fatal: '/x' is not a git worktree")).kind).toBe("not-a-worktree")
    expect(classifyWorktreeError(new Error("not a working tree: /y")).hint).toContain("prune")
    expect(classifyWorktreeError(new Error("ECONNREFUSED somewhere")).kind).toBe("server-unreachable")
  })
})

describe("the worktree strategy shape (real git)", () => {
  it("branch checked out off origin/main, not detached", () => {
    const base = mkdtempSync(join(tmpdir(), "strat-"))
    tmpDirs.push(base)
    const origin = join(base, "origin.git")
    const repo = join(base, "repo")
    execSync(`git init -q --bare ${JSON.stringify(origin)}`)
    execSync("git init -q -b main", { cwd: (mkdirSync(repo, { recursive: true }), repo) })
    writeFileSync(join(repo, "f.txt"), "x\n")
    execSync("git add -A && git -c commit.gpgsign=false -c user.name=t -c user.email=t@t commit -qm init", { cwd: repo })
    execSync(`git remote add origin ${JSON.stringify(origin)} && git push -q -u origin main`, { cwd: repo })

    const wt = join(base, "slice-9-demo")
    execSync(`git -C ${JSON.stringify(repo)} fetch origin main`)
    execSync(`git -C ${JSON.stringify(repo)} worktree add -b slice/9-demo ${JSON.stringify(wt)} origin/main`)
    tmpDirs.push(wt)

    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: wt }).toString().trim()
    expect(branch).toBe("slice/9-demo") // checked out, not detached
    const head = execSync("git rev-parse HEAD", { cwd: wt }).toString().trim()
    const main = execSync("git rev-parse origin/main", { cwd: wt }).toString().trim()
    expect(head).toBe(main) // off origin/main
  })
})
