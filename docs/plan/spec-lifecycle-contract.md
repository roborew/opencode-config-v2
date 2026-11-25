# Spec: lifecycle-contract

Module id: `lifecycle-contract`
Depends on: —
Approved map: `capability-map-lifecycle-assurance.md` (pending Robin's approval)

## Objective

Create one small, framework-neutral lifecycle contract that makes Addy's skills mandatory when their triggers apply and explicitly not applicable otherwise. Replace the current distinction between a tested list of skill names and unproven runtime use with testable ownership, trigger-specific activation and evidence rules.

The contract covers all 25 vendored Addy skills without making all 25 unconditional and without restricting a skill to one phase:

- **Always:** `using-agent-skills` and the applicable OC gateway.
- **Define/Plan:** `interview-me` and `spec-driven-development` for a new significant initiative; `idea-refine` for a declared/observed vague idea; `planning-and-task-breakdown` after spec approval; `constraint-driven-development` for a missing/weakening quality bar.
- **Build core:** `incremental-implementation`, `test-driven-development`, `context-engineering`, `git-workflow-and-versioning` and `oc-sandbox` for every slice.
- **Build/Verify context:** component/risk skills, `api-and-interface-design`, `frontend-ui-engineering`, `source-driven-development`, `doubt-driven-development`, `browser-testing-with-devtools`, `debugging-and-error-recovery`, `deprecation-and-migration`, `ci-cd-and-automation`, `security-and-hardening`, `observability-and-instrumentation` and `performance-optimization` when their triggers apply. Security, observability and interface design must activate during implementation when needed, not wait for final-diff review.
- **Review:** `code-review-and-quality` and `code-simplification` for every slice; `security-and-hardening`, `performance-optimization` and other contextual workflows again when their triggers apply.
- **Ship:** documentation reconciliation for every slice, invoking `documentation-and-adrs` only when a durable decision/context trigger applies; `shipping-and-launch` only for actual release, rollout, monitoring or rollback work. PR delivery alone is not production launch.

### Two trigger lanes

1. **Mechanical triggers** come from lifecycle phase, labels, repository facts, observed edits/tool outcomes/failures and final-diff reconciliation. They can be evaluated deterministically and tested.
2. **Declared judgment triggers** include idea vagueness, official-documentation need, high-stakes/unfamiliar decisions, performance requirements and durable-decision needs. Define/Plan records them with reasons. When new context makes applicability ambiguous, the worker calls `slice_block` for a coordinator/human decision; neither the model nor plugin may silently answer N/A.

A slice's standard template carries a compact **Lifecycle workflows** declaration containing only additional contextual workflows and their reasons. Core and mandatory Review workflows are implied by the template. `None beyond core; revalidate against the final diff` is valid only after the semantic declaration has been considered. Existing `area:*`/`risk:*` labels and `AGENTS.md` facts remain primary metadata; do not duplicate them in prose.

The app contract also declares intended PR reviewers and their check identities where enabled. This is repository fact, not a global hardcoding of Kilo or CodeRabbit.

### Approval and handoff records

The Plan gateway uses durable records for existing human gates:

1. A dated spec-PR approval identifying the exact spec SHA.
2. A separate PRD approval identifying the exact numbered-breakdown revision/digest and spec SHA before slice issues are created.
3. Every requirement deferred for later activation/deployment copied into a named target issue's acceptance criteria before source-slice closure.

Approval timestamps must precede issue creation, stale/superseded approvals are invalid, and bot identities are rejected. Agents retrieve approval evidence read-only and may not create/edit approval records through agent tools; Robin records approvals outside those tools. A shared GitHub account name alone is not cryptographic proof of human authorship, so the flow must not claim more provenance than it can establish.

Standalone maintenance slices remain lightweight and do not acquire a manufactured product spec or PRD.

## Tech Stack

- TypeScript policy data and pure helpers in the existing config plugin seam.
- Existing OC gateway and `oc-github` Markdown workflows/templates.
- Existing app `AGENTS.md` front matter and issue labels.
- No new runtime dependency or application framework assumption.

## Commands

```text
npm install
npm test
npm run typecheck
```

Focused contract verification:

```text
npm test -- tests/lifecycle-policy.test.ts tests/addy-skill-coverage.test.ts
```

## Project Structure

```text
plugins/shared/lifecycle-policy.ts        # canonical compact policy and pure evaluation helpers
plugins/oc-skills/                        # consumes policy in the next module
skills/oc/oc-plan-gateway/SKILL.md         # durable approvals and workflow declaration
skills/oc/oc-github/templates/            # standard slice/PR handoffs
templates/repo/AGENTS.md                  # repository facts, including intended reviewers where enabled
AGENTS.md                                 # high-level lifecycle only; no duplicate trigger router
commands/                                 # entry points defer to gateways
tests/lifecycle-policy.test.ts            # trigger/evidence/25-skill coverage tests
tests/addy-skill-coverage.test.ts         # ownership and documentation invariants
docs/plan/                                # this initiative's specification and plan
```

## Code Style

Prefer a small declarative table over a general workflow engine. Each skill has one primary owner and one or more activation entries; a rule contains no project name or framework command.

```ts
{
  skill: "security-and-hardening",
  trigger: "security-sensitive",
  activateAt: ["build", "review"],
  evidence: "workflow-and-specialist",
}
```

- Stable Addy skill IDs; no aliases or duplicate skill registry.
- Pure, deterministic evaluation from declared context and observed events.
- Judgment-based triggers are explicit declarations/decisions, not inferred from paths by a classifier.
- Framework-specific path/glob knowledge stays in app `AGENTS.md` facts.
- The policy owns triggers/evidence; gateways own only phase transitions and human handoffs.

## Testing Strategy

- Assert all 25 Addy skills have exactly one primary owner and at least one activation entry with phase, trigger and evidence class.
- Exercise every mechanical trigger with positive and explicit not-applicable fixtures.
- Exercise declared judgment triggers and ambiguous-context blocking; prove no semantic classifier invents N/A.
- Prove a missing label cannot suppress a mechanically visible trigger.
- Test new initiative, approved-spec planning and standalone maintenance separately.
- Test exact-SHA/revision approval, timestamp, stale/bot rejection and deferral formats with read-only recorded fixtures.
- Use temporary repositories and recorded issue contexts; no live GitHub writes.

## Boundaries

- **Always:** cover every applicable Addy skill and record explicit not-applicable decisions.
- **Always:** preserve two human Plan approvals and human merge control.
- **Always:** reconcile declared workflows with uncommitted changes and the actual final diff.
- **Ask first:** before adding metadata that duplicates an existing label or app fact.
- **Ask first:** before changing active legacy slices, live GitHub records or approval provenance requirements.
- **Never:** add project-specific framework rules, app code, semantic guesswork or a 25-item issue checklist.
- **Never:** edit vendored `skills/addy/`, let agents author approval evidence or infer human approval from bots.

## Success Criteria

- One canonical machine-readable policy covers all 25 Addy skills, multi-phase activation and evidence requirements.
- Every newly created slice has a compact lifecycle declaration derived from its approved spec and repository facts.
- Plan issue creation rejects missing, stale, superseded or bot-authored approval evidence once runtime guards are enabled.
- A missing label/stale declaration produces explicit reconciliation or a block, never silent omission.
- Every activation/deployment deferral has a linked target acceptance criterion before closure.
- Human gateways contain no duplicate trigger table; CI validates their phase/handoff references against the policy.

## Open Questions

1. Robin to confirm that mechanical outcome/artifact evidence is the intended enforcement boundary; no plugin can prove every semantic judgment inside a skill.
2. Robin to confirm that active legacy slices and watches receive one-time fail-closed reconciliation rather than a permanent legacy bypass.
3. Robin to confirm the operational approval-provenance boundary above, or request a stronger external human-approval mechanism as a separate initiative.

## Sources

- Addy's phase and skill ownership: <https://skills.addy.ie/lifecycle/>
- Existing decisions D2, D25 and D26 in `docs/plan/decisions.md`; ADRs 0006 and 0012.
