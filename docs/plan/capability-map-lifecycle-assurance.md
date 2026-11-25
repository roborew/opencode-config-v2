# Capability Map: lifecycle assurance

Status: draft for Robin's review. Date: 2026-11-25.
Scope: `opencode-config-v2` only. No application repository is changed by this initiative.

The project lifecycle audits in `docs/project-reports/` are failure evidence, not sources of project-specific requirements. The objective is framework-neutral enforcement of Addy's Define → Plan → Build → Verify → Review → Ship lifecycle.

| Module id            | Responsibility                                                                                                                                                                                                | Depends on           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `lifecycle-contract` | Define one compact policy covering all 25 Addy skills, their owners, trigger-specific activation phases and evidence, plus standard slice declarations and approval/handoff formats                           | —                    |
| `skill-enforcement`  | Extend the existing `oc-skills` plugin so required workflows load or execute at the correct phase, observed outcomes are recorded in a shared versioned evidence store, and premature transitions fail closed | `lifecycle-contract` |
| `delivery-readiness` | Require current-head local verification, review, simplification and applicable specialist evidence before PR delivery; make remote READY consume both local and remote evidence exactly once per stable head  | `skill-enforcement`  |

Build order: `lifecycle-contract` → `skill-enforcement` → `delivery-readiness`

## Contract boundaries

- Every Addy skill has a primary owner and one or more trigger-specific activation entries. Not every skill applies to every task or only one phase.
- Two trigger lanes exist:
  - **Mechanical:** lifecycle phase, labels, repository facts, observed edit/tool/failure events and final-diff reconciliation.
  - **Declared judgment:** vagueness, official-doc need, high-stakes/unfamiliar decisions, performance requirements and durable-decision needs are declared during Define/Plan and reconciled explicitly when new context arises. Ambiguity blocks for a coordinator/human decision; it is never silently classified as not applicable.
- Core slice workflows remain attached as overlays. Phase workflows load when entered. Final-diff reconciliation is a safety net, not the first activation point for Build-time workflows.
- A slice lists only additional contextual workflows and reasons, not a 25-item checklist. Explicit not-applicable decisions replace silent omission.
- Skill attachment alone is not execution evidence. Successful outcome validation, expected artifacts, specialist verdicts and human approval are distinct evidence types.
- One shared, versioned readiness record is readable by `oc-skills` and `oc-pr-monitor`; plugin-private storage is not a shared source of truth.
- Use existing plugins and OpenCode 2.3.0 APIs. Add no orchestration plugin, dependency, model, database or parallel lifecycle.
- CI, Kilo and CodeRabbit remain independent final feedback. The target is no avoidable escaped findings, never suppression of legitimate findings.
- Agents never merge, deploy autonomously, force-push or push directly to `main`.

## Sources

- Addy lifecycle: <https://skills.addy.ie/lifecycle/>
- OpenCode server plugins, sessions, tools, hooks and storage: <https://opencode.ai/docs/build/plugins/server/>
