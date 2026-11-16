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

Arguments: $ARGUMENTS

If no `#N` is given and you are in the main checkout:
Load @oc-worktree. List the PRD's open slices with status:ready whose blockers are all closed. Call slice_start for each, up to the slot limit, then report slice_status. Don't implement anything here.

If `#N` is given and you are in that slice's worktree (oc-skills has already added the base and area skills):

1. sandbox_up.
2. Work in vertical order through only the layers that exist and the slice touches: for example migration (expand) → API → regenerate the client through the declared generator service (commit it; never hand-edit it) → web → E2E. Skip absent layers and do not invent a separate backend or generated client for a self-contained full-stack app. For each acceptance criterion: write the failing test, commit it test-only, run sandbox_test with the focused test (the app's test service plus args; it must fail = RED); write the minimum code, commit, re-run it (it must pass = GREEN).
3. Run sandbox_gate. On failure follow @debugging-and-error-recovery. After 3 failed attempts on the same criterion, stop as BLOCKED and comment on the issue.
4. Continue with /review, then /ship.
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
