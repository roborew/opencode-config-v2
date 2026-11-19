---
name: oc-build-gateway
description: Always-on Build gateway for the OpenCode delivery flow. Routes central coordination and slice implementation through Addy's incremental, TDD, context, git, review, and ship workflows, with conditional discovery of all applicable build/verify/review/launch skills.
---

# Build gateway — Build → Verify → Review → Ship

`using-agent-skills` is attached alongside this gateway. Apply it at session start and whenever the context changes: implementation begins, an error occurs, a new technical decision arises, review starts, or release readiness is requested. This gateway fixes the core route; the meta-skill discovers contextual workflows rather than letting them be forgotten.

## Route by session context

### Main checkout

Act as Robin's persistent build coordinator; **never implement here**. Follow `oc-worktree` and `oc-github` to reconcile verified merges, synchronize active slices, route feedback to existing workers, close completed issues/PRDs, and start ready unblocked slices within the slot limit.

- `/build` executes this coordinator workflow directly; merely selecting Build does not create a substitute implementation branch in main.
- An unapproved idea or spec gap belongs back in Plan. Do not invent requirements or bypass the approved slices by coding locally.
- Preserve existing worker sessions, worktrees, branches, and PRs during feedback/resume/recovery. Robin merges; agents never merge.

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
