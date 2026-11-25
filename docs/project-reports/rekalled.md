# Lifecycle audit — Rekalled PR #51

**Scope:** [PR #51](https://github.com/RoborewDev/rekalled/pull/51), head `8466926a3aeb5a9189a609a9ba8f8829610a9f10`, linked to standalone maintenance issue [#47](https://github.com/RoborewDev/rekalled/issues/47). The PR is open, mergeable, and marked `APPROVED` by bot reviews.

**Evidence limitations:** No comparison repository was supplied. Worker-session transcripts and raw sandbox evidence were unavailable, so skill attachment and internal reviewer activity cannot always be independently proven. I inspected repository history, the PR head worktree, GitHub reviews, rulesets, and CI logs read-only; I did not rerun tests.

## 1. Executive verdict

- **Overall lifecycle alignment: Partial**
- **Confidence:** High for repository/GitHub findings; moderate for conclusions about how individual Addy skills were exercised.

The slice had clear requirements, the correct one-issue/one-branch/one-PR shape, seven structural RED/GREEN pairs, strong head CI, resolved review threads, and relevant documentation updates. Its weaknesses are assurance and discipline: GitHub does not enforce the documented gates, CodeRabbit’s approval predates the final eight commits, the diff accumulated avoidable Markdown-testing complexity, and the external Dependabot fix still needs post-merge runtime validation.

## 2. Lifecycle evidence matrix

| Phase / skill | Required? | Evidence | Status | Why it matters |
|---|---|---|---|---|
| Lightweight requirements definition | Yes | Issue #47 contains the problem, scope, constraints, six acceptance criteria, components, contract status, flag plan, and dependencies. | **Confirmed** | The work was well bounded without manufacturing a product spec. |
| Interview, product spec, PRD, full slice breakdown | No | PR #51 explicitly says “Standalone delivery-maintenance slice (no PRD parent).” No product behaviour changed. | **Not applicable** | A full Define cycle would have added process without improving this clear maintenance task. |
| Vertical slice / dependency planning | Yes | One issue, `slice/47-delivery-maintenance-fix-depen`, one PR, no blockers, no tier-split application work. | **Confirmed** | Preserved the independently mergeable delivery unit. |
| Incremental implementation | Yes | Fourteen small commits in seven test/code pairs; six files changed, no application code. | **Confirmed** | Changes were bisectable and reviewable, although later increments became excessive. |
| CI/CD and automation | Yes — `area:infra` | Dependabot and CodeRabbit configuration changed with focused contract coverage; head CI run `45613116463` is green. | **Confirmed** | This was the central applicable Addy workflow. |
| TDD / RED-GREEN | Yes | Seven test-only/code pairs from `bffe3d3`→`e82dc66` through `645db8a`→`8466926`; current PR body reports `redgreen_check OK (14 commits checked)`. | **Confirmed** for structure; **Probable** for recorded runs | Commit topology is verified, but raw sandbox evidence was not independently accessible. |
| Debugging and error recovery | Yes — existing CI failure | PR #44 run `45122377125` shows `ERR_PNPM_OUTDATED_LOCKFILE` in API, Web, and image jobs; #51 addresses the observed workspace-root cause. | **Confirmed** | The fix was driven by reproduced failures rather than speculation. |
| API/interface, frontend, migrations | No | No runtime API, web source, migration, or generated-client changes. | **Not applicable** | Correctly avoided irrelevant layer-specific work. |
| Security review / hardening | Yes — infra and container mounts | Mounts remain read-only; `.env`/`.env.local` exclusions are tested; PR discusses the wider `.github` mount and Dependabot scope. No distinct security-auditor output was found. | **Probable** | Security implications were considered, but the required specialist review is not demonstrable. |
| Source verification / doubt review | Optional | No external-framework uncertainty or high-stakes novel design required these workflows. | **Not evidenced** | Their absence is not treated as a failure. |
| Lint, type checks, tests | Yes | Head run `45613116463`: ruff, formatting, mypy, basedpyright, pytest, Web checks, and builds all passed. | **Confirmed** | Independent verification at the exact head SHA. |
| Sandbox gate | Yes | PR body reports aggregate tests, 400 API tests, 65 Web tests, generation drift, production images, and smoke passing. | **Probable** | Required local gate is documented, but raw output was unavailable. |
| Runtime, browser, and smoke verification | Yes under the repository gate | Head CI independently records **401 API tests, 78 Web tests, 26 Playwright tests**, successful generated-client check, healthy images, `/v1/health` 200, and unauthenticated `/v1/me` 401. | **Confirmed** | Strong regression and runtime evidence beyond static configuration assertions. |
| Generated-artifact drift | Yes | No generated paths changed; “Committed API client is not stale” passed in CI job `139201496791`. | **Confirmed** | Demonstrates no tracked generated drift. |
| Code review | Yes | PR records two internal code-reviewer rounds; GitHub has CodeRabbit/Kilo reviews and 15/15 resolved threads. | **Confirmed**, with current-head coverage gap | Review genuinely changed the implementation, but final commits lack fresh CodeRabbit coverage. |
| Code simplification | Yes during Review | No simplification result is recorded; the test file gained 131 lines, including a formatting-sensitive Markdown parser. | **Not evidenced** | The accumulated complexity is material to future maintenance. |
| Documentation / ADRs | Yes | `CONTRIBUTING.md` and ADR `0002-isolated-sandbox-contract.md` were updated. | **Confirmed** | Operational instructions and the sandbox decision were kept partially current. |
| Git workflow and PR monitoring | Yes | Correct branch naming, conventional commits, READY comments/status transitions, zero open threads, and an active PR watch. | **Confirmed** | Delivery coordination operated as intended. |
| Rollback and post-merge follow-up | Yes, lightweight | Whole PR is revertable as one squash commit; recreating #44 is recorded as an unchecked post-merge action. | **Confirmed** as planned, not executed | Actual Dependabot behaviour remains the essential end-to-end check. |
| Performance, observability, production launch | No | No runtime critical path, performance requirement, deployment, or rollout changed. | **Not applicable** | No reason to invoke additional Ship skills. |
| Human approval before merge | Required before merge | Formal approvals are bot-only; the shared `roborew` account does not establish which comments were human-authored. PR remains open. | **Not evidenced — still pending** | The human gate has not been bypassed, but it must not be inferred from `reviewDecision: APPROVED`. |

### Definition of Done assessment

- **Acceptance criteria:** The two configuration changes and absence of application/API changes are confirmed. Sandbox results are probable rather than independently confirmed. The post-merge Dependabot action remains pending by design.
- **Runtime and regressions:** Strong head CI evidence: 401 API, 78 Web, 26 E2E, image smoke, security scans, and generated drift all passed.
- **Edge cases:** Schedule/cooldown boundaries and review-trigger semantics received explicit coverage. Actual Dependabot lockfile regeneration remains unverified until #44 is recreated.
- **Simplicity and scope:** Partial. Application scope was respected, but the test/documentation guard grew disproportionately.
- **Integration and compatibility:** Dependabot’s wider root scope, including `packages/api-client`, was explicitly considered. CodeRabbit’s manual re-review consequence was documented.
- **Documentation:** PR-related documentation was updated, but pre-existing test/branch-protection documentation remains inconsistent with reality.
- **Security and rollback:** Read-only mounts and secret exclusions are confirmed; a single revert provides rollback. No new observability requirement applies.
- **Cleanliness:** No tracked generated drift, but the slice worktree contains an untracked generator error log.
- **Human approval:** Still required before merge. The Definition of Done is therefore **not yet complete**, appropriately for an open PR.

## 3. Confirmed findings

### F1 — Documented merge gates are not enforced

- **Priority:** P1
- **Type:** Process gap; pre-existing, not introduced by #51.
- **References:** `docs/deployment/PLAN.md:17` requires PRs, `ci-ok`, CodeRabbit, and resolved conversations. Live ruleset `26486104` has `required_status_checks: []`, no PR-review rule, and an `always` bypass for user `4838637`.
- **Impact and frequency:** Repository-wide and continuous: a red or unreviewed PR can be merged while documentation and PR #51 claim that CodeRabbit “gates merges.” `mergeStateStatus: CLEAN` demonstrates that GitHub currently accepts the PR based on convention, not enforcement.
- **Minimal next action:** Require at least `ci-ok` and the intended conversation/review rules, remove or narrow the unconditional bypass, and align the documentation. Validate CodeRabbit’s `SKIPPED` semantics before making it a required check.

### F2 — Current-head review coverage is stale

- **Priority:** P1
- **Type:** Process gap caused by the new non-incremental review workflow.
- **References:** CodeRabbit approved at `db4ea99`; eight commits followed through head `8466926`. The head CodeRabbit check is `SKIPPED`; Kilo is green at head.
- **Impact and frequency:** The final eight commits have Kilo and CI coverage but no fresh CodeRabbit review. This will recur after every post-review push unless someone manually retriggers review. GitHub’s aggregate `APPROVED` state obscures that coverage gap.
- **Minimal next action:** Before merging #51, request `@coderabbitai review` at `8466926` and obtain Robin’s explicit approval. Then make the PR monitor track the reviewed head SHA and retrigger only after pushes settle.

### F3 — Optional review hardening became disproportionate complexity

- **Priority:** P2
- **Type:** Process gap, with maintenance risk.
- **References:** `apps/api/tests/test_delivery_contract.py:119-164` introduces Markdown enumeration/parsing helpers; `:524-535` pins ADR structure. The PR adds 131 test lines and five test/code pairs around schedule/documentation precision.
- **Impact and frequency:** Four later review rounds largely hardened how an ADR bullet is formatted rather than the two automation settings. Harmless documentation reflows can now fail tests, and two configuration changes required fourteen commits.
- **Minimal next action:** Apply a final simplification pass. Prefer a direct assertion for the changed mount documentation, or remove the formatting-coupled guard; retain tests that protect behaviour rather than Markdown layout.

### F4 — `redgreen_check({slice})` ignores its slice argument

- **Priority:** P2
- **Type:** Functional tooling bug with process/audit impact.
- **Reference:** `/home/opencode/.config/opencode/plugins/oc-sandbox/index.ts:448-453` names the input `_input`, resolves the calling session’s directory, and checks `main..HEAD`.
- **Impact and frequency:** From the main checkout, `redgreen_check({slice:"47"})` returned **“no commits on this slice yet”** despite the slice’s fourteen commits. Every coordinator/audit invocation outside the worker session can therefore give a misleading result.
- **Minimal next action:** Resolve the requested slice through the worktree registry, or add a read-only evidence-query tool. Add a regression test invoking the check from `main` for an active slice.

### F5 — The predecessor PR caused avoidable review rework

- **Priority:** P2
- **Type:** Branch/PR workflow gap.
- **References:** PR #49 was opened from the already-merged `slice/34-slice-18-notes-with-pgvector-s` branch. Its initial diff included the whole Notes slice; it was closed as “Superseded by #47.”
- **Impact and frequency:** One occurrence directly preceding #51: unrelated Notes findings were reviewed again, and CodeRabbit reported that no included reviews remained. The useful commits had to be reused in a fresh PR.
- **Minimal next action:** Before PR creation, reject a branch that already has a merged PR unless explicitly overridden, and verify that the branch’s issue number matches the PR’s linked issue.

### F6 — Agent-facing testing documentation remains contradictory

- **Priority:** P2
- **Type:** Documentation/process drift; pre-existing.
- **References:** `docs/TEMPLATE.md:74-85` says E2E runs only on the host and gives Docker “—”; `AGENTS.md:49-51` and ADR 0002 describe containerized E2E. Separately, `.github/pull_request_template.md:7` asks for local `just lint`/`just test`, while the delivery flow requires sandbox gates.
- **Impact and frequency:** Persistent across slices: future agents may choose the wrong test path or omit container E2E.
- **Minimal next action:** Update both documents to distinguish Robin’s host inner loop from the mandatory isolated delivery gate.

### F7 — The slice worktree is not clean

- **Priority:** P2
- **Type:** Cleanup/process gap, not a PR defect.
- **Reference:** `packages/api-client/openapi-ts-error-1795555804702.log` is untracked in the slice worktree and records an `ENOENT` rename failure dated 2026-11-24.
- **Impact and frequency:** One observed occurrence. It does not affect the PR diff, but it will block clean slice completion and may represent a transient generator failure worth understanding.
- **Minimal next action:** Preserve/triage the failure evidence, then clean the worktree before `slice_finish`. Do not blindly ignore recurring generator error logs.

## 4. Not evidenced

These are not assertions that the workflows were wrongly skipped:

- **Session transcripts:** unavailable, so actual skill attachment and internal subagent execution cannot be fully reconstructed.
- **Raw `sandbox_gate` and RED/GREEN records:** the current PR body reports all fourteen commits checked and the full gate passing, but independent records were inaccessible.
- **`code-simplification`:** required during Review but no durable output was found.
- **Distinct `security-auditor` execution:** security reasoning is visible, but no specialist review result was found despite the infra trigger.
- **`context-engineering`:** correct repository context is evident from the output, but the workflow itself is not demonstrable.
- **Optional `source-driven-development` and `doubt-driven-development`:** no durable evidence; neither was clearly necessary.
- **Human approval:** not yet evidenced and not yet due while the PR remains open.

## 5. Not applicable

- **Interview, idea refinement, product spec, PRD:** the maintenance problem and boundaries were already concrete.
- **Full numbered slice breakdown:** this was a standalone maintenance slice with its own complete issue.
- **API/interface design and frontend UI engineering:** no runtime API or presentation changes.
- **Migration/deprecation work:** no database or system migration.
- **Browser DevTools testing skill:** no UI behaviour changed; the mandatory Playwright regression suite still ran.
- **Performance optimization and observability instrumentation:** no performance requirement or new runtime critical path.
- **Feature flags:** configuration-only maintenance with no incomplete product behaviour.
- **Production shipping/launch workflow:** no deployment or rollout was part of this PR.

## 6. Recommended improvements

| Proposed change | Expected benefit | Verification | Essential? | Risks / uncertainty |
|---|---|---|---|---|
| **1. Enforce the documented `main` ruleset.** Require `ci-ok`, PR/conversation rules, and narrow the unconditional bypass; align docs. | Converts social convention into an actual quality gate. | Inspect the ruleset API and confirm a failing test PR cannot merge. | **Essential** | Test CodeRabbit `SKIPPED` handling before requiring it, or merges may block unexpectedly. |
| **2. Make PR monitoring head-SHA-aware.** After pushes settle, trigger one CodeRabbit review and do not mark READY while its head check is skipped or its approval is stale. Require a final simplification review. | Ensures the code actually merged receives the intended review. | Push a post-approval commit on a test PR and verify READY waits for review at the new SHA. | **Essential** | Triggering on every intermediate push would recreate the allowance problem; debounce and trigger once per final head. |
| **3. Close the Dependabot runtime-validation loop.** After #51 merges, recreate #44 and keep #47 open until the new PR updates both the manifest and root lockfile with green CI. | Proves the actual external automation defect is fixed, not merely its YAML shape. | Inspect the regenerated PR’s files and require `pnpm install --frozen-lockfile` plus all CI jobs to pass. | **Essential** | Billing or Dependabot scheduling may delay validation; record that as an external blocker rather than declaring success early. |
| **4. Make RED/GREEN evidence queryable by slice.** Honour the existing argument or add a read-only evidence export. | Allows coordinators and auditors to verify a mandatory gate independently. | From the main checkout, querying slice #47 should examine fourteen commits rather than report none. | Optional, high value | Worktree resolution must remain read-only and must not check out or move the caller. |
| **5. Add a pre-PR branch-hygiene guard.** Reject previously merged branches and branch/issue mismatches unless explicitly overridden. | Prevents #49-style full-slice diffs and wasted reviews. | Replay a #49-like fixture and confirm PR creation stops before GitHub submission. | Optional | Intentional stacked or follow-up branches need an explicit escape hatch. |
| **6. Add a simplification decision point after required findings.** Optional bot suggestions should be accepted for correctness/security value, not automatically implemented; avoid tests coupled to documentation layout. | Less review churn and fewer brittle contract tests. | A two-setting maintenance fixture should retain focused configuration assertions without acquiring a Markdown parser. | Optional | Do not use a rigid commit/line cap that suppresses legitimate findings. |
| **7. Repair testing-doc drift and tighten cleanup checks.** Update the E2E and PR-template wording; require a clean worktree at final handoff. | Future slices receive consistent instructions and generator failures are not forgotten. | Compare docs with `AGENTS.md`/ADR 0002 and require empty `git status --porcelain` before completion. | Optional | Preserve generator failure output before cleanup; hiding logs would reduce diagnosability. |

**Immediate sequence for #51:** obtain a fresh review at `8466926`, simplify or explicitly justify the Markdown guard, secure Robin’s human approval, then merge. Afterward, recreate #44 and verify the root lockfile update before treating #47 as fully done.