---
name: oc-worktree
description: Central slice coordination — start/status/sync/finish worktrees, route user feedback to an existing worker with slice_message, let a worker report BLOCKED with slice_block, surface worker questions answered by slice_resume, and never let a slice worktree wait on the human.
---

# oc-worktree — slice worktrees

One slice = one issue = one worktree off `origin/main` on branch
`slice/<N>-<slug>`, with its own OpenCode session already running `/build #N`.

## Tools

- `slice_start({ issue })` — refuses when the issue has open blockers or no
  parallel slot is free (max 3). Creates the worktree through the plugin's own
  worktree strategy, copies `.env*` files for convenience (paths only,
  never values; tests never depend on them), saves the slice record, creates
  the session titled `#N <title>` with the user-facing `question` tool denied
  on that session, and submits `/build #N` in it. Replaces `status:ready` with
  `status:in-progress`. If a slice record already exists, returns that active
  slice instead of creating a duplicate worker.
- `slice_status()` — every active slice as `{issue, branch, sessionID, state,
  prURL?}` with state `building | in-review | ready | blocked`, including a
  BLOCKED slice's retained reason and question. Also re-asserts the
  `question` deny on legacy worker sessions.
- `slice_message({ issue, text })` — from the central build session, sends
  The user's pre-merge review/testing feedback to the slice's existing `sessionID`.
  Verifies the PR is still OPEN; MERGED/CLOSED feedback needs a new slice. The
  worker fixes the same worktree, branch and PR, then restarts `prmon_watch`.
  Marks the slice `building` again.
- `slice_resume({ issue, answer? })` — from the central build session, resumes
  a BLOCKED slice in its existing worker and worktree after the blocker is
  resolved. When the worker asked a question, pass the coordinator's `answer`:
  it is delivered as the prompt that wakes the same session — a generic
  "blocker resolved" prompt is not enough, and a replan can be phrased as the
  answer. With `answer` on a building/in-review slice it also settles a worker
  stuck on a user-facing question form: the pending form is cancelled and the
  answer is delivered to that same session.
- `slice_block({ issue, reason, question? })` — from that slice's own worktree
  only, marks it `blocked`, retains the reason (and, when given, the question),
  attempts an issue comment and notifies the central build session. Pass
  `question` when the slice needs a decision or missing information; the
  coordinator answers through `slice_resume`.
- `slice_sync()` — after any merge to `main`, and on every `/build` run: merges
  `origin/main` into building and in-review slices, retrying any `syncPending`
  work. READY and BLOCKED slices are excluded. Conflicts come back as BLOCKED
  and are never forced. When the merge changes an in-review branch, the worker is
  woken to verify and push it, and READY stays deferred until the push lands.
- `slice_finish({ issue })` — only after the PR is merged. Refuses dirty or
  unpushed worktrees; removes the worktree and branch behind the device/inode
  guard.

## Rules

- `slice_start`, `slice_status`, `slice_message`, `slice_sync` and `slice_finish`
  run from the main checkout only. `slice_block` is the exception: a worker calls
  it only for its own slice. Never create worktrees by hand (`git worktree` is
  denied), and never start a slice from inside another slice worktree.
- A slice worktree never waits on the human. The user-facing `question` tool is
  denied on every worker session (set at `slice_start`, re-asserted by
  `slice_status`); a denied `question` is never retried. Surface an actionable
  question through `slice_block({ issue, reason, question })`, then go idle; the
  coordinator answers or replans through `slice_resume({ issue, answer })`, which
  wakes this same session with the answer.
- If `slice_start` returns `{ blocked: reason }`, report the reason and pick the
  next unblocked slice instead.
- Errors distinguish "OpenCode server unreachable" (restart the server and
  retry) from "path is not a git worktree" (recoverable: prune and retry once).
