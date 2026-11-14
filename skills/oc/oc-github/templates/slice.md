<!-- oc-github template — config only (D33), never copied into an app repo.
     Fill every {{...}} placeholder per slice, delete this comment, then create
     the issue as a sub-issue of the PRD:
     gh issue create --body-file <filled.md> --title "<slice title>" -->

## Parent PRD

#{{prd_issue}}

## What to build

{{what_to_build}}
<!-- vertical: every layer this slice needs (migration → API → generated
     client → web → E2E) in one PR; never split into backend and frontend
     slices. Skip only the layers it doesn't need. -->

## Acceptance criteria

{{acceptance_criteria}}
<!-- one per line; each gets its own RED (test-only commit, failing) and GREEN
     (code commit, passing) evidence through sandbox_test -->

## Apps touched

{{apps_touched}}
<!-- one area:<app> label per app touched, taken from the repo's AGENTS.md
     front matter apps: keys; plus area:db / area:infra / area:docs /
     risk:security where they apply. These become the issue's labels. -->

## Contract change

{{contract_change}}
<!-- yes or no. yes = the API contract changes and the client is regenerated
     through the contract's generator_service and committed (never hand-edited). -->

## Flag plan

{{flag_plan}}
<!-- none, or: the flag name, its default state, what stays hidden behind it,
     and the flag-removal slice that takes it out -->

## Blocked by

{{blocked_by}}
<!-- none, or the slice issue numbers this one waits on. Recorded as GitHub
     blocking relationships where available, with this section as the fallback. -->
