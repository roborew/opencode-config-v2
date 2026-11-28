import { readFileSync, readdirSync } from "node:fs"
import { parse } from "jsonc-parser"
import { describe, expect, it } from "vitest"

const agents = readFileSync("AGENTS.md", "utf8")
const section = agents.split("## Code index (when available)")[1]?.split("\n## ")[0] ?? ""

describe("code-index agent guidance", () => {
  it("is conditional on the tools being present and names the right tools", () => {
    expect(section).not.toBe("")
    expect(section).toMatch(/If `code-index_\*` tools are present/)
    for (const tool of ["index_status", "index_repository", "search_graph", "trace_path", "grep"]) {
      expect(section).toContain(tool)
    }
    expect(section).toMatch(/If the tools are absent, carry on/)
  })

  it("names no Matt skill", () => {
    const mattSkills = ["engineering", "productivity"].flatMap((group) =>
      readdirSync(`skills/matt/${group}`, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    )
    expect(mattSkills.length).toBeGreaterThan(0)
    for (const skill of mattSkills) expect(section).not.toMatch(new RegExp(`\\b${skill}\\b`))
  })

  it("stays out of the lifecycle policy and gateways", () => {
    for (const file of [
      "plugins/shared/lifecycle-policy.ts",
      ...readdirSync("skills/oc", { recursive: true, encoding: "utf8" })
        .filter((path) => path.endsWith("SKILL.md"))
        .map((path) => `skills/oc/${path}`),
    ]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/code-index/)
    }
  })
})

describe("Mac config (SC 5d)", () => {
  it("declares no code-index MCP server: it exists only in the server override", () => {
    const config = parse(readFileSync("opencode.jsonc", "utf8")) as {
      mcp?: { servers?: Record<string, unknown> }
    }
    expect(Object.keys(config.mcp?.servers ?? {})).not.toContain("code-index")
    expect(readFileSync("opencode.jsonc", "utf8")).not.toMatch(/code-index/)
  })
})
