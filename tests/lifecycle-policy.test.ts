import { existsSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  EVIDENCE_KINDS,
  LIFECYCLE_PHASES,
  LIFECYCLE_POLICY,
  TRIGGER_LANES,
  evaluateLifecycle,
  type EvidenceKind,
  type LifecyclePhase,
  type TriggerId,
  type TriggerStatus,
} from "../plugins/shared/lifecycle-policy"

const vendoredSkills = readdirSync("skills/addy", { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(`skills/addy/${entry.name}/SKILL.md`))
  .map((entry) => entry.name)
  .sort()

const policySkills = LIFECYCLE_POLICY.map((entry) => entry.skill).sort()

describe("canonical lifecycle policy", () => {
  it("covers every vendored Addy skill exactly once", () => {
    expect(policySkills).toEqual(vendoredSkills)
    expect(new Set(policySkills).size).toBe(LIFECYCLE_POLICY.length)
  })

  it("gives every skill one primary owner and at least one complete activation", () => {
    for (const entry of LIFECYCLE_POLICY) {
      expect(["plan", "build", "shared"], entry.skill).toContain(entry.owner)
      expect(entry.activations.length, `${entry.skill} has no activation`).toBeGreaterThan(0)

      for (const activation of entry.activations) {
        const phases = activation.phase === "all" ? LIFECYCLE_PHASES : [activation.phase]
        for (const phase of phases) expect(LIFECYCLE_PHASES).toContain(phase)
        expect(TRIGGER_LANES[activation.trigger], `${entry.skill} has an unknown trigger`).toBeDefined()
        expect(EVIDENCE_KINDS).toContain(activation.evidence)
      }
    }
  })

  it("keeps discovery and the applicable gateway always active", () => {
    const meta = LIFECYCLE_POLICY.find((entry) => entry.skill === "using-agent-skills")
    expect(meta?.owner).toBe("shared")
    expect(meta?.activations).toEqual([{ phase: "all", trigger: "always", evidence: "attached" }])
  })

  it("does not leave a trigger without a real activation", () => {
    const used = new Set(LIFECYCLE_POLICY.flatMap((entry) => entry.activations.map((a) => a.trigger)))
    expect([...used].sort()).toEqual(Object.keys(TRIGGER_LANES).sort())
  })
})

describe("lifecycle evaluation", () => {
  const facts = (values: Partial<Record<TriggerId, TriggerStatus>>) => values

  it("requires core Build workflows and mechanically present context only", () => {
    const result = evaluateLifecycle(
      "build",
      facts({
        "every-slice": "present",
        "security-sensitive": "present",
        "ui-change": "absent",
        "browser-flow": "absent",
        "contract-change": "absent",
        failure: "absent",
        "schema-change": "absent",
        "ci-change": "absent",
        "checks-weakening": "absent",
      }),
    )

    expect(result.required.map((r) => r.skill)).toEqual(
      expect.arrayContaining([
        "using-agent-skills",
        "incremental-implementation",
        "test-driven-development",
        "context-engineering",
        "git-workflow-and-versioning",
        "security-and-hardening",
      ]),
    )
    expect(result.required.map((r) => r.skill)).not.toContain("frontend-ui-engineering")
    expect(result.required.map((r) => r.skill)).not.toContain("browser-testing-with-devtools")
  })

  it("treats a missing or unknown mechanical fact as ambiguous, not absent", () => {
    const result = evaluateLifecycle("build", facts({ "security-sensitive": "absent" }))
    expect(result.ambiguous.some((r) => r.skill === "test-driven-development")).toBe(true)
    expect(result.ambiguous.some((r) => r.skill === "incremental-implementation")).toBe(true)
  })

  it("requires a declared judgment workflow only after an explicit declaration", () => {
    const pending = evaluateLifecycle("build", facts({ "every-slice": "present", "framework-uncertainty": "unknown" }))
    expect(pending.ambiguous.some((r) => r.skill === "source-driven-development")).toBe(true)

    const declared = evaluateLifecycle("build", facts({ "every-slice": "present", "framework-uncertainty": "present" }))
    expect(declared.required.some((r) => r.skill === "source-driven-development")).toBe(true)

    const notNeeded = evaluateLifecycle("build", facts({ "every-slice": "present", "framework-uncertainty": "absent" }))
    expect(notNeeded.required.some((r) => r.skill === "source-driven-development")).toBe(false)
    expect(notNeeded.ambiguous.some((r) => r.skill === "source-driven-development")).toBe(false)
  })

  it("requires review and simplification for every Review phase", () => {
    const result = evaluateLifecycle(
      "review",
      facts({ "every-review": "present", "security-sensitive": "absent", "performance-requirement": "absent" }),
    )
    expect(result.required.map((r) => r.skill)).toEqual(
      expect.arrayContaining(["code-review-and-quality", "code-simplification"]),
    )
    expect(result.required.map((r) => r.skill)).not.toContain("security-and-hardening")
  })

  it("returns the owner and evidence contract with each requirement", () => {
    const result = evaluateLifecycle("review", facts({ "every-review": "present" }))
    const review = result.required.find((r) => r.skill === "code-review-and-quality")
    expect(review).toMatchObject({
      owner: "build",
      phase: "review",
      trigger: "every-review",
      evidence: "outcome-and-artifact",
    })
  })

  it("accepts all phases without leaking phase-inapplicable workflows", () => {
    const phases: LifecyclePhase[] = [...LIFECYCLE_PHASES]
    for (const phase of phases) {
      const result = evaluateLifecycle(phase, facts({ "every-slice": "present", "every-review": "present" }))
      for (const requirement of result.required) expect(requirement.phase === "all" || requirement.phase === phase).toBe(true)
    }
  })
})

describe("evidence kinds", () => {
  it("keeps attachment distinct from a validated outcome", () => {
    const kinds: EvidenceKind[] = [...EVIDENCE_KINDS]
    expect(kinds).toContain("attached")
    expect(kinds).toContain("validated-outcome")
    expect(kinds).toContain("human-approval")
    expect(kinds).not.toContain("completed")
  })
})
