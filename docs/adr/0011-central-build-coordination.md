# 0011 — One central build session coordinates all slice workers

Status: accepted (2026-11-18)

## Context

The two-mode flow was ambiguous about session ownership. The user could see slice sessions and incorrectly assume they needed to enter worktrees to manage them. READY notifications went only to workers, post-merge cleanup was documented but not orchestrated, and there was no way for the user to send acceptance feedback back to the worker that owned the PR.

## Decision

The user works in one central OpenCode session in the app repo's main checkout. Plan defines the spec, PRD and slices; after the explicit handoff, the same central session stays in build mode for the whole PRD. Main-checkout build coordinates only and never implements.

`oc-worktree` records the coordinator session ID alongside each worker session. `slice_message` routes the user's pre-merge feedback to the existing worker, branch and PR. Workers call `slice_block` for local blockers. The PR monitor updates the durable slice record, sends READY/BLOCKED/MERGED notifications to the coordinator, and remains armed after READY for late feedback until merge or close.

When the user reports a merge, central build verifies it, finishes the worktree, confirms issue closure, syncs active slices from `origin/main`, closes the PRD if complete, then starts newly unblocked slices. The user still reviews, tests and merges; agents never merge. Post-merge defects become new slices rather than reopening cleaned-up worktrees.

GitHub and slice records are the source of truth. Session prompts are notifications and wake-ups, not durable state.

## Alternatives considered

- **Plan orchestrates workers:** rejected because it blurs the Define/Plan and Build/Verify/Review/Ship permission boundary and forces a mode switch after every merge.
- **The user visits slice sessions:** rejected as unnecessary session hopping and duplicated coordination context.
- **Create a new worker for acceptance feedback:** rejected because the existing worker already owns the relevant context, worktree, branch and PR.

## Consequences

The user needs to enter slice sessions only for exceptional manual inspection. Normal operation is plan once, switch to build, respond to READY/BLOCKED updates, merge, and tell central build to reconcile. The coordinator and worker session IDs must survive in plugin storage so routing and watches can resume after idle periods and server restarts.
