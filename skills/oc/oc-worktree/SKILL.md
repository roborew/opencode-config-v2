---
name: oc-worktree
description: Central slice coordination — start/status/sync/finish worktrees, route user feedback to an existing worker with slice_message, and let a worker report BLOCKED with slice_block.
---

# oc-worktree — slice worktrees

One slice = one issue = one worktree off `origin/main` on branch
`slice/<N>-<slug>`, with its own OpenCode session already running `/build #N`.

## Tools

- `slice_start({ issue })` — refuses when the issue has open blockers or no
  parallel slot is free (max 3). Creates the worktree through the plugin's own
  worktree strategy, copies `.env*` files for Robin's convenience (paths only,
  never values; tests never depend on them), saves the slice record, creates the
  session titled `#N <title>` and submits `/build #N` in it. Replaces
  `status:ready` with `status:in-progress`. If a slice record already exists,
  returns that active slice instead of creating a duplicate worker.
- `slice_status()` — every active slice as `{issue, branch, sessionID, state,
  prURL?}` with state `building | in-review | ready | blocked`.
- `slice_message({ issue, text })` — from the central build session, sends
  The user's pre-merge review/testing feedback to the slice's existing `sessionID`.
  Verifies the PR is still OPEN; MERGED/CLOSED feedback needs a new slice. The
  worker fixes the same worktree, branch and PR, then restarts `prmon_watch`.
  Marks the slice `building` again.
- `slice_resume({ issue })` — from the central build session, resumes a BLOCKED
  slice in its existing worker and worktree after the blocker is resolved. Use
  this for pre-PR blockers; the worker does not need a fresh `/build #N` run.
- `slice_block({ issue, reason })` — from that slice's own worktree only, marks
  it `blocked`, retains the reason, attempts an issue comment and notifies the
  central build session.
- `slice_sync()` — after any merge to `main`, and on every `/build` run: merges
  `origin/main` into building slices, retrying any `syncPending` work. READY and
  BLOCKED slices are excluded. Conflicts come back as BLOCKED and are never forced.
- `slice_finish({ issue })` — only after the PR is merged. Refuses dirty or
  unpushed worktrees; removes the worktree and branch behind the device/inode
  guard.

## Rules

- `slice_start`, `slice_status`, `slice_message`, `slice_sync` and `slice_finish`
  run from the main checkout only. `slice_block` is the exception: a worker calls
  it only for its own slice. Never create worktrees by hand (`git worktree` is
  denied), and never start a slice from inside another slice worktree.
- If `slice_start` returns `{ blocked: reason }`, report the reason and pick the
  next unblocked slice instead.
- Errors distinguish "OpenCode server unreachable" (restart the server and
  retry) from "path is not a git worktree" (recoverable: prune and retry once).
