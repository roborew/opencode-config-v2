# Lifecycle audit — Fatebox PR #36 / slice #20

**Target:** `sealed-send: create and reveal a sealed-date link`  
**Base:** `8470a43` · **Head:** `a221d27` · **Merge:** `12d3a358`  
**Scope:** PR #36, issue #20, PRD #14, associated commits, reviews, CI runs, specifications, migrations, generated artifacts, and test contracts.

## 1. Executive verdict

- **Overall lifecycle alignment: Strong**
- **Confidence:** High for delivery and verification evidence; moderate for attributing outcomes to specific Addy skill invocations.

The slice followed a genuinely vertical, test-first lifecycle: all eight acceptance criteria have implementation and regression evidence, security and accessibility findings were addressed, final production-stack CI was green, and Robin performed the merge. The principal weaknesses were process instrumentation rather than shipped correctness: web type-checking was absent despite CI labels claiming otherwise, readiness notifications were premature and repetitive, and some documentation and closure state drifted.

**Evidence limitations:** Historical Build/Review session transcripts were not available, and historical local sandbox logs were not independently preserved. I used recorded sandbox results in PR #36, independently inspected commit ordering and diffs, and directly inspected [CI run 45509425968](https://github.com/RoborewDev/fatebox/actions/runs/45509425968). No tests were rerun during this read-only audit. No comparison repository was supplied.

## 2. Lifecycle evidence matrix

| Phase / skill | Required? | Evidence | Status | Why it matters |
|---|---|---|---|---|
| **Define — interview / idea refinement** | Appropriate at initiative start | Prototype, partner research, spec open questions, and PRD #14’s approved planning decisions show divergence and convergence | **Probable** | Outcomes are visible, but the actual interview/refinement process cannot be verified without transcripts |
| **Define — spec-driven development** | Yes | `docs/spec/fatebox-v2-experience-and-offers.md:1-9` records Robin’s approval; merged through PR #13; linked from PRD #14 | **Confirmed** | Established objective, users, contracts, boundaries, testing strategy, and acceptance criteria before implementation |
| **Plan — vertical slices and dependencies** | Yes | Approved `tasks/plan.md`; PRD #14 has six sub-issues; issue #20 is a child of #14 and blocked by closed #19; labels cover `api`, `web`, `db`, and `risk:security` | **Confirmed** | Slice crossed DB/API/client/web/E2E and followed the migration dependency chain |
| **Plan — separate numbered-breakdown approval** | Yes | `tasks/plan.md:1-5` records approval, but the final six-issue PRD has no separate approval comment | **Probable** | Written approval exists for the plan, but the exact final issue breakdown’s independent gate is not directly reconstructable |
| **Build — incremental implementation** | Yes | 40 commits progressed through create → rate limit → read → open → expiry → generated client → form → recipient page/E2E → review hardening | **Confirmed** | Behavior was built and verified incrementally rather than landed as one opaque commit |
| **Build — context engineering** | Yes | AGENTS.md contract, approved spec, PRD, scoped issue, prototype, and existing ADRs were available and reflected in the PR | **Probable** | Context quality was high, though named skill invocation is not demonstrated |
| **Build — API/interface design** | Yes — contract change | Three typed endpoints, generated schemas/client, stable `BrokenLinkCode`, explicit error responses, and `Cache-Control: no-store` | **Confirmed** | Produced a typed cross-package contract and eventually eliminated fragile human-string protocol matching |
| **Build — frontend UI engineering** | Yes | Focus management, persistent live region, keyboard behavior, timeout/abort handling, plain-text rendering, retry-versus-terminal states, and unit coverage | **Confirmed** | Accessibility and failure behavior received concrete implementation and regression coverage |
| **Build — TDD** | Yes | 19 test-only commits each immediately precede their behavior commit; examples include `74b7945 → f3f64cc`, `502ea40 → 3dc1808`, and `bdf08e7 → 8afffae` | **Confirmed** | Commit ordering independently demonstrates test-first implementation |
| **Build — migration expand/contract** | Yes — `area:db` | `20261124_0009` follows `0008`, creates only the new table/index, and has real Alembic upgrade/downgrade and constraint tests | **Confirmed** | Preserved sequential history and provided additive integration and rollback evidence |
| **Build/Review — security and hardening** | Yes — `risk:security` | PR security-auditor summary; 128-bit tokens, control-character rejection, path validation, no-store responses, rate limiting, XSS tests, dependency/image scans | **Confirmed** | Security-sensitive capability links received targeted review beyond generic CI |
| **Build — source-driven development** | Optional | No official-documentation citations or source-verification record specific to the implementation approaches | **Not evidenced** | Cannot claim doc-verified framework decisions; no evidence that this omission caused a defect |
| **Build — doubt/adversarial review** | Appropriate for concurrency/security | Code review exposed the nondeterministic concurrency test; it was replaced with a deterministic two-connection test in `91123b4`/`be6d3e3` | **Probable** | Adversarial scrutiny demonstrably improved confidence, but the named skill’s invocation is unverified |
| **Verify — RED/GREEN discipline** | Yes | PR records `redgreen_check: OK`; test-first commit pairs were independently verified | **Confirmed** | Supports genuine failing-test-first practice, although raw historical failing local output is unavailable |
| **Verify — sandbox execution** | Yes | PR records repeated `sandbox_gate` passes and explicit E2E execution; final CI independently ran equivalent Compose paths | **Confirmed** | Tests ran in isolated containers, not merely inferred from code inspection |
| **Verify — lint/type-check timing** | Yes | API run shows Ruff and mypy passing; web run shows only formatting and lint results from `vp check` | **Confirmed — web gap** | API checks were real; web type safety was incorrectly implied by the CI label |
| **Verify — browser/runtime verification** | Yes | CI run 45509425968: **20 Playwright tests passed**, including the sealed-send fresh-context/revisit journey; smoke and production-image checks passed | **Confirmed** | Demonstrated the real user journey against production images |
| **Verify — debugging/error recovery** | Required after failures | Failed runs on `38a80ec` and `d4ff8af` were followed by targeted fixes and final green run on `a221d27` | **Confirmed** | CI failures were diagnosed rather than bypassed |
| **Review — code review** | Yes | 13 inline threads, all resolved; final Kilo summary reported no issues; detailed review-response comments identify fixes and SHAs | **Confirmed** | Review materially changed correctness, robustness, accessibility, and test quality |
| **Review — simplification** | Appropriate | Shared open-by vocabulary and broken-link helper, removal of `assert`/vacuous checks, reuse of existing draw service | **Probable** | Simplification outcomes are visible; named workflow execution is not |
| **Review — performance optimization** | No trigger | No performance requirement, regression, or measured bottleneck | **Not applicable** | No reason to invoke performance work |
| **Ship — git workflow and human approval** | Yes | Correct slice branch; merge commit has parents `8470a43` and `a221d27`; `mergedBy: roborew` | **Confirmed** | The reviewed head was merged by Robin, preserving the human merge gate |
| **Ship — CI and PR monitor** | Yes | Final `ci-ok`, E2E, smoke, image, scan, and drift jobs green; monitor stopped at the review cap with a blocked handover | **Confirmed — readiness gap** | Final gate worked, but intermediate READY signals were unreliable |
| **Ship — generated artifacts** | Yes | API client regenerated and `git diff --exit-code -- packages/api-client` passed; `routeTree.gen.ts` is outside that drift contract | **Confirmed — coverage gap** | Main client contract is protected; another committed generated artifact is not |
| **Ship — documentation / ADRs** | Documentation as needed; new ADR optional | Existing spec and ADRs supplied durable context, but resolved sealed-sender question remains open in the spec | **Confirmed — documentation gap** | The source-of-truth document no longer fully reflects the approved decision |
| **Ship — observability and launch** | No — predeployment | PRD explicitly excludes deployment; no production users or launch requirement | **Not applicable** | Production alerting, rollout, and operational rollback were not expected |

### Definition of Done summary

| Dimension | Assessment |
|---|---|
| Acceptance criteria and edge cases | **Met:** all eight issue criteria have direct implementation/test evidence; review added malformed-input, concurrency, timeout, caching, accessibility, and transient-failure coverage |
| Runtime verification and regressions | **Met:** 142 API tests passed with one documented root-only skip, 117 web tests passed, 20 E2E tests passed, smoke/images/scans green |
| Simplicity, duplication, dead code | **Met:** no confirmed dead code or unjustified duplication; existing draw logic and shared vocabularies were reused |
| Integration and backward compatibility | **Met:** expand-only migration, existing suites retained, generated client clean, no flag required under the repository’s predeployment convention |
| Documentation and durable decisions | **Partial:** strong existing artifacts, but spec question 2 and lifecycle closure state were not updated |
| Security, observability, rollback, human approval | **Met for current scope:** targeted security review, migration downgrade evidence, and Robin’s merge; production observability and launch rollback remain intentionally unassessed |

## 3. Confirmed findings

No **P0 findings** or demonstrable functional bugs were found. The confirmed findings are process gaps.

### F1 — Web type-checking is not enforced

- **Priority:** P1
- **Type:** Process gap
- **References:** `.github/workflows/ci.yml:148,157-160`; `apps/web/vite.config.ts:7-15`; PR #36 handover comment at 2026-11-24 23:29; web job in CI run 45509425968.
- **Evidence:** The CI step is named `Check (format, lint, types)`, but `vp check` reported only formatting and linting. The Vite+ configuration does not enable type-aware/type-check options, and no separate `tsc --noEmit` or Vitest type-check exists.
- **Impact:** Web TypeScript errors can merge undetected. In this slice, the final broken-link contract supposedly turns an API-side code rename into a TypeScript error, but CI does not run the compiler needed to enforce that guarantee.
- **Frequency:** One explicit occurrence in this slice; the underlying gate gap is systemic.
- **Minimal next action:** Enable actual web type-checking, clear the reported pre-existing test errors, and pin the configuration with a repository-contract test. Rename the CI step accurately until that is complete.

### F2 — READY was emitted before a stable current-head review

- **Priority:** P1
- **Type:** Process gap
- **References:** PR #36 comments at 19:05, 19:27, 22:21, 22:23, 22:41, 22:42, and 23:28; subsequent Kilo reviews at 19:12, 22:32, 22:52, 23:03, and 23:09; blocked handover at 23:29.
- **Evidence:** Seven standalone READY comments were posted. For example, READY at 19:05 preceded a Kilo review with findings, and duplicate READY messages at 22:21/22:23 preceded further findings at 22:32.
- **Impact:** The human handoff signal did not consistently mean “this exact head is fully reviewed and quiescent.” This created notification noise and reduced confidence during a PR that ultimately reached the five-round cap.
- **Frequency:** Seven occurrences in one PR.
- **Minimal next action:** Make PR-monitor readiness conditional on current-head CI, current-head reviewer completion with no actionable summary findings, and zero unresolved threads. Include the head SHA and emit at most one READY per stable head.

### F3 — The approved sender-view decision remains an open spec question

- **Priority:** P2
- **Type:** Documentation/process gap
- **References:** `docs/spec/fatebox-v2-experience-and-offers.md:225-239`, especially question 2; PRD #14 approved decision 3; issue #20’s approved post-open sender view.
- **Evidence:** PRD #14 settles that the same link exposes opened status and the same card, and PR #36 shipped it. The spec still asks whether that behavior should exist, and PR #36 changed no documentation.
- **Impact:** The designated source of truth can mislead future planning or cause a settled product decision to be reopened.
- **Frequency:** One resolved question left stale in this slice.
- **Minimal next action:** Mark question 2 answered with the PRD decision and shipped issue #20, and document the post-open GET response alongside the unopened shape.

### F4 — A committed generated route artifact has no drift gate

- **Priority:** P2
- **Type:** Process gap
- **References:** `apps/web/src/routeTree.gen.ts:1-8`; `AGENTS.md:10`; `.github/workflows/ci.yml:177-192`; PR #36’s route-generation note.
- **Evidence:** `routeTree.gen.ts` declares itself automatically generated and changed in this slice. The declared generated contract and CI diff check cover only `packages/api-client/**`. The PR also records a manual container-local generation/transport workaround.
- **Impact:** A stale committed route tree can pass the explicit generated-artifact drift gate. Production-image regeneration limits the immediate runtime risk, so this is not a demonstrated shipped bug.
- **Frequency:** One generated artifact affected in this slice.
- **Minimal next action:** Add an explicit TanStack Router regeneration/drift check, or document and test a deliberate alternative if production regeneration is considered sufficient.

### F5 — Closure and deployment follow-up state is incomplete

- **Priority:** P2
- **Type:** Process gap
- **References:** Issue #20 is closed but retains both `status:ready` and `status:in-review`; PRD #14 remains open while reporting six of six sub-issues complete; PR #36 Deploy notes.
- **Evidence:** Token access-log redaction, expired-row purging, proxy/shared-store rate limiting, and response-header work remain unchecked in the merged PR body. No linked deployment-readiness issue was found.
- **Impact:** Board state no longer represents delivery state accurately, and security-relevant launch prerequisites exist only in a merged PR where they are easy to lose.
- **Frequency:** Observed on issue #20 and PRD #14; no current production impact because nothing is deployed.
- **Minimal next action:** Apply a terminal status transition on merge and create a linked deployment-readiness issue containing the four deferred requirements. Close PRD #14 only after Robin’s final product check.

## 4. Not evidenced

These are **not assertions that required work was skipped**:

- **Named skill invocation:** Historical transcripts are unavailable, so `interview-me`, `idea-refine`, `context-engineering`, `doubt-driven-development`, and `code-simplification` cannot be distinguished between “attached and exercised” and “outcome achieved through another route.”
- **Source-driven development:** No official-source citations or documentation-verification record was found. It was optional here, and no resulting defect was demonstrated.
- **Independent slice-breakdown approval:** Approval of the written implementation plan is recorded, but a distinct approval event for the final six GitHub issues is not reconstructable.
- **Raw historical RED and sandbox logs:** The PR records successful `redgreen_check` and `sandbox_gate` runs, but only commit ordering and final CI output could be independently inspected during this audit.

## 5. Not applicable

- **Performance optimization:** No requirement, measured regression, or bottleneck.
- **CI/CD implementation work:** This slice did not change pipeline behavior; using the existing CI gate was still required and confirmed.
- **Constraint-driven development:** A written quality/test contract already existed, with no evidence of checks being deliberately weakened.
- **New ADR:** No separate architecture decision requiring a new ADR was identified; existing spec/ADRs and module documentation covered the slice.
- **Production observability, launch, rollout, and production rollback:** Explicitly outside the predeployment scope.
- **Feature-flag removal:** The repository convention explicitly ships directly to `main` because there are no users or deployed instances.

## 6. Recommended improvements

| Priority | Proposed change | Expected benefit | Verification | Essential? | Risks / uncertainty |
|---|---|---|---|---|---|
| **1** | Enable real web type-checking and pin the configuration; correct the CI step name | Enforces the generated-type guarantees already used by the code and catches errors before review | Contract test asserts the setting/command; CI web job emits compiler results and fails on a type-error fixture | **Essential** | Existing test errors must be fixed; revalidate Vite+/TypeScript semantics during pending upgrades |
| **2** | Make PR-monitor READY head-aware, review-aware, and deduplicated | Restores a trustworthy human handoff and reduces review-cycle noise | Simulated timeline: old green head plus pending review emits nothing; clean current head emits exactly one READY with its SHA | **Essential** | Reviewer summaries may need a machine-readable status rather than parsing prose |
| **3** | Close spec question 2 and document the post-open response | Restores a single reliable product source of truth | Spec text matches PRD decision 3, issue #20, implementation, and API tests | **Essential, small** | Minimal; preserve the fact that approval occurred through the PRD |
| **4** | Add terminal issue-status handling and a linked deployment-readiness issue | Prevents stale boards and loss of launch-blocking security work | Merged fixture has one terminal state; deployment issue contains all four PR #36 deferred items and blocks public launch | **Essential before launch; status automation optional** | PRD closure should remain a human action to avoid premature completion |
| **5** | Add a route-tree generation/drift check | Covers every committed generated artifact, not only the API client | Clean regeneration produces no diff; a deliberately stale route-tree fixture fails | **Optional** | The documented Docker `EXDEV` behavior may require container-local generation plus byte comparison |
| **6** | For multi-error API slices, add a small error-outcome matrix to the issue: status, machine code, retryability, timeout/abort, and accessibility announcement | Avoids another three-review/six-commit progression from prose matching to typed error contracts | Each row maps to API and web tests; no protocol decision depends on human-facing copy | **Optional** | Apply only to complex/error-sensitive flows so simple endpoints are not over-specified |

The existing review-cap escape hatch worked as intended: it stopped autonomous cycling, preserved green evidence, and returned the decision to Robin. The highest-value changes are therefore not additional lifecycle ceremonies, but **making the existing web gate real and the existing readiness signal precise**.