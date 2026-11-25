import { execSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * oc-skills — guaranteed skill loading for slice sessions (blueprint §6/§7.4).
 *
 * Pure helpers, unit-tested in tests/plugins/oc-skills.test.ts. The plugin
 * index.ts wires them into the session "prompt" hook.
 *
 * The slice record is written by oc-worktree at slice_start into the worktree's
 * git directory (invisible to the repo): <git-dir>/oc-slice.json. Skills config
 * globs are not supported and per-app .agents/skills sit below the session's
 * working directory, so this hook is the only reliable way those skills load.
 */

/** Always loaded for a primary session, including sessions started without a command. */
export const PRIMARY_SKILLS = {
  plan: ["using-agent-skills", "oc-plan-gateway"],
  build: ["using-agent-skills", "oc-build-gateway"],
} as const

/**
 * Utility agents outside the delivery lifecycle. They are admitted without any
 * lifecycle gateway, slice overlay or app-skill attachment: /matts-skills and
 * /sync-skills load their own explicitly selected skills.
 */
export const MANUAL_AGENTS = ["matt", "skill-admin"] as const

export const BASE_SKILLS = [
  "incremental-implementation",
  "test-driven-development",
  "context-engineering",
  "git-workflow-and-versioning",
  "oc-sandbox",
]

const LABEL_SKILLS: Record<string, string[]> = {
  "area:db": ["deprecation-and-migration"],
  "area:infra": ["ci-cd-and-automation"],
  "risk:security": ["security-and-hardening"],
}

const KIND_DEFAULTS: Record<string, string[]> = {
  backend: ["api-and-interface-design"],
  frontend: ["frontend-ui-engineering", "browser-testing-with-devtools"],
}

/** area labels that map to fixed skills rather than an app (blueprint §6). */
const RESERVED_AREAS = new Set(["db", "infra", "docs"])

export interface SliceRecord {
  issue: number
  title?: string
  labels?: string[]
  prd?: number
  branch?: string
  directory?: string
}

/** The slice record for a working directory, or undefined when it is not a slice worktree. */
export function readSliceRecord(directory: string): SliceRecord | undefined {
  try {
    const gitDir = execSync("git rev-parse --git-dir", {
      cwd: directory,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    })
      .toString()
      .trim()
    const recordPath = gitDir.startsWith("/")
      ? join(gitDir, "oc-slice.json")
      : join(directory, gitDir, "oc-slice.json")
    if (!existsSync(recordPath)) return undefined
    return JSON.parse(readFileSync(recordPath, "utf8")) as SliceRecord
  } catch {
    return undefined
  }
}

/** The YAML front matter of a repo's AGENTS.md, or an empty string. */
export function readFrontMatter(directory: string): string {
  const agents = join(directory, "AGENTS.md")
  if (!existsSync(agents)) return ""
  const text = readFileSync(agents, "utf8")
  if (!text.startsWith("---")) return ""
  const end = text.indexOf("\n---", 3)
  return end === -1 ? "" : text.slice(3, end)
}

export interface AppEntry {
  kind?: string
  skills?: string[]
}

/**
 * Parses the canonical apps: block of the §9.3 front matter skeleton:
 *   api: { kind: backend, stack: fastapi, skills: [api-and-interface-design] }
 * Block-style entries (kind:/skills: on their own lines) are also accepted.
 */
export function parseApps(frontMatter: string): Record<string, AppEntry> {
  const apps: Record<string, AppEntry> = {}
  const appsBlock = frontMatter.match(/^apps:\s*$/m)
  if (!appsBlock) return apps
  const lines = frontMatter
    .slice((appsBlock.index ?? 0) + appsBlock[0].length)
    .split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.trim() === "") continue
    if (!line.startsWith("  ")) break
    const flow = line.match(/^\s{2}([a-z0-9][a-z0-9-]*):\s*\{(.*)\}\s*$/)
    if (flow) {
      apps[flow[1]!] = {
        kind: flow[2]!.match(/kind:\s*(\w+)/)?.[1],
        skills: listFrom(flow[2]!.match(/skills:\s*\[([^\]]*)\]/)?.[1]),
      }
      continue
    }
    const block = line.match(/^\s{2}([a-z0-9][a-z0-9-]*):\s*$/)
    if (block) {
      const body: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j]!.startsWith("    ")) break
        body.push(lines[j]!.trim())
      }
      const text = body.join(" ")
      apps[block[1]!] = {
        kind: text.match(/kind:\s*(\w+)/)?.[1],
        skills: listFrom(text.match(/skills:\s*\[([^\]]*)\]/)?.[1]),
      }
      i += body.length
    }
  }
  return apps
}

function listFrom(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Skill IDs defined by one app's own apps/<app>/.agents/skills/ folder. */
export function appSkillIds(directory: string, app: string): string[] {
  return appSkillFiles(directory, app).map((s) => s.id)
}

/** The app's skill files: id plus absolute path (for registration by oc-skills). */
export function appSkillFiles(directory: string, app: string): { id: string; path: string }[] {
  const base = join(directory, "apps", app, ".agents", "skills")
  if (!existsSync(base)) return []
  const out: { id: string; path: string }[] = []
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(join(base, entry.name, "SKILL.md"))) {
      out.push({ id: entry.name, path: join(base, entry.name, "SKILL.md") })
    } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "SKILL.md") {
      out.push({ id: entry.name.replace(/\.md$/, ""), path: join(base, entry.name) })
    }
  }
  return out
}

/** A SKILL.md split into frontmatter fields and body (the loaded content). */
export function parseSkillFile(path: string): { name?: string; description?: string; content: string } {
  const raw = readFileSync(path, "utf8")
  if (!raw.startsWith("---")) return { content: raw }
  const end = raw.indexOf("\n---", 3)
  if (end === -1) return { content: raw }
  const front = raw.slice(3, end)
  return {
    name: front.match(/^name:\s*(.+)$/m)?.[1]?.trim(),
    description: front.match(/^description:\s*(.+)$/m)?.[1]?.trim(),
    content: raw.slice(end + 4),
  }
}

/** Every app name under apps/ that has its own .agents/skills folder. */
export function appsWithSkills(directory: string): string[] {
  const appsDir = join(directory, "apps")
  if (!existsSync(appsDir)) return []
  return readdirSync(appsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(appsDir, e.name, ".agents", "skills")))
    .map((e) => e.name)
}

/** Primary-gateway skills plus the slice overlay, in stable insertion order without duplicates. */
export function skillsForSession(
  agent: string | undefined,
  record?: SliceRecord,
  frontMatter = "",
  directory = "",
): string[] {
  // Manual utility agents are never attached lifecycle or slice skills, even
  // when their session happens to live in a slice worktree.
  if (agent && (MANUAL_AGENTS as readonly string[]).includes(agent)) return []
  const primary = agent === "plan" || agent === "build" ? PRIMARY_SKILLS[agent] : []
  const skills = new Set<string>(primary)
  if (record) {
    for (const skill of skillsForSlice(record, frontMatter, directory)) skills.add(skill)
  }
  return [...skills]
}

/** The skills a slice session should have loaded, from its record and the repo's front matter. */
export function skillsForSlice(
  record: SliceRecord,
  frontMatter: string,
  directory: string,
): string[] {
  const skills = new Set<string>(BASE_SKILLS)
  const apps = parseApps(frontMatter)
  for (const label of record.labels ?? []) {
    const fixed = LABEL_SKILLS[label]
    if (fixed) {
      for (const s of fixed) skills.add(s)
      continue
    }
    if (!label.startsWith("area:")) continue
    const app = label.slice("area:".length)
    if (RESERVED_AREAS.has(app)) continue
    const entry = apps[app]
    if (entry?.skills?.length) {
      for (const s of entry.skills) skills.add(s)
    } else if (entry?.kind && KIND_DEFAULTS[entry.kind]) {
      for (const s of KIND_DEFAULTS[entry.kind]!) skills.add(s)
    }
    for (const s of appSkillIds(directory, app)) skills.add(s)
  }
  return [...skills]
}
