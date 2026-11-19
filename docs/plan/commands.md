# Command template drafts

These are drafts of the files in `commands/`. They are adapted from addy's `commands/*.toml` at commit `39b723c` (MIT); the output paths and GitHub integration are our changes. Ticket 01 confirms that `@skill-id` loads inside a template. If it doesn't, the `oc-skills` hook adds the same skills.

## commands/spec.md

```markdown
---
description: Define — explicit entry to interview, write a spec, and open the PRD issue
agent: plan
---

@using-agent-skills @oc-plan-gateway @interview-me @spec-driven-development @oc-github

Idea: $ARGUMENTS

This is an explicit Define-only entry into `oc-plan-gateway`; it is not an extra gateway the user must invoke before `/plan`.

1. Follow the gateway's Define workflow, including the applicable Addy clarification and contextual skills. If the idea is vague, load @idea-refine; for contract changes, load @api-and-interface-design.
2. Read the repo's AGENTS.md front matter and write the spec to `docs/spec/<slug>.md` (delta specs remain separate). Use explore/general subagents for repo research.
3. **The spec file must exist before approval.** Show its path and contents or a faithful summary, plus open questions, then stop for explicit approval. A chat-only draft is not a written spec.
4. After approval, Plan commits the spec on `spec/<slug>`, opens its PR, and creates the PRD issue through oc-github. Request required shell approval rather than handing this work to Build.
5. Planning may resume only after that later-turn approval, following the gateway; the numbered slice breakdown gets its own approval gate before issues are created.
```

## commands/plan.md

```markdown
---
description: Plan — enter Define for new work or split an approved spec into vertical-slice issues
agent: plan
---

@using-agent-skills @oc-plan-gateway @interview-me @spec-driven-development @planning-and-task-breakdown @oc-github

Work or PRD: $ARGUMENTS (an idea, change, spec path, or issue number; a PRD is not required)

Follow `oc-plan-gateway` as the canonical workflow.

- A new idea or significant change without an approved spec starts **Define** automatically. Do not ask the user to invoke `/spec` and do not jump straight to slicing.
- An approved spec/PRD without an approved breakdown resumes at **Plan slices**.
- The spec must be written under `docs/spec/**` before its approval gate. Plan owns the spec branch/PR and PRD after approval, then the numbered-breakdown gate and GitHub slice issues. Do not hand these writes or GitHub operations to Build.
- Before breakdown approval, research and drafting only: do not edit repo files or create issues. After approval, create the slice issues. The plan record is the spec + PRD + linked issues, not `tasks/plan.md` or `tasks/todo.md`.
```

## commands/build.md

```markdown
---
description: Build — coordinate slices (main checkout) or build one slice (#N)
agent: build
---

@using-agent-skills @oc-build-gateway @oc-worktree

Arguments: $ARGUMENTS

If no `#N` is given and you are in the main checkout, you are the user's persistent build coordinator. Never implement here.

Before dispatching, load @oc-github and recover cleanup obligations. List all issues in every state labelled `status:cleanup-pending`. For each, close the slice issue if it is still open, inspect its parent PRD and close it only when no slice sub-issues remain open, then remove `status:cleanup-pending`. Retry any that fail on the next `/build` run.

1. Reconcile merges before dispatching new work. For the merged slices the user names, and every active slice whose PR GitHub reports as MERGED, call slice_finish. Keep issue closure conditional on the verified merge, not cleanup success. If slice_finish refuses because the worktree is dirty or unpushed, preserve the worktree and local edits, report the refusal and retained slot, and retry cleanup after the user resolves the cause. Do not report cleanup complete. Verify that the `Closes #N` link closed the slice issue; only after confirming the merge, close it explicitly if it is still open. Never close an unmerged slice.
2. Call slice_sync on every `/build` run so pending syncs are retried even without a new merge. It merges origin/main into building and in-review slices. When it changes an in-review branch, the worker is woken to push it and READY is deferred until that push lands. Report conflicts as BLOCKED; never force them.
3. Load @oc-github. Collect every distinct parent PRD of the slices finished by this reconciliation. Close each PRD that has no open slice issues left; leave the others open.
4. Identify the PRD from the central session's context; ask the user only if it is ambiguous. Call slice_status. Retry slice_start for every existing record with no worker session so recovery is not skipped. List the PRD's open slices with status:ready whose blockers are all closed, excluding issues with a worker-backed slice record. On an active record, `ready` means READY for user review—not ready to dispatch again. Call slice_start for each remaining slice, up to the slot limit.
5. Report slice_status with what finished, finishing cleanup, what started, what is READY, and what is BLOCKED.

When the user says "I merged #N" in this central build session, run that same reconciliation before starting more work. If the user references a PR, resolve it to its active slice first: use `gh pr view <PR> --json closingIssuesReferences,headRefName` and require exactly one active record matching the head branch or linked issue. If the evidence matches multiple slices or conflicts, ask the user and send nothing. If the user names a slice issue, verify that record is active. Then call slice_message({ issue: sliceIssue, text: "user feedback" }); it accepts feedback only while the PR is OPEN. For a BLOCKED slice without an open PR, call slice_resume({ issue: sliceIssue }) after the blocker is resolved. Do not fix work here, create another session, or open another PR. When a READY, BLOCKED or MERGED notification arrives, give the user a concise update; READY asks for review and testing, and MERGED waits for the user's reconciliation instruction.

If `#N` is given and you are in that slice's worktree (oc-skills has already added the base and area skills):

1. sandbox_up.
2. Work in vertical order through only the layers that exist and the slice touches: for example migration (expand) → API → regenerate the client through the declared generator service (commit it; never hand-edit it) → web → E2E. Skip absent layers and do not invent a separate backend or generated client for a self-contained full-stack app. For each acceptance criterion: write the failing test, commit it test-only, run sandbox_test with the focused test (the app's test service plus args; it must fail = RED); write the minimum code, commit, re-run it (it must pass = GREEN).
3. Run sandbox_gate. On failure follow @debugging-and-error-recovery. After 3 failed attempts on the same criterion, call slice_block with the actionable reason and go idle. Do not invent requirements.
4. Continue with /review, then /ship. Opening the PR and calling prmon_watch marks the slice in-review; READY and BLOCKED are reported to the central build session automatically.
5. When slice_message or slice_resume wakes you, follow its instructions in this same worktree, branch, session and PR, then restart prmon_watch after pushing the fix or opening the PR.

Never edit or weaken a test to make it pass. Never run docker or tests directly on the host; use oc-sandbox.
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

Push `slice/<N>-<slug>`. Check for an existing OPEN PR on the branch first; if present, push the fix and call prmon_watch instead of creating another PR. Otherwise open a PR to main with `gh pr create --body-file`, using oc-github's `pr.md` template (from the config, not the repo): Closes #N, Part of #PRD, what changed, contract change and any regenerated artifacts, the redgreen_check and sandbox_gate output, the review summary, the flag state. Call prmon_watch, then go idle. When the monitor wakes you: fix each listed item (commit, push) or reply "Won't fix, because…" and resolve it. Never merge. Robin merges.
```
