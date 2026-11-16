<!-- oc-github template — config only (D33), never copied into an app repo.
     Fill every {{...}} placeholder per slice, delete this comment, then create
     the issue as a sub-issue of the PRD:
     gh issue create --body-file <filled.md> --title "<slice title>" -->

## Parent PRD

#{{prd_issue}}

## What to build

{{what_to_build}}
<!-- vertical: every applicable layer in one PR (for example migration → API →
     generated client → web → E2E); never split into tier-only slices. Skip
     layers and generated artifacts the repo or slice does not have. -->

## Acceptance criteria

{{acceptance_criteria}}
<!-- one per line; each gets its own RED (test-only commit, failing) and GREEN
     (code commit, passing) evidence through sandbox_test -->

## Components touched

{{apps_touched}}
<!-- one area:<app> label per logical component touched, taken from AGENTS.md
     front matter apps: keys; plus area:db / area:infra / area:docs /
     risk:security where they apply. These become the issue's labels. -->

## Contract change

{{contract_change}}
<!-- no/not applicable, or: yes — the declared contract changes and generated
     artifacts are regenerated through generator_service and committed (never
     hand-edited). A repo without an explicit generated contract says no. -->

## Flag plan

{{flag_plan}}
<!-- none, or: the flag name, its default state, what stays hidden behind it,
     and the flag-removal slice that takes it out -->

## Blocked by

{{blocked_by}}
<!-- none, or the slice issue numbers this one waits on. Recorded as GitHub
     blocking relationships where available, with this section as the fallback. -->
