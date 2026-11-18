# Command template drafts

These are drafts of the files in `commands/`. They are adapted from addy's `commands/*.toml` at commit `39b723c` (MIT); the output paths and GitHub integration are our changes. Ticket 01 confirms that `@skill-id` loads inside a template. If it doesn't, the `oc-skills` hook adds the same skills.

## commands/spec.md

```markdown
---
description: Define — interview, then write a spec and open the PRD issue
agent: plan
---

@interview-me @spec-driven-development @oc-github

Idea: $ARGUMENTS

1. Interview me until objective, users, acceptance criteria, constraints and boundaries are clear. If the idea is still vague, also load @idea-refine. If interfaces or contracts change, also load @api-and-interface-design.
2. Read the repo's AGENTS.md front matter (apps, stacks, contract). Write the spec to docs/spec/<slug>.md (not SPEC.md). Use explore/general subagents for any repo research.
3. Show me the spec and wait for an unambiguous approval ("approve", "go", "yes"). Hedged answers are not approval.
4. After approval: commit the spec on a `spec/<slug>` branch, open a PR for it, and create the PRD issue (label `prd`) from the PRD template, linking the spec.
```

## commands/plan.md

```markdown
---
description: Plan — split an approved spec into vertical-slice issues
agent: plan
---

@planning-and-task-breakdown @oc-github

PRD: $ARGUMENTS (issue number or spec path)

1. Read the spec and the relevant code (through explore). Plan in read-only mode.
2. Draft vertical slices: each one goes through every applicable layer in one slice (for example migration → API → generated client → web → E2E, never split into tier-only PRs), skipping layers and generated artifacts the repo does not have. A full-stack app or repo with no separate API needs no imaginary backend or client-generation steps. Each slice is mergeable to main on its own and fits one fresh context. Record dependencies. Schema changes are expand/contract. Incomplete behaviour hides behind a flag, and each flag gets a `flag-removal` slice.
3. For each slice: title, what to build, acceptance criteria, blocked-by, an `area:<app>` label for each logical component from the repo's `AGENTS.md` touched (+ `area:db`/`area:infra`), contract change yes/no, `risk:security` when it applies, and the flag plan.
4. Show me the numbered breakdown and wait for an unambiguous approval.
5. After approval: create the slice issues in dependency order as sub-issues of the PRD, with blocking relationships and `status:ready`. If a decision was made, record it with @documentation-and-adrs.
```

## commands/build.md

```markdown
---
description: Build — coordinate slices (main checkout) or build one slice (#N)
agent: build
---

@oc-worktree

Arguments: $ARGUMENTS

If no `#N` is given and you are in the main checkout, you are the user's persistent build coordinator. Never implement here.

1. Reconcile merges before dispatching new work. For the merged slices the user names, and every active slice whose PR GitHub reports as MERGED, call slice_finish. Keep issue closure conditional on the verified merge, not cleanup success. If slice_finish refuses because the worktree is dirty or unpushed, preserve the worktree and local edits, report the refusal and retained slot, and retry cleanup after the user resolves the cause. Do not report cleanup complete. Verify that the `Closes #N` link closed the slice issue; only after confirming the merge, close it explicitly if it is still open. Never close an unmerged slice.
2. Call slice_sync on every `/build` run so pending syncs are retried even without a new merge. It merges origin/main into building slices. Report conflicts as BLOCKED; never force them.
3. Load @oc-github. Collect every distinct parent PRD of the slices finished by this reconciliation. Close each PRD that has no open slice issues left; leave the others open.
4. Identify the PRD from the central session's context; ask the user only if it is ambiguous. List its open slices with status:ready whose blockers are all closed, excluding every issue already listed by slice_status and every existing slice record. On an active record, `ready` means READY for user review—not ready to dispatch again. Call slice_start for each remaining slice, up to the slot limit; retrying slice_start recovers an existing record that has no worker session.
5. Report slice_status with what finished, finishing cleanup, what started, what is READY, and what is BLOCKED.

When the user says "I merged #N" in this central build session, run that same reconciliation before starting more work. If the user references a PR, resolve it to its linked active slice first: use `gh pr view <PR> --json closingIssuesReferences,headRefName` and match the closing issue or head branch to an active slice record. If the user names a slice issue, verify that record is active. Then call slice_message({ issue: sliceIssue, text: "user feedback" }); it accepts feedback only while the PR is OPEN. For a BLOCKED slice without an open PR, call slice_resume({ issue: sliceIssue }) after the blocker is resolved. Do not fix work here, create another session, or open another PR. When a READY, BLOCKED or MERGED notification arrives, give the user a concise update; READY asks for review and testing, and MERGED waits for the user's reconciliation instruction.

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

Push `slice/<N>-<slug>`. Open a PR to main with `gh pr create --body-file`, using oc-github's `pr.md` template (from the config, not the repo): Closes #N, Part of #PRD, what changed, contract change and any regenerated artifacts, the redgreen_check and sandbox_gate output, the review summary, the flag state. Call prmon_watch, then go idle. When the monitor wakes you: fix each listed item (commit, push) or reply "Won't fix, because…" and resolve it. Never merge. Robin merges.
```
