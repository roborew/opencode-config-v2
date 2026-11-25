# Spec: delivery-readiness

Module id: `delivery-readiness`
Depends on: `skill-enforcement`
Approved map: `capability-map-lifecycle-assurance.md` (pending Robin's approval)

## Objective

Make local Build/Verify/Review outcomes complete before PR delivery, so GitHub Actions, Kilo and CodeRabbit confirm quality rather than discover avoidable failures. Make READY mean that the exact current head has validated local and remote evidence, with one notification per stable head.

Before initial PR delivery and every guarded subsequent slice push, the current head must have the following evidence. Unrecognized or compound shell push forms are not classified as safe; independently, every new head observed by an existing watch must revalidate this evidence before READY:

1. All declared static checks, tests, applicable generation drift checks and runtime smoke passing through `sandbox_gate`.
2. Valid `redgreen_check` evidence queryable by the requested slice from worker or coordinator.
3. `code-review-and-quality` and `code-simplification` execution, plus a completed approving `code-reviewer` verdict after its findings are addressed.
4. Applicable contextual workflows and specialists only when triggered—for example `security-and-hardening` plus `security-auditor` for security-sensitive work.
5. Every **Critical** finding fixed, followed by fresh verification and a fresh approving current-head review. A **Required** finding is fixed or has a recorded justified defer; any risk-bearing defer requires Robin's explicit decision. Optional/Nit suggestions receive a conscious accept/decline decision, not automatic implementation.
6. A simplification decision. “No change warranted” is valid; simplification preserves behavior and never becomes a rigid line/commit quota.
7. Documentation reconciliation: update spec/decision/generated-contract records where required or record an explicit no-change reason. Invoke `documentation-and-adrs` only when its actual trigger applies.
8. Concise redacted evidence linked from the PR and keyed to head SHA.

The shared versioned readiness record is the contract between local enforcement and `oc-pr-monitor`. Remote READY consumes that record and additionally requires:

- current-head `ci-ok`;
- zero unresolved threads across completely paginated readiness data;
- completed intended current-head reviewers declared by repository facts, including pending-request and `SKIPPED` semantics;
- no old/stale approval, incomplete snapshot or negative local outcome.

An unintended reviewer skip is not readiness. Bot `APPROVED` is never Robin's human approval. READY includes the SHA and is emitted at most once per stable head; a new head rearms it. Legacy watches without current-head/local evidence enter fail-closed reconciliation and emit no new READY until reconciled; historical READY is neither duplicated nor rewritten.

There is no target of zero legitimate Kilo/CodeRabbit comments and no suppression of reviewer feedback. Success is measured by preventable defect classes being caught locally and by absence of stale/duplicate readiness.

## Tech Stack

- Existing `oc-sandbox`, `oc-pr-monitor`, `oc-github`, review personas and shared readiness store.
- GitHub GraphQL head/review/thread/check data and immutable PR head SHAs.
- Existing app `AGENTS.md` reviewer facts and config PR template.
- No new review bot, deployment path or external dependency.

## Commands

```text
npm install
npm test
npm run typecheck
```

Focused readiness verification:

```text
npm test -- tests/plugins/oc-pr-monitor.test.ts tests/plugins/oc-pr-monitor-routing.test.ts tests/plugins/oc-sandbox.test.ts tests/plugins/oc-skills-routing.test.ts
```

## Project Structure

```text
plugins/oc-pr-monitor/                    # current-head local+remote readiness and deduplication
plugins/oc-sandbox/                       # slice-correct RED/GREEN evidence and gate outcomes
plugins/oc-skills/                        # local readiness guard from previous module
plugins/shared/lifecycle-store.ts         # shared versioned readiness contract
plugins/shared/slice-store.ts             # existing shared persistence/locking
skills/oc/oc-pr-monitor/SKILL.md           # READY and legacy-watch semantics
skills/oc/oc-github/templates/pr.md        # concise evidence and documentation decisions
templates/repo/AGENTS.md                  # intended reviewer facts where enabled
commands/review.md                        # local quality/simplification/specialist behavior
agents/code-reviewer.md                   # local checklist only if a gap is found
tests/plugins/                            # recorded GitHub timelines and guard tests
```

## Code Style

- Readiness is a pure predicate over a complete current-head remote snapshot and validated shared local evidence.
- Reviewer identity/check mapping comes from repository facts; shared flow does not hardcode project-specific checks.
- Evidence contains SHA, tool/outcome and artifact links, bounded and redacted.
- Review categories remain distinct: Critical fix/re-review, Required fix/justified defer, Optional conscious decision, Nit optional.

## Testing Strategy

- Reject PR delivery with missing/stale/negative local review, simplification, specialist or gate evidence.
- Require Critical fix + fresh gate + fresh approving review; test Required defer and Robin-required risk exception.
- Accept a complete current-head fixture and invalidate it after one new commit or recognized subsequent push.
- Verify `redgreen_check({slice})` resolves the requested active slice read-only from main.
- Simulate old green head + pending review, stale approval, unintended skip, negative local evidence, incomplete pagination, repeated polling and a new stable head.
- Verify legacy watches fail closed without duplicate/backdated READY.
- Verify redaction and bounded output for sandbox/review artifacts.
- Reuse audit findings only as generic regression classes: stale review, missing local checks, lost deferrals, stale docs and disproportionate review hardening.
- Final acceptance uses temporary repositories/recorded GitHub fixtures; any real-app canary needs separate Robin approval and no autonomous merge.

## Boundaries

- **Always:** rerun local gates/review after changes and bind outcomes to the exact head.
- **Always:** preserve independent CI/reviewer/human gates and existing review-cap escape.
- **Always:** paginate every readiness-relevant collection; incomplete data is not READY.
- **Ask first:** before changing reviewer policy or interpreting a new `SKIPPED` semantic.
- **Never:** merge, deploy, suppress findings, answer-away Critical findings, weaken checks or print secrets.
- **Never:** add app-specific generated paths, typecheck commands or reviewer rules to shared config.

## Success Criteria

- Missing local review/simplification/applicable specialist evidence prevents initial PR delivery and subsequent recognized pushes.
- Post-review changes cannot reuse pre-review gate evidence or a negative/stale verdict.
- Coordinators query the requested slice's RED/GREEN evidence without moving their checkout.
- READY requires both shared local readiness and complete current-head remote readiness, exactly once per compliant stable head.
- Existing watches cannot emit READY for a new head until current local evidence exists.
- PR evidence is current, concise and redacted; stale/missing/negative evidence is visible rather than fabricated.
- Existing CI, E2E, image smoke, security scans, human merge and blocked-handover behavior remain intact.

## Open Questions

1. Robin to confirm repository-declared intended reviewers, with Kilo and CodeRabbit required only where enabled and unexplained skips treated as not ready.

## Sources

- Addy Verify/Review/Ship lifecycle: <https://skills.addy.ie/lifecycle/>
- Addy review finding semantics: `skills/addy/code-review-and-quality/SKILL.md`.
- Existing local/final/human gate definitions in `docs/CONTEXT.md` and ADR 0014.
