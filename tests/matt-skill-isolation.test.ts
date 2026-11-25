import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { parse } from "jsonc-parser"
import { describe, expect, it } from "vitest"
import { LIFECYCLE_POLICY } from "../plugins/shared/lifecycle-policy"

type Config = {
  agents?: Record<string, { permissions?: { action: string; resource: string; effect: string }[] }>
}

type Manifest = { version: string; skills: string[] }

const mattRoot = "skills/matt"
const manifest = JSON.parse(
  readFileSync(`${mattRoot}/.claude-plugin/plugin.json`, "utf8"),
) as Manifest

const manifestEntries = manifest.skills.map((entry) => {
  const match = entry.match(/^\.\/skills\/(engineering|productivity)\/([a-z0-9-]+)$/)
  if (!match) throw new Error(`Unexpected production manifest entry: ${entry}`)
  return { group: match[1]!, id: match[2]! }
})

const manifestIds = manifestEntries.map((entry) => entry.id).sort()

function skillDirs(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
}

const vendoredIds = [
  ...skillDirs(`${mattRoot}/engineering`),
  ...skillDirs(`${mattRoot}/productivity`),
].sort()

function parseConfig(): Config {
  const errors: unknown[] = []
  const value = parse(readFileSync("opencode.jsonc", "utf8"), errors as never) as unknown
  if (errors.length > 0) throw new Error("opencode.jsonc is malformed")
  if (typeof value !== "object" || value === null) throw new Error("opencode.jsonc must be an object")
  return value as Config
}

const config = parseConfig()

function configuredSkills(agent: string): Map<string, string> {
  const permissions = config.agents?.[agent]?.permissions ?? []
  return new Map(
    permissions
      .filter((rule) => rule.action === "skill")
      .map((rule) => [rule.resource, rule.effect]),
  )
}

function markdownSkillPermissions(path: string): Map<string, string> {
  const text = readFileSync(path, "utf8")
  const permissions = new Map<string, string>()
  const rules = text.matchAll(
    /-\s+action:\s+skill\s*\n\s+resource:\s+"?([^"\n]+)"?\s*\n\s+effect:\s+(allow|deny|ask)/g,
  )
  for (const rule of rules) permissions.set(rule[1]!, rule[2]!)
  return permissions
}

function allowed(permissions: Map<string, string>): Set<string> {
  return new Set(
    [...permissions].filter(([, effect]) => effect === "allow").map(([resource]) => resource),
  )
}

const mattPermissions = markdownSkillPermissions("agents/matt.md")
const adminPermissions = markdownSkillPermissions("agents/skill-admin.md")

describe("vendored Matt production skills", () => {
  it("matches the release production manifest exactly", () => {
    expect(manifest.version).toBe("1.3.2")
    expect(vendoredIds).toEqual(manifestIds)
    expect(new Set(vendoredIds).size).toBe(vendoredIds.length)
  })

  it("vendors every promoted skill completely", () => {
    for (const { group, id } of manifestEntries) {
      const root = `${mattRoot}/${group}/${id}`
      expect(existsSync(`${root}/SKILL.md`), `${id} has no SKILL.md`).toBe(true)
      expect(existsSync(`${root}/agents/openai.yaml`), `${id} has no agents/openai.yaml`).toBe(true)
    }
    expect(existsSync(`${mattRoot}/UPSTREAM.md`)).toBe(true)
    expect(existsSync(`${mattRoot}/LICENSE`)).toBe(true)
  })

  it("pins a stable release to a full commit", () => {
    const upstream = readFileSync(`${mattRoot}/UPSTREAM.md`, "utf8")
    expect(upstream).toContain("Release: `v1.3.2`")
    expect(upstream).toContain("Commit: `d1478fcb140db0b93c0c8df17bcfd311844749d0`")
    expect(upstream).toContain("Matt-Sync: <sha>")
  })

  it("excludes beta, frozen and deprecated skill trees", () => {
    for (const excluded of ["in-progress", "misc", "deprecated"]) {
      expect(existsSync(`${mattRoot}/${excluded}`), `${excluded} must not be vendored`).toBe(false)
    }
  })

  it("resolves every operative Skill-tool reference inside the production set", () => {
    const referenced = new Set<string>()
    for (const { group, id } of manifestEntries) {
      const text = readFileSync(`${mattRoot}/${group}/${id}/SKILL.md`, "utf8")
      for (const match of text.matchAll(/Skill tool[^\n]*?"([a-z0-9-]+)"/g)) {
        referenced.add(match[1]!)
      }
    }
    for (const id of referenced) expect(manifestIds, `missing helper ${id}`).toContain(id)
  })

  it("does not collide with Addy or OC skill IDs", () => {
    const otherIds = [...skillDirs("skills/addy"), ...skillDirs("skills/oc")]
    expect(manifestIds.filter((id) => otherIds.includes(id))).toEqual([])
  })
})

describe("manual-only OpenCode integration", () => {
  it("exposes one Matt workflow command and only the combined sync command", () => {
    const command = readFileSync("commands/matts-skills.md", "utf8")
    expect(command).toContain("agent: matt")
    expect(command).toContain("@ask-matt")
    expect(command).toContain("$ARGUMENTS")
    expect(command).toContain("Stop and wait")

    for (const id of manifestIds) {
      expect(existsSync(`commands/${id}.md`), `${id} must not have its own slash command`).toBe(false)
    }

    const sync = readFileSync("commands/sync-skills.md", "utf8")
    expect(sync).toContain("agent: skill-admin")
    expect(sync).toContain("@skills-sync")
  })

  it("lets only the Matt utility agent load the production workflows", () => {
    expect(allowed(mattPermissions)).toEqual(new Set(manifestIds))
    expect(mattPermissions.get("*")).toBe("deny")

    for (const id of manifestIds) {
      expect(configuredSkills("plan").has(id), `Plan can load ${id}`).toBe(false)
      expect(configuredSkills("build").has(id), `Build can load ${id}`).toBe(false)
    }
  })

  it("keeps synchronization in its own utility agent", () => {
    expect(allowed(adminPermissions)).toEqual(new Set(["skills-sync", "addy-sync", "matt-sync"]))
    expect(adminPermissions.get("*")).toBe("deny")
    for (const id of manifestIds) expect(allowed(adminPermissions)).not.toContain(id)
  })

  it("keeps Addy's canonical lifecycle free of Matt routing", () => {
    for (const entry of LIFECYCLE_POLICY) expect(manifestIds).not.toContain(entry.skill)

    const plugin = ["plugins/oc-skills/index.ts", "plugins/oc-skills/skills.ts"]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
    const gateways = [
      "skills/oc/oc-plan-gateway/SKILL.md",
      "skills/oc/oc-build-gateway/SKILL.md",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")

    expect(plugin).not.toContain("skills/matt")
    expect(gateways).not.toMatch(/\bmatt\b/i)
    for (const id of manifestIds) {
      expect(plugin).not.toMatch(new RegExp(`["'\`]${id}["'\`]`))
      expect(gateways).not.toContain(`@${id}`)
      expect(gateways).not.toContain(`${id}/SKILL`)
    }
  })

  it("keeps the Addy sync and new sync adapters isolated from lifecycle permissions", () => {
    for (const id of ["skills-sync", "addy-sync", "matt-sync"]) {
      expect(configuredSkills("plan").has(id), `Plan can load ${id}`).toBe(false)
      expect(configuredSkills("build").has(id), `Build can load ${id}`).toBe(false)
    }
  })
})
