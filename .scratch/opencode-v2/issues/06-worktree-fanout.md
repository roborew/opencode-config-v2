# 06 — oc-worktree: /build in the main checkout fans out slice worktrees and sessions

**What to build:** Following blueprint §7.1: `oc-worktree` and its skill, and the coordinator part of `/build`. In the fixture's main checkout, `/build` starts up to 3 unblocked slices. Each gets a worktree off `origin/main`, copied `.env` files (for Robin's use only), a slice record, and a visible session already running `/build #N`.

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] Branches and worktrees are named `slice/<N>-<slug>` and sessions are titled `#N <title>`
- [ ] Three slices run their full test contract at the same time with no clashes
- [ ] No env values appear in any transcript, and tests pass even with the copied `.env` files removed
- [ ] A 4th slice waits for a slot, and a blocked slice is refused with its reason
- [ ] `slice_sync` merges `origin/main` into open slices and reports conflicts as BLOCKED
- [ ] `slice_finish` refuses dirty or unpushed worktrees, the device/inode guard holds, and errors tell "server unreachable" apart from "not a git worktree"
