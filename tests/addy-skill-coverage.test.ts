import { existsSync, readFileSync, readdirSync } from "node:fs"
import { parse, type ParseError } from "jsonc-parser"
import { describe, expect, it } from "vitest"
import { LIFECYCLE_POLICY, PLAN_APPROVAL_GATES } from "../plugins/shared/lifecycle-policy"

type Config = {
  agents?: Record<string, { permissions?: { action: string; resource: string; effect: string }[] }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseConfig(text: string): Config {
  const errors: ParseError[] = []
  const value = parse(text, errors) as unknown
  if (errors.length > 0) throw new Error(`opencode.jsonc is malformed: ${errors.length} parse error(s)`)
  if (!isRecord(value)) throw new Error("opencode.jsonc must be an object")
  const agents = value.agents
  if (agents === undefined) return value as Config
  if (!isRecord(agents)) throw new Error("opencode.jsonc agents must be an object")
  for (const [id, definition] of Object.entries(agents)) {
    if (!isRecord(definition)) throw new Error(`agent '${id}' must be an object`)
    if (definition.permissions === undefined) continue
    if (!Array.isArray(definition.permissions)) throw new Error(`agent '${id}' permissions must be an array`)
    for (const rule of definition.permissions) {
      if (!isRecord(rule)) throw new Error(`agent '${id}' permission rules must be objects`)
      for (const field of ["action", "resource", "effect"]) {
        if (typeof rule[field] !== "string") throw new Error(`agent '${id}' permission '${field}' must be a string`)
      }
    }
  }
  return value as Config
}

const config = parseConfig(readFileSync("opencode.jsonc", "utf8"))

function allowedSkills(agent: string): Set<string> {
  return new Set(
    (config.agents?.[agent]?.permissions ?? [])
      .filter((rule) => rule.action === "skill" && rule.effect === "allow")
      .map((rule) => rule.resource),
  )
}

const plan = allowedSkills("plan")
const build = allowedSkills("build")
const policySkills = LIFECYCLE_POLICY.map((entry) => entry.skill).sort()

const addySkills = readdirSync("skills/addy", { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(`skills/addy/${entry.name}/SKILL.md`))
  .map((entry) => entry.name)

describe("strict config parsing", () => {
  it("rejects malformed JSONC before using its partial object", () => {
    expect(() => parseConfig('{"agents":{}} trailing-garbage')).toThrow("malformed")
  })

  it("validates agent permission structure", () => {
    expect(() => parseConfig('{"agents":{"build":{"permissions":"allow all"}}}')).toThrow("permissions must be an array")
    expect(() => parseConfig('{"agents":{"build":{"permissions":[{"action":"skill"}]}}}')).toThrow("'resource' must be a string")
  })
})

describe("vendored Addy skill coverage", () => {
  it("vendors Addy skills from the pinned upstream set", () => {
    expect(addySkills.length).toBeGreaterThan(0)
  })

  it("covers every vendored skill in the canonical lifecycle policy", () => {
    expect(policySkills).toEqual([...addySkills].sort())
  })

  for (const { skill, owner } of LIFECYCLE_POLICY) {
    it(`${skill} has the permission required by its primary owner`, () => {
      if (owner === "plan" || owner === "shared") expect(plan).toContain(skill)
      if (owner === "build" || owner === "shared") expect(build).toContain(skill)
    })
  }

  it("automatically makes Addy skill discovery available in both primary modes", () => {
    expect(plan).toContain("using-agent-skills")
    expect(build).toContain("using-agent-skills")
  })

  it("exposes each primary gateway on disk and to its own agent only", () => {
    for (const [agent, id] of [["plan", "oc-plan-gateway"], ["build", "oc-build-gateway"]] as const) {
      expect(existsSync(`skills/oc/${id}/SKILL.md`)).toBe(true)
      expect(allowedSkills(agent)).toContain(id)
      const other = agent === "plan" ? build : plan
      expect(other).not.toContain(id)
    }
  })

  it("makes conditional quality and launch workflows available to Build", () => {
    expect(build).toContain("constraint-driven-development")
    expect(build).toContain("shipping-and-launch")
  })
})

describe("lifecycle handoff contract", () => {
  const planGateway = readFileSync("skills/oc/oc-plan-gateway/SKILL.md", "utf8")
  const github = readFileSync("skills/oc/oc-github/SKILL.md", "utf8")
  const slice = readFileSync("skills/oc/oc-github/templates/slice.md", "utf8")
  const repoAgents = readFileSync("templates/repo/AGENTS.md", "utf8")

  it("records both Plan approvals at their exact revisions, read-only", () => {
    expect(planGateway).toContain("SPEC-APPROVED: <spec path> @ <full commit SHA>")
    expect(planGateway).toContain("BREAKDOWN-APPROVED: <sha256> @ <full spec commit SHA>")
    expect(planGateway).toContain("Never write, edit, or manufacture this record")
    expect(planGateway).toContain("missing, stale, superseded, bot-authored, or digest-mismatched")
    expect(github).toContain("Approval evidence is read-only to agents")
  })

  it("keeps slice lifecycle declarations compact and deferrals targeted", () => {
    expect(slice).toContain("## Lifecycle workflows")
    expect(slice).toContain("additional contextual Addy workflows only")
    expect(slice).toContain("Never omit\n     a declared judgment trigger")
    expect(slice).toContain("## Deferred requirements")
    expect(slice).toContain("requirement — target issue #N — target acceptance criterion")
    expect(github).toContain("Before closing a source slice")
    expect(github).toContain("acceptance criteria")
  })

  it("declares repository reviewer facts only where reviewers are enabled", () => {
    expect(repoAgents).toContain("review:")
    expect(repoAgents).toContain("exact check name")
    expect(repoAgents).toContain("name only reviewers actually enabled")
  })

  it("keeps trigger policy out of gateway and global prose", () => {
    const global = readFileSync("AGENTS.md", "utf8")
    const buildGateway = readFileSync("skills/oc/oc-build-gateway/SKILL.md", "utf8")

    expect(planGateway).not.toContain("| Context")
    expect(planGateway).toContain("plugins/shared/lifecycle-policy.ts` owns every Addy trigger")
    expect(buildGateway).not.toContain("| Context")
    expect(buildGateway).toContain("owns the canonical trigger and evidence")
    expect(global).not.toContain("| Trigger")
    expect(global).toContain("do not maintain a second trigger table")
  })
})

describe("collapsed Plan approval gates", () => {
  const planGateway = readFileSync("skills/oc/oc-plan-gateway/SKILL.md", "utf8")

  it("uses the canonical timestamp-free formats from the lifecycle policy", () => {
    for (const gate of PLAN_APPROVAL_GATES) {
      expect(planGateway).toContain(gate.format)
      expect(gate.format).toContain(gate.keyword)
      expect(gate.format).not.toMatch(/ISO-8601|<ISO|timestamp/i)
    }
    expect(planGateway).not.toContain("<ISO-8601 timestamp>")
  })

  it("posts labelled agent-authored requests that are not approval evidence", () => {
    for (const gate of PLAN_APPROVAL_GATES) {
      expect(gate.requestLabel).toContain("APPROVAL-REQUEST")
      expect(gate.requestLabel).not.toContain("APPROVED")
      expect(planGateway).toContain(gate.requestLabel)
    }
    expect(planGateway).toContain("never include the approval keyword in the request body")
    expect(planGateway).toContain("This record is never approval evidence")
    expect(planGateway).toContain("Robin never copies a template")
  })

  it("starts a read-only watcher at both gates without replacing read-back", () => {
    const [definePart, afterDefine] = planGateway.split("## 2. Plan vertical slices")
    const [breakdownSteps] = afterDefine.split("## Gate watcher")

    expect(definePart).toContain("read-only background **Gate watcher**")
    expect(breakdownSteps).toContain("read-only background **Gate watcher**")
    expect(planGateway).toContain("GATE APPROVAL PRESENT")
    expect(planGateway).toContain("WATCHER EXPIRED")
    expect(planGateway).toContain("never replaces the mandatory read-back verification")
    expect(planGateway).toContain("Session-lifetime limitation")
  })

  it("collapses the spec gate to one approval and keeps the PRD off the gate list", () => {
    expect(planGateway).toContain("single `SPEC-APPROVED` comment")
    expect(planGateway).toContain("No chat approval round-trip remains")
    expect(planGateway).toContain("**The PRD is not a gate**")
    expect(planGateway).toContain("Exactly two one-line comments from Robin per feature, total")
    expect(planGateway).toContain("create issues in dependency order")
  })

  it("scopes the global push rule to issues, merges and main", () => {
    const agents = readFileSync("AGENTS.md", "utf8")

    expect(agents).toContain("No GitHub issues are opened before the user explicitly approves")
    expect(agents).toContain("branch and its PR are the review surface and may be opened before approval")
    expect(agents).toContain("never merge")
    expect(agents).toContain("never push to `main`")
    expect(agents).not.toContain("Nothing is pushed or published")
  })
})

describe("gateway lifecycle invariants", () => {
  it("does not let an existing PRD bypass linked-spec approval", () => {
    const planGateway = readFileSync("skills/oc/oc-plan-gateway/SKILL.md", "utf8")
    expect(planGateway).toContain("PRD verifiably linked to an approved spec")
    expect(planGateway).toContain("cannot prove that its spec was approved")
  })

  it("limits Plan read-only drafting without prohibiting required Define outputs", () => {
    const command = readFileSync("commands/plan.md", "utf8")
    expect(command).toContain("Only **slice drafting** is read-only")
    expect(command).toContain("does not prohibit Define's required spec writes")
  })

  it("keeps the full coordinator algorithm available in bare Build", () => {
    const buildGateway = readFileSync("skills/oc/oc-build-gateway/SKILL.md", "utf8")
    expect(buildGateway).toContain("Both entry modes execute this same algorithm")
    expect(buildGateway).toContain("status:cleanup-pending")
    expect(buildGateway).toContain("Reconcile verified merges")
    expect(buildGateway).toContain("Synchronize every active slice")
    expect(buildGateway).toContain("Recover and dispatch")
  })
})
