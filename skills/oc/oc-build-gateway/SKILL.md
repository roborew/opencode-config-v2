---
name: oc-build-gateway
description: Always-on Build gateway for the OpenCode delivery flow. Routes central coordination and slice implementation through Addy's incremental, TDD, context, git, review, and ship workflows, with conditional discovery of all applicable build/verify/review/launch skills.
---

# Build gateway — Build → Verify → Review → Ship

`using-agent-skills`, this gateway, `oc-worktree`, and `oc-github` are attached automatically. Apply the meta-skill at session start and whenever context changes: implementation begins, an error occurs, a technical decision arises, review starts, or release readiness is requested. This gateway fixes the core route; the meta-skill discovers contextual workflows rather than letting them be forgotten.

## Route by session context

### Main checkout

Act as Robin's persistent build coordinator; **never implement here**. `/build` and bare Build execute this same algorithm, using `oc-worktree` and `oc-github`; neither creates an implementation branch in main. An unapproved idea or spec gap belongs back in Plan.

On each coordinator run:

1. **Recover cleanup obligations before dispatch.** List every `status:cleanup-pending` issue, close its slice only when appropriate, close its PRD only when no slice sub-issues remain open, then remove the label. Retry failures on the next coordinator run.
2. **Reconcile verified merges.** For Robin-named merges and every active slice whose PR GitHub reports MERGED, call `slice_finish`. Issue closure depends on the verified merge, not cleanup success. If cleanup is refused because the worktree is dirty or has unpushed work, preserve it and the local edits, report the retained slot/refusal, and never claim cleanup completed. Verify `Closes #N` closed the slice; only after verified merge may an open slice be closed explicitly. Never close an unmerged slice.
3. **Synchronize every active slice.** Call `slice_sync` on each coordinator run so pending merges of `origin/main` into building/in-review slices are retried. Wake in-review workers to push updates; defer READY until the push lands. Report conflicts as BLOCKED and never force them.
4. **Close finished PRDs.** Gather distinct PRD parents of merged slices and close those with no open slice issues, leaving the rest open.
5. **Recover and dispatch.** Identify the PRD from session context, asking only if ambiguous. Call `slice_status`; retry `slice_start` for existing records with no worker session. List its open `status:ready` slices whose blockers are closed, excluding issues with worker-backed records or active records whose `ready` means READY for Robin's review. Call `slice_start` for remaining slices up to the slot limit. Report what finished, cleanup in progress, workers started, and what is READY/BLOCKED.

When Robin reports a merge, reconcile before starting more work. For PR feedback, resolve the PR to exactly one active slice using `gh pr view <PR> --json closingIssuesReferences,headRefName`, matching its record by head branch or linked issue; ask rather than guessed routing on ambiguity. After verifying the active slice, call `slice_message({ issue, text })` only while its PR is OPEN. Use `slice_resume({ issue })` for a BLOCKED slice without an open PR after the blocker is resolved. Preserve the existing worker session, worktree, branch, and PR; never fix centrally or create replacements.

Surface READY, BLOCKED, and MERGED notifications to Robin concisely. READY requests Robin's review/testing; MERGED waits for the user's reconciliation instruction. Robin merges; agents never merge.

### Slice worktree with a slice record

Implement exactly one approved issue through every applicable layer, skipping only layers and generators the repo/change genuinely does not need. The injected slice base skills make `incremental-implementation`, `context-engineering`, `test-driven-development`, and `git-workflow-and-versioning` mandatory throughout; `oc-sandbox` owns every test run.

For each acceptance criterion prove RED with a test-only commit and a failing focused sandbox run, then make the minimum code change and prove GREEN. Never weaken, skip, or delete tests to make them pass, never hand-edit declared generated files, and never run tests or Docker directly on the host.

When green, follow `code-review-and-quality` and `code-simplification`, always running the `code-reviewer` subagent. Use `security-and-hardening` and `security-auditor` for `risk:security` or risky changes. Resolve or answer every finding, rerun `sandbox_gate`, verify `redgreen_check`, then use `git-workflow-and-versioning`, `oc-github`, and `oc-pr-monitor` to push and monitor one PR. Continue this existing workflow without requiring Robin to name `/review`, `/ship`, TDD, or area skills.

### No approved slice in the current context

Do not silently manufacture the heavyweight slice workflow for an isolated question, and do not implement a feature from an unapproved idea. Resolve what work Robin meant from the existing PRD/issues; if no approved slice exists, explain the Plan → Build handoff that is missing.

## Contextual Addy workflows

Use every applicable workflow when its trigger arises, not every workflow on every task. Labels provide deterministic overlays, but real diff/task context also applies even when a label is missing.

| Context                                                                                          | Addy workflow                       |
| ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| UI implementation                                                                                | `frontend-ui-engineering`           |
| API/interface or contract design                                                                 | `api-and-interface-design`          |
| Browser-flow verification                                                                        | `browser-testing-with-devtools`     |
| Official-doc verification is needed for correct implementation                                   | `source-driven-development`         |
| Non-trivial/high-stakes decisions or unfamiliar code                                             | `doubt-driven-development`          |
| Test/build failures or behavior stops matching expectations                                      | `debugging-and-error-recovery`      |
| Database migration, retirement, or rollout compatibility                                         | `deprecation-and-migration`         |
| CI/CD pipeline changes or `area:infra`                                                           | `ci-cd-and-automation`              |
| Untrusted data/auth/secrets, security-sensitive changes, or `risk:security`                      | `security-and-hardening`            |
| Performance requirement, regression, or measured bottleneck                                      | `performance-optimization`          |
| Production logs/metrics/traces/alerts needed; instrument as implemented, not after               | `observability-and-instrumentation` |
| Architecture decision or future context needs recording                                          | `documentation-and-adrs`            |
| Missing quality bar or pressure to silence/weaken checks                                         | `constraint-driven-development`     |
| Actual production deployment, launch checklist, staged rollout, monitoring, or rollback planning | `shipping-and-launch`               |

PR delivery and production launch are different. `/ship` opens and monitors the PR; it does **not** automatically invoke `shipping-and-launch`, merge, deploy, or relax branch/deployment protections. The launch workflow applies only when release/deployment work is actually requested, and existing denies still prevent autonomous deployment.

## Standing quality rules

- Surface assumptions; when they cannot safely be resolved, stop on spec conflicts or ambiguity rather than guessing.
- Keep the implementation incremental and test-backed, with the full test contract run through `oc-sandbox` only.
- Preserve scope: do not fix unrelated failures, clean unrelated code, or add a parallel orchestration mechanism.
- Loading a skill is not enough: follow its process and verification unless an explicit OC integration rule replaces its generic artifact names.
