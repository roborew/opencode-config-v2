/**
 * Canonical Addy lifecycle policy.
 *
 * Mechanical triggers are derived from lifecycle phase, labels, repository
 * facts, observed events and diffs. Declared triggers require an explicit
 * Define/Plan decision; missing or ambiguous declarations fail closed.
 * Evidence records what proves an activation, not merely that a tool returned.
 */

export const LIFECYCLE_PHASES = ["define", "plan", "build", "verify", "review", "ship"] as const
export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number]
export type ActivationPhase = LifecyclePhase | "all"

export type TriggerLane = "mechanical" | "declared"

export const TRIGGER_LANES = {
  always: "mechanical",
  "new-initiative": "mechanical",
  "vague-idea": "declared",
  "quality-bar-missing": "declared",
  "checks-weakening": "declared",
  "approved-spec": "mechanical",
  "contract-change": "mechanical",
  "ui-change": "mechanical",
  "browser-flow": "mechanical",
  "every-slice": "mechanical",
  "framework-uncertainty": "declared",
  "high-stakes": "declared",
  failure: "mechanical",
  "every-review": "mechanical",
  "security-sensitive": "mechanical",
  "performance-requirement": "declared",
  "schema-change": "mechanical",
  "ci-change": "mechanical",
  "production-observability": "declared",
  "durable-decision": "declared",
  "launch-work": "declared",
} as const satisfies Record<string, TriggerLane>

export type TriggerId = keyof typeof TRIGGER_LANES

export const EVIDENCE_KINDS = [
  "attached",
  "validated-outcome",
  "artifact",
  "outcome-and-artifact",
  "specialist-and-artifact",
  "human-approval",
] as const

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]
export type PrimaryOwner = "plan" | "build" | "shared"

export interface SkillActivation {
  readonly phase: ActivationPhase
  readonly trigger: TriggerId
  readonly evidence: EvidenceKind
}

export interface LifecycleSkillPolicy {
  readonly skill: string
  readonly owner: PrimaryOwner
  readonly activations: readonly SkillActivation[]
}

export const LIFECYCLE_POLICY: readonly LifecycleSkillPolicy[] = [
  {
    skill: "using-agent-skills",
    owner: "shared",
    activations: [{ phase: "all", trigger: "always", evidence: "attached" }],
  },
  {
    skill: "interview-me",
    owner: "plan",
    activations: [{ phase: "define", trigger: "new-initiative", evidence: "artifact" }],
  },
  {
    skill: "idea-refine",
    owner: "plan",
    activations: [{ phase: "define", trigger: "vague-idea", evidence: "artifact" }],
  },
  {
    skill: "spec-driven-development",
    owner: "plan",
    activations: [{ phase: "define", trigger: "new-initiative", evidence: "artifact" }],
  },
  {
    skill: "constraint-driven-development",
    owner: "shared",
    activations: [
      { phase: "define", trigger: "quality-bar-missing", evidence: "artifact" },
      { phase: "review", trigger: "checks-weakening", evidence: "artifact" },
    ],
  },
  {
    skill: "planning-and-task-breakdown",
    owner: "plan",
    activations: [{ phase: "plan", trigger: "approved-spec", evidence: "artifact" }],
  },
  {
    skill: "api-and-interface-design",
    owner: "build",
    activations: [{ phase: "build", trigger: "contract-change", evidence: "artifact" }],
  },
  {
    skill: "frontend-ui-engineering",
    owner: "build",
    activations: [{ phase: "build", trigger: "ui-change", evidence: "artifact" }],
  },
  {
    skill: "browser-testing-with-devtools",
    owner: "build",
    activations: [{ phase: "verify", trigger: "browser-flow", evidence: "validated-outcome" }],
  },
  {
    skill: "incremental-implementation",
    owner: "build",
    activations: [{ phase: "build", trigger: "every-slice", evidence: "attached" }],
  },
  {
    skill: "test-driven-development",
    owner: "build",
    activations: [{ phase: "build", trigger: "every-slice", evidence: "outcome-and-artifact" }],
  },
  {
    skill: "context-engineering",
    owner: "build",
    activations: [{ phase: "build", trigger: "every-slice", evidence: "attached" }],
  },
  {
    skill: "git-workflow-and-versioning",
    owner: "build",
    activations: [
      { phase: "build", trigger: "every-slice", evidence: "attached" },
      { phase: "ship", trigger: "every-slice", evidence: "artifact" },
    ],
  },
  {
    skill: "source-driven-development",
    owner: "build",
    activations: [{ phase: "build", trigger: "framework-uncertainty", evidence: "artifact" }],
  },
  {
    skill: "doubt-driven-development",
    owner: "build",
    activations: [{ phase: "build", trigger: "high-stakes", evidence: "artifact" }],
  },
  {
    skill: "debugging-and-error-recovery",
    owner: "build",
    activations: [{ phase: "verify", trigger: "failure", evidence: "outcome-and-artifact" }],
  },
  {
    skill: "code-review-and-quality",
    owner: "build",
    activations: [{ phase: "review", trigger: "every-review", evidence: "outcome-and-artifact" }],
  },
  {
    skill: "code-simplification",
    owner: "build",
    activations: [{ phase: "review", trigger: "every-review", evidence: "outcome-and-artifact" }],
  },
  {
    skill: "security-and-hardening",
    owner: "build",
    activations: [
      { phase: "build", trigger: "security-sensitive", evidence: "specialist-and-artifact" },
      { phase: "review", trigger: "security-sensitive", evidence: "specialist-and-artifact" },
    ],
  },
  {
    skill: "performance-optimization",
    owner: "build",
    activations: [
      { phase: "build", trigger: "performance-requirement", evidence: "artifact" },
      { phase: "review", trigger: "performance-requirement", evidence: "artifact" },
    ],
  },
  {
    skill: "deprecation-and-migration",
    owner: "build",
    activations: [{ phase: "build", trigger: "schema-change", evidence: "artifact" }],
  },
  {
    skill: "ci-cd-and-automation",
    owner: "build",
    activations: [{ phase: "build", trigger: "ci-change", evidence: "outcome-and-artifact" }],
  },
  {
    skill: "observability-and-instrumentation",
    owner: "build",
    activations: [{ phase: "build", trigger: "production-observability", evidence: "artifact" }],
  },
  {
    skill: "documentation-and-adrs",
    owner: "build",
    activations: [{ phase: "ship", trigger: "durable-decision", evidence: "artifact" }],
  },
  {
    skill: "shipping-and-launch",
    owner: "build",
    activations: [{ phase: "ship", trigger: "launch-work", evidence: "human-approval" }],
  },
]

export type TriggerStatus = "present" | "absent" | "unknown"
export type TriggerFacts = Partial<Record<TriggerId, TriggerStatus>>

export interface SkillRequirement extends SkillActivation {
  readonly skill: string
  readonly owner: PrimaryOwner
  readonly lane: TriggerLane
}

export interface LifecycleEvaluation {
  readonly required: readonly SkillRequirement[]
  readonly ambiguous: readonly SkillRequirement[]
}

/** Evaluation is fail-closed: missing facts are unknown, not not-applicable. */
export function evaluateLifecycle(
  phase: LifecyclePhase,
  facts: TriggerFacts = {},
): LifecycleEvaluation {
  const required: SkillRequirement[] = []
  const ambiguous: SkillRequirement[] = []

  for (const entry of LIFECYCLE_POLICY) {
    for (const activation of entry.activations) {
      if (activation.phase !== "all" && activation.phase !== phase) continue

      const status = activation.trigger === "always"
        ? "present"
        : facts[activation.trigger] ?? "unknown"
      if (status === "absent") continue

      const requirement: SkillRequirement = {
        ...activation,
        skill: entry.skill,
        owner: entry.owner,
        lane: TRIGGER_LANES[activation.trigger],
      }
      if (status === "present") required.push(requirement)
      else ambiguous.push(requirement)
    }
  }

  return { required, ambiguous }
}
