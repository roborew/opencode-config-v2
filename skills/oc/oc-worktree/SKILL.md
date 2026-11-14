---
name: oc-worktree
description: Slice worktrees and sessions — call slice_start for unblocked slices, slice_status to report, slice_sync after merges, slice_finish after Robin merges. Use for anything that creates, inspects or cleans up slice worktrees.
---

# oc-worktree — slice worktrees

One slice = one issue = one worktree off `origin/main` on branch
`slice/<N>-<slug>`, with its own OpenCode session already running `/build #N`.

## Tools

- `slice_start({ issue })` — refuses when the issue has open blockers or no
  parallel slot is free (max 3). Creates the worktree through the plugin's own
  worktree strategy, copies `.env*` files for Robin's convenience (paths only,
  never values; tests never depend on them), saves the slice record, creates the
  session titled `#N <title>` and submits `/build #N` in it. Sets
  `status:in-progress`.
- `slice_status()` — every active slice as `{issue, branch, sessionID, state,
  prURL?}` with state `building | in-review | ready | blocked`.
- `slice_sync()` — after any merge to `main`: merges `origin/main` into each
  open slice. Conflicts come back as BLOCKED and are never forced.
- `slice_finish({ issue })` — only after the PR is merged. Refuses dirty or
  unpushed worktrees; removes the worktree and branch behind the device/inode
  guard.

## Rules

- Call these from the main checkout only. Never create worktrees by hand
  (`git worktree` is denied); never in a slice worktree.
- If `slice_start` returns `{ blocked: reason }`, report the reason and pick the
  next unblocked slice instead.
- Errors distinguish "OpenCode server unreachable" (restart the server and
  retry) from "path is not a git worktree" (recoverable: prune and retry once).
