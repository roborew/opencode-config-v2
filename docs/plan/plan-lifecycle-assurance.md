# Implementation Plan: lifecycle assurance

Status: planning only, awaiting Robin's approval. No config behavior, live GitHub state or application code is to change until approval.

## Overview

Harden the shared OpenCode lifecycle so every applicable Addy workflow has a deterministic owner, explicit activation and validated evidence. The implementation uses one compact policy, the existing `oc-skills` hook seam, one shared versioned readiness record, and current-head local/remote readiness. Audit reports inform regression scenarios only; no project special cases enter shared config.

Task list target: this document's ordered local checklist under D10. Do not create GitHub issues or `tasks/plan.md`/`tasks/todo.md` for this initiative. Each implementation task is one approved vertical slice/session and must retain RED/GREEN evidence.

## Architecture Decisions

1. **One policy, not another router.** `plugins/shared/lifecycle-policy.ts` owns skill owners, multi-phase triggers and evidence rules. Gateways own only phase transitions/human handoffs; duplicate trigger tables are removed. Commands/system prompts defer to gateways and contract tests prevent drift.
2. **Two trigger lanes.** Mechanical events/facts are deterministic. Judgment-based triggers are declared during Define/Plan and reconciled explicitly; ambiguity calls `slice_block` instead of inventing N/A.
3. **One shared evidence contract.** A versioned readiness record in the existing canonical slice-store seam is readable by `oc-skills` and `oc-pr-monitor`. Plugin-private storage is not shared truth; no second database or orchestration plugin.
4. **Validated outcomes, not tool completion.** Attachment, invocation, domain outcome, artifact and human approval are distinct. `FAILED`, `VIOLATIONS`, negative verdicts, malformed results and interrupted/background work never pass.
5. **Phase-scoped context.** Core/domain overlays stay attached. Only the current compact requirement is added on primary continuations. All 25 skills are never injected together.
6. **Current-head local + remote quality.** Review, simplification, specialist and gate evidence expires on relevant context/head changes. Every existing watch revalidates shared local evidence for a new head. CI and review bots remain independent final checks.
7. **Simplicity budget.** Prefer one policy module, one small shared evidence contract and existing hooks. A general rules engine, semantic transcript classifier, parallel orchestration tool or large prompt duplication triggers a design stop and simplification.

## Task List

### Phase 1: Lifecycle contract

- [x] **Task 1: Add the canonical multi-phase 25-skill policy**
  - **Description:** Implement typed ownership/activation/evidence data and pure evaluation for mechanical and declared-judgment trigger lanes.
  - **Acceptance:** Every Addy skill has one primary owner and appropriate phase entries; positive, N/A and ambiguous fixtures resolve without semantic guessing or project/framework names.
  - **Verification:** RED policy fixtures then GREEN; `npm test -- tests/lifecycle-policy.test.ts tests/addy-skill-coverage.test.ts`; `npm run typecheck`.
  - **Dependencies:** None.
  - **Files likely touched:** `plugins/shared/lifecycle-policy.ts`, `tests/lifecycle-policy.test.ts`, `tests/addy-skill-coverage.test.ts`.
  - **Estimated scope:** M (3 files).

- [x] **Task 2: Define planning declarations, approval provenance and handoff formats**
  - **Description:** Add the compact Lifecycle workflows declaration, exact-SHA/breakdown-revision approval records, deferral target format and repository reviewer facts. This task defines formats/gateway behavior and pure validators only; mechanical shell guards arrive in Task 5 and closure guards in Task 10.
  - **Acceptance:** Validators reject missing/stale/bot approvals and targetless deferrals; slices list only additional workflows/reasons; Plan's duplicate contextual trigger table is replaced by policy references; agent-authored approval records are prohibited and standalone maintenance stays lightweight.
  - **Verification:** Read-only recorded GitHub fixtures for valid/invalid approvals, reviewer facts and deferrals; focused tests; no live writes.
  - **Dependencies:** Task 1.
  - **Files likely touched:** `skills/oc/oc-plan-gateway/SKILL.md`, `skills/oc/oc-github/SKILL.md`, `skills/oc/oc-github/templates/slice.md`, `templates/repo/AGENTS.md`, `tests/addy-skill-coverage.test.ts`.
  - **Estimated scope:** M (5 files).

- [x] **Task 3: Remove duplicate routing from gateways and commands**
  - **Description:** Keep policy triggers out of prose routers; gateways retain phase transitions/handoffs and commands remain entries into them.
  - **Acceptance:** No second trigger table or claim that attachment equals execution remains; all policy/handoff references pass and context is reduced rather than relocated.
  - **Verification:** `npm test -- tests/addy-skill-coverage.test.ts tests/plugins/oc-skills-routing.test.ts`; config reference validation; `npm run typecheck`.
  - **Dependencies:** Tasks 1-2.
  - **Files likely touched:** `AGENTS.md`, `skills/oc/oc-build-gateway/SKILL.md`, `commands/build.md`, `commands/review.md`, `commands/ship.md`.
  - **Estimated scope:** M (5 files).

### Checkpoint: contract approval

- [x] All 25 skills have tested multi-phase trigger/evidence rules without unconditional injection.
- [x] Approval formats, semantic declarations, standalone maintenance and deferral formats pass recorded fixtures.
- [ ] Robin reviews the contract before runtime enforcement begins.

#### Phase 1 implementation log — 2026-11-25

- Task 1 RED: `tests/lifecycle-policy.test.ts` failed because the policy module did not exist. GREEN: 11 policy tests and 35 coverage/routing tests passed.
- Task 2 GREEN: approval, lifecycle-declaration, reviewer-fact and deferral template contract tests passed.
- Task 3 GREEN: Plan, Build and global prose no longer duplicate the policy trigger table; focused routing tests passed.
- Full checkpoint verification: `npm test` passed 228 tests across 9 files; `npm run typecheck` passed.
- No app repo, live GitHub state, worktree, branch or sandbox was changed.

### Phase 2: Skill enforcement

- [ ] **Task 4: Characterize tool outcomes and add the shared versioned evidence contract**
  - **Description:** Probe registered tool IDs/result payloads with `ctx.tool.list()` and contract tests; implement the shared readiness/evidence schema and validated-outcome helpers in the canonical store seam. Stop if required skill/specialist outcomes are unobservable.
  - **Acceptance:** Passed/failed/negative/malformed/incomplete outcomes are distinguished; restart restores only validated events; spawned-only specialists do not count; monitor-readable schema is versioned.
  - **Verification:** RED payload/ledger fixtures including completed-with-FAILED/VIOLATIONS and negative verdicts, then GREEN; restart/redaction tests; typecheck.
  - **Dependencies:** Checkpoint: contract approval.
  - **Files likely touched:** `plugins/shared/lifecycle-store.ts`, `plugins/shared/slice-store.ts`, `tests/plugins/oc-skills-routing.test.ts`.
  - **Estimated scope:** M (3 files).

- [ ] **Task 5: Wire context/tool hooks and lifecycle transition guards**
  - **Description:** Record attachments/outcomes, add compact next-requirement guidance on primary context calls, guard Plan issue creation and approval-record mutations, and guard initial/recognized-subsequent push, PR creation and monitoring transitions.
  - **Acceptance:** Bare Build and explicit commands enforce equivalently; invalid Plan approvals, agent-authored approval mutations and premature delivery are rejected; unrelated agents/read-only research are unaffected; only recognized allowlisted shell shapes are classified.
  - **Verification:** RED transition/continuation fixtures then GREEN, including approval-mutation and compound-shell refusal; `npm test -- tests/plugins/oc-skills*.test.ts`; typecheck.
  - **Dependencies:** Task 4.
  - **Files likely touched:** `plugins/oc-skills/index.ts`, `plugins/oc-skills/skills.ts`, `tests/plugins/oc-skills-routing.test.ts`, `tests/plugins/oc-skills.test.ts`.
  - **Estimated scope:** M (4 files).

- [ ] **Task 6: Reconcile working-tree context, semantic declarations and legacy state**
  - **Description:** Re-evaluate requirements from declarations, repository facts, uncommitted/untracked/final diffs and observed failures; activate debugging and invalidate relevant evidence; reconcile legacy sessions/watches explicitly.
  - **Acceptance:** Missing labels cannot hide mechanical triggers; semantic ambiguity blocks; failure requires debugging; relevant metadata/working-tree/head changes invalidate state; legacy evidence is never backdated.
  - **Verification:** Security/browser/migration/failure/change/restart/legacy fixtures; bounded-context/performance check; focused tests and typecheck.
  - **Dependencies:** Task 5.
  - **Files likely touched:** `plugins/oc-skills/index.ts`, `plugins/shared/lifecycle-policy.ts`, `tests/plugins/oc-skills-routing.test.ts`, `tests/lifecycle-policy.test.ts`.
  - **Estimated scope:** M (4 files).

### Checkpoint: runtime enforcement

- [ ] Required skills execute at phase/context entry without loading all skills.
- [ ] Missing, failed, negative, stale and restarted evidence states fail closed only at intended transitions.
- [ ] Robin reviews hook behavior, shared schema and context size before pre-PR blocking is enabled.

### Phase 3: Delivery readiness

- [ ] **Task 7: Enforce local review, simplification and applicable specialist verdicts**
  - **Description:** Require Review workflows and `code-reviewer` for every slice, applicable contextual specialists, and correct Critical/Required/Optional handling before delivery.
  - **Acceptance:** Missing/negative evidence blocks; Critical requires fix + fresh gate + fresh approving review; Required defer is recorded and risk-bearing cases require Robin; no-change simplification is valid.
  - **Verification:** Local-review fixtures for every finding/outcome class; focused hook tests; `npm run typecheck`.
  - **Dependencies:** Checkpoint: runtime enforcement.
  - **Files likely touched:** `plugins/oc-skills/index.ts`, `commands/review.md`, `agents/code-reviewer.md`, `tests/plugins/oc-skills-routing.test.ts`.
  - **Estimated scope:** M (4 files).

- [ ] **Task 8: Publish slice-correct local readiness and PR evidence**
  - **Description:** Honor `redgreen_check({slice})` read-only through the worktree registry and publish validated current-head gate/review/documentation outcomes into the shared record and concise PR evidence.
  - **Acceptance:** Coordinator queries inspect the requested slice without checkout changes; shared local readiness is monitor-readable; stale/missing evidence is visible; secrets/excess logs are absent.
  - **Verification:** Main-versus-slice regression, shared-schema/redaction/staleness tests, `npm test -- tests/plugins/oc-sandbox.test.ts`, typecheck.
  - **Dependencies:** Task 7. Task 9 depends on this shared producer contract and is not parallel.
  - **Files likely touched:** `plugins/oc-sandbox/index.ts`, `tests/plugins/oc-sandbox.test.ts`, `plugins/shared/lifecycle-store.ts`, `skills/oc/oc-github/templates/pr.md`, `skills/oc/oc-github/SKILL.md`.
  - **Estimated scope:** M (5 files).

- [ ] **Task 9: Consume local + remote evidence for exact-head READY**
  - **Description:** Extend PR snapshots with head/reviewer data and complete pagination; consume the shared local record, intended reviewer facts and remote CI/threads; deduplicate READY and migrate legacy watches fail closed.
  - **Acceptance:** Stale/pending/skipped/incomplete/negative evidence blocks; repeated polling deduplicates; a direct new head cannot bypass local readiness; existing MERGED/CLOSED/review-cap behavior remains.
  - **Verification:** Recorded GitHub timeline RED/GREEN tests; `npm test -- tests/plugins/oc-pr-monitor*.test.ts`; non-merging integration and legacy-watch fixtures.
  - **Dependencies:** Task 8.
  - **Files likely touched:** `plugins/oc-pr-monitor/lib.ts`, `plugins/oc-pr-monitor/index.ts`, `skills/oc/oc-pr-monitor/SKILL.md`, `tests/plugins/oc-pr-monitor.test.ts`, `tests/plugins/oc-pr-monitor-routing.test.ts`.
  - **Estimated scope:** M (5 files).

- [ ] **Task 10: Enforce documentation, deferral and terminal handoff decisions**
  - **Description:** Reconcile spec/ADR/generated contracts or explicit no-change rationale, invoke documentation skill only when triggered, and make one owner validate deferral targets/terminal state without automatic merge/PRD product decisions.
  - **Acceptance:** Settled spec/generated declarations cannot remain silently stale; targetless deferrals block source closure; merged slices have one terminal status; dirty/unmerged work and diagnostics are preserved.
  - **Verification:** Documentation/deferral/status/cleanup fixtures; existing worktree refusal regressions; focused tests and typecheck.
  - **Dependencies:** Task 9.
  - **Files likely touched:** `plugins/oc-skills/index.ts`, `skills/oc/oc-build-gateway/SKILL.md`, `skills/oc/oc-github/SKILL.md`, `skills/oc/oc-github/templates/pr.md`, `tests/plugins/oc-skills-routing.test.ts`.
  - **Estimated scope:** M (5 files).

### Checkpoint: delivery readiness

- [ ] Initial and subsequent PR delivery cannot bypass missing local current-head quality evidence.
- [ ] Existing watches require shared local + complete remote evidence; CI/Kilo/CodeRabbit remain independent.
- [ ] Documentation, deferrals and terminal state pass generic regression scenarios.

### Phase 4: Simplification and acceptance

- [ ] **Task 11: Perform a separate behavior-preserving simplification pass**
  - **Description:** Review only this initiative's changed code for duplicate routing, oversized hook functions, unnecessary abstractions and repeated context reads. Make no behavior change and mix in no feature work.
  - **Acceptance:** One small policy and shared evidence contract remain; hook adapters are bounded; no second router/store or avoidable full-transcript/diff work remains.
  - **Verification:** Existing tests pass without expectation changes, `npm test`, `npm run typecheck`, and code-reviewer confirms net simplification.
  - **Dependencies:** Checkpoint: delivery readiness.
  - **Files likely touched:** Only implementation files changed by Tasks 1-10; maximum five files, split if more are needed.
  - **Estimated scope:** S-M (task-dependent, ≤5 files).

- [ ] **Task 12: Update durable decisions and run final acceptance**
  - **Description:** Record the lifecycle-enforcement ADR and align blueprint/decisions/glossary with actual behavior, then run full config and recorded end-to-end acceptance.
  - **Acceptance:** Docs match hooks/outcomes/gates; all 25 skills remain covered; standard feature, security/migration feature and standalone maintenance with failure/recovery scenarios pass.
  - **Verification:** `npm test`, `npm run typecheck`, full config CI, recorded prompt→build→review→PR timelines and Robin's manual review. No merge/deploy.
  - **Dependencies:** Task 11.
  - **Files likely touched:** `docs/adr/0016-lifecycle-skill-enforcement.md`, `docs/plan/blueprint.md`, `docs/plan/decisions.md`, `docs/CONTEXT.md`, `docs/plan/README.md`.
  - **Estimated scope:** M (5 files).

### Checkpoint: complete

- [ ] All module success criteria and task verification steps pass.
- [ ] No application repository or vendored Addy file changed.
- [ ] Robin approves any subsequent real-app canary separately; agents never merge or deploy.

## Risks and Mitigations

| Risk                                                | Impact | Mitigation                                                                                                             |
| --------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Attachment/tool completion is mistaken for success  | High   | Separate attachment, invocation, validated outcome, artifact and human evidence; negative/malformed fixtures           |
| Built-in outcomes are unobservable                  | High   | Task 4 capability probe; stop rather than infer from prose/spawn state                                                 |
| Semantic triggers are guessed                       | High   | Declared-judgment lane and `slice_block`; final diff only as safety net                                                |
| Config becomes a second workflow engine             | High   | One policy, one shared evidence contract, existing plugins; separate simplification and stop condition                 |
| Excess context/hook latency                         | Medium | Compact phase guidance, bounded cached metadata, invalidation on all relevant changes                                  |
| Direct pushes/legacy watches bypass local readiness | High   | Recognized-push guards plus monitor revalidation on every new head; fail-closed legacy migration                       |
| Guards block exploration/maintenance                | Medium | Transition-only guards and standalone/read-only fixtures                                                               |
| Review hardening becomes disproportionate           | Medium | Correct Critical/Required policy, conscious Optional decisions, no quotas, separate simplification                     |
| Approval evidence is agent-authored or stale        | High   | Exact revisions, read-only retrieval, prohibited agent-authored approval records, documented shared-account limitation |
| Evidence leaks secrets                              | High   | Bounded redacted output, existing secret exclusions, no `.env` values/full transcripts                                 |

## Open Questions for Robin

1. Approve the enforcement boundary: validated mechanical outcomes plus expected artifacts, while semantic judgment remains declared/reviewed by personas, CI/bots and Robin.
2. Approve one-time fail-closed reconciliation for active legacy slices and watches instead of a legacy exemption.
3. Confirm repository-declared intended reviewers, with Kilo and CodeRabbit required only where enabled and unexplained skips treated as not ready.
4. Confirm the documented approval-provenance boundary, or request a stronger external human-approval mechanism separately.

## Migration and Cleanup Requirements

- New slice issues use the complete template after approval; active slices reconcile once before PR delivery.
- Legacy watch records lacking head/local evidence cannot emit a new READY until reconciled; no historical READY is duplicated or rewritten and no evidence is backdated.
- Existing tool names/schemas remain unless a separately approved additive change is necessary. Prompt/command entry behavior remains compatible.
- Cleanup follows existing verified-merge `slice_finish`; dirty worktrees, unpushed work and diagnostic logs are preserved. No blanket branch/record deletion.
- Rollback disables only the new transition guards while preserving existing prompt attachment, sandbox gates, CI, human approvals and collected evidence. Rollback never weakens pre-existing gates.

## Stop Conditions

Stop and ask Robin before adding a plugin/dependency/database, changing reviewer/deployment/approval policy, inferring unobservable outcomes, classifying semantic ambiguity automatically, introducing project/framework-specific rules, weakening tests/checks/review finding semantics, modifying live GitHub rulesets, expanding into app code or exposing secrets. Never merge, deploy autonomously, force-push or push to `main`.
