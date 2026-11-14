---
description: Build — coordinate slices (main checkout) or build one slice (#N)
agent: build
---

Arguments: $ARGUMENTS

If no `#N` is given and you are in the main checkout:
Load @oc-worktree. List the PRD's open slices with status:ready whose blockers are all closed. Call slice_start for each, up to the slot limit, then report slice_status. Don't implement anything here.

If `#N` is given and you are in that slice's worktree (oc-skills has already added the base and area skills):

1. sandbox_up.
2. Work in vertical order: migration (expand) → API → regenerate the client through the contract's generator service (commit it; never hand-edit it) → web → E2E. For each acceptance criterion: write the failing test, commit it test-only, run sandbox_test with the focused test (the app's test service plus args; it must fail = RED); write the minimum code, commit, re-run it (it must pass = GREEN).
3. Run sandbox_gate. On failure follow @debugging-and-error-recovery. After 3 failed attempts on the same criterion, stop as BLOCKED and comment on the issue.
4. Continue with /review, then /ship.
   Never edit or weaken a test to make it pass. Never run docker or tests directly on the host; use oc-sandbox.
