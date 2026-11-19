import { execSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import {
  appSkillIds,
  parseApps,
  readFrontMatter,
  readSliceRecord,
  skillsForSession,
  skillsForSlice,
  BASE_SKILLS,
  PRIMARY_SKILLS,
} from "../../plugins/oc-skills/skills"

const FRONT_MATTER = `
apps:
  api: { kind: backend, stack: fastapi, skills: [api-and-interface-design] }
  web: { kind: frontend, stack: tanstack-start, skills: [frontend-ui-engineering, browser-testing-with-devtools] }
contract: { generated: ["packages/api-client/**"], generator_service: "api-client-gen" }
test:
  compose: compose.yml
  profiles: { test: test, full: full }
  commands:
    test: "docker compose -f compose.yml --profile test run --rm {service} {args}"
    full: "docker compose -f compose.yml --profile full up -d --wait"
  services: { all: "test", api: "api-test", web: "web-test", e2e: "e2e", smoke: "smoke" }
test_globs: ["apps/*/tests/**", "apps/*/**/*.test.*"]
`

const tmpDirs: string[] = []
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
})

describe("primary gateway skills", () => {
  it("gives Plan the always-on discovery skill and its own gateway outside commands", () => {
    expect(skillsForSession("plan")).toEqual(PRIMARY_SKILLS.plan)
    expect(skillsForSession("plan")).toContain("using-agent-skills")
    expect(skillsForSession("plan")).toContain("oc-plan-gateway")
    expect(skillsForSession("plan")).not.toContain("oc-build-gateway")
  })

  it("gives Build the always-on discovery skill and its own gateway outside slice records", () => {
    expect(skillsForSession("build")).toEqual(PRIMARY_SKILLS.build)
    expect(skillsForSession("build")).toContain("using-agent-skills")
    expect(skillsForSession("build")).toContain("oc-build-gateway")
  })

  it("composes gateway, base, and slice area/risk skills without duplicates", () => {
    const skills = skillsForSession(
      "build",
      { issue: 7, labels: ["area:web", "risk:security"] },
      FRONT_MATTER,
      "/tmp",
    )
    expect(skills).toEqual([
      ...PRIMARY_SKILLS.build,
      ...BASE_SKILLS,
      "frontend-ui-engineering",
      "browser-testing-with-devtools",
      "security-and-hardening",
    ])
  })

  it("does not infer a gateway for unrelated agents", () => {
    expect(skillsForSession("explore")).toEqual([])
  })
})

describe("parseApps", () => {
  it("parses the canonical single-line flow style", () => {
    const apps = parseApps(FRONT_MATTER)
    expect(apps.api).toEqual({ kind: "backend", skills: ["api-and-interface-design"] })
    expect(apps.web).toEqual({
      kind: "frontend",
      skills: ["frontend-ui-engineering", "browser-testing-with-devtools"],
    })
  })

  it("returns empty when there is no apps block", () => {
    expect(parseApps("test_globs: []")).toEqual({})
  })
})

describe("skillsForSlice", () => {
  it("always includes the base skills", () => {
    expect(skillsForSlice({ issue: 7, labels: [] }, FRONT_MATTER, "/tmp")).toEqual([...BASE_SKILLS])
  })

  it("maps area:<app> labels through the front matter skills, plus the app's own .agents/skills", () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-skills-"))
    tmpDirs.push(dir)
    mkdirSync(join(dir, "apps", "api", ".agents", "skills", "api-notes"), { recursive: true })
    writeFileSync(join(dir, "apps", "api", ".agents", "skills", "api-notes", "SKILL.md"), "---\nname: API Notes\n---\n")
    const skills = skillsForSlice({ issue: 7, labels: ["slice", "area:api"] }, FRONT_MATTER, dir)
    expect(skills).toContain("api-and-interface-design")
    expect(skills).toContain("api-notes")
    expect(skills).toContain(...BASE_SKILLS)
  })

  it("falls back to kind defaults when the app has no skills list", () => {
    const fm = `
apps:
  admin: { kind: frontend, stack: vite }
`
    const skills = skillsForSlice({ issue: 7, labels: ["area:admin"] }, fm, "/tmp")
    expect(skills).toContain("frontend-ui-engineering")
    expect(skills).toContain("browser-testing-with-devtools")
  })

  it("maps the reserved area and risk labels", () => {
    const skills = skillsForSlice({ issue: 7, labels: ["area:db", "risk:security"] }, FRONT_MATTER, "/tmp")
    expect(skills).toContain("deprecation-and-migration")
    expect(skills).toContain("security-and-hardening")
    // area:docs is reserved with no skill mapping of its own
    const docs = skillsForSlice({ issue: 7, labels: ["area:docs"] }, FRONT_MATTER, "/tmp")
    expect(docs).toEqual([...BASE_SKILLS])
  })

  it("ignores labels that are not areas", () => {
    expect(skillsForSlice({ issue: 7, labels: ["prd", "status:ready"] }, FRONT_MATTER, "/tmp")).toEqual([...BASE_SKILLS])
  })
})

describe("appSkillIds", () => {
  it("finds nested SKILL.md dirs and flat .md files", () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-skills-"))
    tmpDirs.push(dir)
    mkdirSync(join(dir, "apps", "web", ".agents", "skills", "web-routes"), { recursive: true })
    writeFileSync(join(dir, "apps", "web", ".agents", "skills", "web-routes", "SKILL.md"), "x\n")
    writeFileSync(join(dir, "apps", "web", ".agents", "skills", "flat.md"), "x\n")
    expect(appSkillIds(dir, "web").sort()).toEqual(["flat", "web-routes"])
    expect(appSkillIds(dir, "nope")).toEqual([])
  })
})

describe("readSliceRecord / readFrontMatter", () => {
  it("reads the record from a worktree's git dir and nothing elsewhere", () => {
    const repo = mkdtempSync(join(tmpdir(), "slice-repo-"))
    tmpDirs.push(repo)
    execSync("git init -q -b main", { cwd: repo })
    writeFileSync(join(repo, "f.txt"), "x\n")
    execSync("git add -A && git -c user.name=t -c user.email=t@t commit -qm init", { cwd: repo })
    const worktree = join(repo, "..", "wt-test")
    execSync(`git worktree add -b slice/7-demo ${JSON.stringify(worktree)} main`, { cwd: repo })
    tmpDirs.push(worktree)

    // not a slice worktree yet
    expect(readSliceRecord(worktree)).toBeUndefined()

    const gitDir = execSync("git rev-parse --git-dir", { cwd: worktree }).toString().trim()
    const recordPath = gitDir.startsWith("/") ? join(gitDir, "oc-slice.json") : join(worktree, gitDir, "oc-slice.json")
    writeFileSync(recordPath, JSON.stringify({ issue: 7, labels: ["area:api"], branch: "slice/7-demo" }))
    expect(readSliceRecord(worktree)).toEqual({ issue: 7, labels: ["area:api"], branch: "slice/7-demo" })
    expect(readSliceRecord(repo)).toBeUndefined()
  })

  it("reads the AGENTS.md front matter", () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-skills-"))
    tmpDirs.push(dir)
    writeFileSync(join(dir, "AGENTS.md"), `---\n${FRONT_MATTER.trim()}\n---\n\nbody\n`)
    expect(readFrontMatter(dir)).toContain("apps:")
    expect(readFrontMatter(dir)).toContain("test_globs:")
    // repo without AGENTS.md → empty string
    const empty = mkdtempSync(join(tmpdir(), "oc-skills-"))
    tmpDirs.push(empty)
    expect(readFrontMatter(empty)).toBe("")
  })
})
