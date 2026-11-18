---
name: oc-github
description: GitHub integration for the delivery flow — PRD and slice issues with full bodies from this config's templates, labels created on demand, and PRs opened with gh pr create --body-file. Use whenever work needs an issue, a label, or a PR.
---

# oc-github — GitHub for the flow

All issue and PR bodies come from this config's templates in
`skills/oc/oc-github/templates/` (D33) — never from the app repo. App repos hold
no flow reference material.

## Creating the PRD issue (after Robin approves the spec)

1. Fill `templates/prd.md` (Problem, Solution, User stories, Spec link, Slices
   — left as "auto-filled" for now, Out of scope) from the approved spec.
2. Create it with `gh issue create --body-file <filled.md> --title "<PRD title>"`,
   then apply the `prd` label (`gh issue edit <n> --add-label prd`). Create any
   missing label first with `gh label create <name> --force` — idempotent.

## Creating slice issues (after Robin approves the breakdown)

1. Fill `templates/slice.md` per slice: Parent PRD, What to build, Acceptance
   criteria, Apps touched, Contract change, Flag plan, Blocked by.
2. Create issues in dependency order as sub-issues of the PRD
   (`gh issue create` then the GitHub sub-issue API via `gh api`), label each
   `slice` plus one `area:<app>` per app it touches — the app names come from
   the repo's `AGENTS.md` `apps:` keys — plus `area:db` / `area:infra` /
   `risk:security` / `flag-removal` where they apply, and `status:ready`.
3. Record dependencies as GitHub blocking relationships where available;
   otherwise as the "Blocked by" section of the body.
4. Append `- #<n> — <title>` to the PRD issue's Slices section (`gh issue edit
   <prd> --body-file`) as each slice is created.

## Opening the PR

Push the slice branch, then `gh pr create --body-file <filled pr.md>` with the
branch's changes: `Closes #N`, `Part of #PRD`, what changed, contract change and
any regenerated artifacts, red/green evidence, `sandbox_gate` result, review summary,
flag state, and Deploy notes.

## Labels

The full set lives in `templates/labels.json` (config only): `prd`, `slice`,
`area:<app>`, `area:db`, `area:infra`, `area:docs`, `risk:security`,
`status:ready|in-progress|in-review|blocked`, `flag-removal`. Missing labels are
created on first use; `area:<app>` names always come from the target repo's
`AGENTS.md`. The `_generated` key in `labels.json` is a hint about those
on-demand `area:<app>` labels, not a label — skip every key starting with `_`
when creating labels.

When a PRD's last slice merges, close the PRD issue (`gh issue close <prd>`).
