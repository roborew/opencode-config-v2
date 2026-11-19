import { existsSync, readFileSync, readdirSync } from "node:fs"
import { parse } from "jsonc-parser"
import { describe, expect, it } from "vitest"

const config = parse(readFileSync("opencode.jsonc", "utf8")) as {
  agents?: Record<string, { permissions?: { action: string; resource: string; effect: string }[] }>
}

function allowedSkills(agent: string): Set<string> {
  return new Set(
    (config.agents?.[agent]?.permissions ?? [])
      .filter((rule) => rule.action === "skill" && rule.effect === "allow")
      .map((rule) => rule.resource),
  )
}

const plan = allowedSkills("plan")
const build = allowedSkills("build")
const eitherPrimary = new Set([...plan, ...build])
const routingContract = [
  "AGENTS.md",
  "skills/oc/oc-plan-gateway/SKILL.md",
  "skills/oc/oc-build-gateway/SKILL.md",
]
  .filter(existsSync)
  .map((path) => readFileSync(path, "utf8"))
  .join("\n")

const addySkills = readdirSync("skills/addy", { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(`skills/addy/${entry.name}/SKILL.md`))
  .map((entry) => entry.name)

describe("vendored Addy skill coverage", () => {
  it("still vendors the complete upstream set", () => {
    expect(addySkills).toHaveLength(25)
  })

  for (const id of addySkills) {
    it(`${id} has a primary-agent permission and an activation rule`, () => {
      expect(eitherPrimary, `${id} is not permitted for Plan or Build`).toContain(id)
      expect(routingContract, `${id} has no activation rule in a gateway or AGENTS.md`).toContain(id)
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
    expect(buildGateway).toContain("`/build` and bare Build execute this same algorithm")
    expect(buildGateway).toContain("status:cleanup-pending")
    expect(buildGateway).toContain("Reconcile verified merges")
    expect(buildGateway).toContain("Synchronize every active slice")
    expect(buildGateway).toContain("Recover and dispatch")
  })
})
