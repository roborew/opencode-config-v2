import { execSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * oc-worktree — slice worktrees and sessions (blueprint §7.1).
 *
 * Pure helpers, unit-tested in tests/plugins/oc-worktree.test.ts. index.ts
 * registers the tools and the custom worktree strategy.
 *
 * One slice = one issue = one worktree off origin/main on branch
 * slice/<N>-<slug>, with its own session already running /build #N. Worktrees
 * are created ONLY from tool calls in the canonical checkout (anti-cascade
 * rule, ADR 0009), and the slice record is written to the worktree's git
 * directory (oc-slice.json) where oc-skills reads it.
 */

export interface IssueInfo {
  number: number
  title: string
  labels: string[]
  state: string
  body: string
}

/** A short, filesystem-safe slug from an issue title. */
export function slugify(title: string, max = 30): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "")
  return slug || "slice"
}

/** The issue numbers this issue is blocked by (a "Blocked by" heading followed by list items, or inline). */
export function parseBlockers(body: string): number[] {
  const numbers: number[] = []
  const push = (text: string) => {
    for (const m of text.matchAll(/#(\d+)/g)) {
      const n = Number(m[1])
      if (Number.isFinite(n) && !numbers.includes(n)) numbers.push(n)
    }
  }
  const lines = body.split("\n")
  let collecting = false
  let blank = 0
  for (const line of lines) {
    if (/^\s*#{0,4}\s*blocked by/i.test(line)) {
      collecting = true
      push(line) // inline form: "blocked by #7 in a sentence"
      continue
    }
    if (!collecting) continue
    if (line.trim() === "") {
      blank++
      if (blank > 1) break
      continue
    }
    if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      push(line)
      blank = 0
      continue
    }
    break // first prose after the list ends the section
  }
  return numbers
}

/**
 * The device/inode guard: a worktree may only be removed when its directory is
 * a strict descendant of the worktree root on the same device — a bind-mounted
 * root (same inode as the worktree dir, or the root itself) can never be removed.
 */
export function removalGuard(root: string, worktree: string): { ok: true } | { ok: false; refused: string } {
  const rootStat = safeStat(root)
  const wtStat = safeStat(worktree)
  if (!rootStat || !wtStat) return { ok: false, refused: `cannot stat ${!rootStat ? root : worktree}` }
  if (rootStat.dev === wtStat.dev && rootStat.ino === wtStat.ino) {
    return { ok: false, refused: `${worktree} IS the worktree root — refusing to remove it` }
  }
  const rel = relativePath(root, worktree)
  if (!rel || rel.startsWith("..") || rel === ".") {
    return { ok: false, refused: `${worktree} is not under the worktree root ${root}` }
  }
  if (statSync(dirname(worktree)).dev !== wtStat.dev) {
    return { ok: false, refused: `${worktree} sits on a different device than its parent — possible bind mount, refusing` }
  }
  return { ok: true }
}

function safeStat(p: string) {
  try {
    return statSync(p)
  } catch {
    return undefined
  }
}
function relativePath(from: string, to: string): string {
  const f = from.replace(/\/+$/, "").split("/")
  const t = to.replace(/\/+$/, "").split("/")
  let i = 0
  while (i < f.length && i < t.length && f[i] === t[i]) i++
  return t.slice(i).join("/")
}
function dirname(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/")
  parts.pop()
  return parts.join("/") || "/"
}

/** The .env files copied into a worktree for Robin's convenience (never .env.example, never printed). */
export function envFilesToCopy(source: string): string[] {
  if (!existsSync(source)) return []
  return readdirSync(source).filter((f) => f.startsWith(".env") && f !== ".env.example")
}

export interface SliceRecord {
  issue: number
  title: string
  labels: string[]
  prd?: number
  branch: string
  directory: string
  sessionID?: string
  sessionStarting?: string
  coordinatorSessionID?: string
  state: "building" | "in-review" | "ready" | "blocked"
  prURL?: string
  pendingLabel?: string
  blockedReason?: string
  blockedRevision?: string
  syncPending?: boolean
  syncClaim?: string
  cleanupComplete?: boolean
  createdAt: number
}

/** Reads the oc-slice.json a worktree carries in its git directory. */
export function readSliceRecordFile(worktree: string): SliceRecord | undefined {
  try {
    const gitDir = execSync("git rev-parse --git-dir", {
      cwd: worktree,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    })
      .toString()
      .trim()
    const p = gitDir.startsWith("/") ? join(gitDir, "oc-slice.json") : join(worktree, gitDir, "oc-slice.json")
    if (!existsSync(p)) return undefined
    return JSON.parse(readFileSync(p, "utf8")) as SliceRecord
  } catch {
    return undefined
  }
}

/** git worktree list --porcelain, parsed (paths normalized through realpath — git may print /private/… on macOS). */
export function listWorktrees(directory: string): { directory: string; type: "root" | "worktree" }[] {
  const out = execSync("git worktree list --porcelain", { cwd: directory, stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim()
  const root = realpathSync(directory)
  return out
    .split("\n\n")
    .filter(Boolean)
    .map((blk) => {
      const dir = realpathSync(blk.split("\n").find((l) => l.startsWith("worktree "))!.slice(9))
      return { directory: dir, type: dir === root ? ("root" as const) : ("worktree" as const) }
    })
}

/** Error classification: "server unreachable" (restart) vs "not a git worktree" (prune + retry once). */
export function classifyWorktreeError(error: unknown): { kind: "server-unreachable" | "not-a-worktree"; hint: string } {
  const message = error instanceof Error ? error.message : String(error)
  if (/not a working tree|is not a git worktree|invalid.*worktree/i.test(message)) {
    return { kind: "not-a-worktree", hint: "recoverable: run git worktree prune and retry once" }
  }
  return { kind: "server-unreachable", hint: "the OpenCode server needs a restart" }
}
