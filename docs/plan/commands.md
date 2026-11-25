# Command template drafts

These are drafts of the files in `commands/`. They are adapted from addy's `commands/*.toml` at commit `39b723c` (MIT); the output paths and GitHub integration are our changes. Ticket 01 confirms that `@skill-id` loads inside a template. If it doesn't, the `oc-skills` hook adds the same skills.

## commands/spec.md

```markdown
---
description: Define — explicit entry to run the project health check, interview, write a spec, and open the PRD issue
agent: plan
---

@using-agent-skills @oc-plan-gateway @interview-me @spec-driven-development @oc-github

Idea: $ARGUMENTS

This is an explicit Define-only entry into `oc-plan-gateway`; it is not an extra gateway the user must invoke before `/plan`.

1. Follow the gateway's Define workflow, including the applicable Addy clarification and contextual skills. If the idea is vague, load @idea-refine; for contract changes, load @api-and-interface-design.
2. Run the quick read-only project health check on the repo's `AGENTS.md` front matter, test contract, and `test.checks` static-check declarations. Record any missing or stale instruction as an explicit remediation item in the spec; never edit the app repo directly from Plan.
3. Read the repo's AGENTS.md front matter and architecture, then write the spec to `docs/spec/<slug>.md` (delta specs remain separate). Use explore/general subagents for repo research.
4. **The spec file must exist before approval.** Show its path and contents or a faithful summary, plus open questions, then stop for explicit approval. A chat-only draft is not a written spec.
5. After approval, Plan commits the spec on `spec/<slug>`, opens its PR, and creates the PRD issue through oc-github. Request required shell approval rather than handing this work to Build.
6. Planning may resume only after that later-turn approval, following the gateway; the numbered slice breakdown gets its own approval gate before issues are created.
```

## commands/plan.md

```markdown
---
description: Plan — enter Define (with its project health check) for new work or split an approved spec into vertical-slice issues
agent: plan
---

@using-agent-skills @oc-plan-gateway @interview-me @spec-driven-development @planning-and-task-breakdown @oc-github

Work or PRD: $ARGUMENTS (an idea, change, spec path, or issue number; a PRD is not required)

Follow `oc-plan-gateway` as the canonical workflow.

- A new idea or significant change without an approved spec starts **Define** automatically. Do not ask the user to invoke `/spec` and do not jump straight to slicing. At the start of Define, run the quick read-only project health check on the repo's `AGENTS.md` front matter, test contract, and `test.checks` static-check declarations, and record any gap as an explicit remediation item in the spec.
- An approved spec, or a PRD with verified linked-spec approval, resumes at **Plan slices**. An existing PRD without verified spec approval stays in Define.
- The spec must be written under `docs/spec/**` before its approval gate. Plan owns the spec branch/PR and PRD after approval, then the numbered-breakdown gate and GitHub slice issues. Do not hand these writes or GitHub operations to Build.
- The plan record is the spec + PRD + linked issues, not `tasks/plan.md` or `tasks/todo.md`. Only **slice drafting** is read-only: do not edit app implementation or create slice issues before the numbered breakdown is approved. This does not prohibit Define's required spec writes or, after spec approval, the spec branch/PR and PRD.
```

## commands/build.md

```markdown
---
description: Build — explicit entry to coordinate slices (main checkout) or build one slice (#N)
agent: build
---

@using-agent-skills @oc-build-gateway @oc-worktree @oc-github

Arguments: $ARGUMENTS

Follow `oc-build-gateway` as the canonical workflow; it is also injected when Build is selected without this command.

- With no `#N` in the main checkout, execute the gateway's complete coordinator algorithm: cleanup-pending recovery, verified-merge reconciliation, synchronization, PRD closure, worker recovery/dispatch, and status reporting. Never implement in main.
- With `#N` in that slice's worktree, execute the gateway's slice workflow using the base/area skills already attached by oc-skills. Start `sandbox_up`; follow RED/GREEN for every acceptance criterion; run the repo's declared static checks through `sandbox_check` while writing or changing code; keep implementation inside the approved layers; run `sandbox_gate`; use @debugging-and-error-recovery on failure; call `slice_block` with an actionable reason after three failed attempts rather than inventing requirements.
- Use the gateway's context-sensitive Addy workflows throughout implementation and review. /review and /ship remain explicit/recovery forms of its review and PR-delivery stages, not extra phase commands the user must remember.
- When slice_message or slice_resume wakes an existing worker, continue in that worktree, branch, session and PR; restart prmon_watch after pushing the fix or opening the PR. For all worker feedback, recovery and dispatch, route through the gateway—never centrally fix a slice or create replacement sessions/PRs.

Never edit, weaken, skip or delete tests to make them pass. Never run tests or Docker directly on the host; use oc-sandbox. The user merges; agents never merge.
```

## commands/review.md

```markdown
---
description: Review — local persona review before the PR
agent: build
---

@code-review-and-quality @code-simplification

Run the code-reviewer subagent on `git diff origin/main...HEAD`. If the slice has `risk:security`, or the diff touches auth, secrets, migrations, dependency manifests or infra, also run security-auditor in parallel. Fix every Critical/Important finding or answer it with a reason, re-run sandbox_gate, then run redgreen_check. Summarise the findings for the PR.
```

## commands/ship.md

```markdown
---
description: Ship — push, open the PR, start the PR monitor
agent: build
---

@git-workflow-and-versioning @oc-github @oc-pr-monitor

Push `slice/<N>-<slug>`. Check for an existing OPEN PR on the branch first; if present, push the fix and call prmon_watch instead of creating another PR. Otherwise open a PR to main with `gh pr create --body-file`, using oc-github's `pr.md` template (from the config, not the repo): Closes #N, Part of #PRD, what changed, contract change and any regenerated artifacts, the redgreen_check and sandbox_gate output, the review summary, the flag state. Call prmon_watch, then go idle. When the monitor wakes you: fix each listed item (commit, push) or reply "Won't fix, because…" and resolve it. Never merge. The user merges.
```
