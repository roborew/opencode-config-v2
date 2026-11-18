---
description: Build — coordinate slices (main checkout) or build one slice (#N)
agent: build
---

@oc-worktree

Arguments: $ARGUMENTS

If no `#N` is given and you are in the main checkout, you are the user's persistent build coordinator. Never implement here.

1. Reconcile merges before dispatching new work. For the slice the user names and every active slice whose PR GitHub reports as MERGED, call slice_finish. Verify that its `Closes #N` link closed the slice issue; only after confirming the merge, close it explicitly if it is still open. Never close an unmerged slice.
2. After any merge, call slice_sync once to merge origin/main into the remaining active slices. Report conflicts as BLOCKED; never force them.
3. Load @oc-github. If the merged slice's PRD has no open slice issues left, close the PRD. Otherwise leave it open.
4. Identify the PRD from the central session's context; ask the user only if it is ambiguous. List its open slices with status:ready whose blockers are all closed, excluding every issue already listed by slice_status. On an active record, `ready` means READY for user review—not ready to dispatch again. Call slice_start for each remaining slice, up to the slot limit; slice_start is idempotent for an existing record.
5. Report slice_status with what finished, what started, what is READY, and what is BLOCKED.

When the user says "I merged #N" in this central build session, run that same reconciliation before starting more work. When the user reports a problem with an open slice or PR, call slice_message({ issue: N, text: "user feedback" }) to wake its existing worker. Do not fix it here, create another session, or open another PR. When a READY, BLOCKED or MERGED notification arrives, give the user a concise update; READY asks for review and testing, and MERGED waits for the user's reconciliation instruction.

If `#N` is given and you are in that slice's worktree (oc-skills has already added the base and area skills):

1. sandbox_up.
2. Work in vertical order: migration (expand) → API → regenerate the client through the contract's generator service (commit it; never hand-edit it) → web → E2E. For each acceptance criterion: write the failing test, commit it test-only, run sandbox_test with the focused test (the app's test service plus args; it must fail = RED); write the minimum code, commit, re-run it (it must pass = GREEN).
3. Run sandbox_gate. On failure follow @debugging-and-error-recovery. After 3 failed attempts on the same criterion, call slice_block with the actionable reason and go idle. Do not invent requirements.
4. Continue with /review, then /ship. Opening the PR and calling prmon_watch marks the slice in-review; READY and BLOCKED are reported to the central build session automatically.
5. When slice_message wakes you with user feedback, follow its instructions in this same worktree, branch, session and PR, then restart prmon_watch after pushing the fix.

Never edit or weaken a test to make it pass. Never run docker or tests directly on the host; use oc-sandbox.
