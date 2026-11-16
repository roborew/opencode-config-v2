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
