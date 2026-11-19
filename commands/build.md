---
description: Build — explicit entry to coordinate slices (main checkout) or build one slice (#N)
agent: build
---

@using-agent-skills @oc-build-gateway @oc-worktree

Arguments: $ARGUMENTS

Follow `oc-build-gateway` as the canonical workflow; it is also injected when Build is selected without this command.

- With no `#N` in the main checkout, execute the gateway's complete coordinator algorithm: cleanup-pending recovery, verified-merge reconciliation, synchronization, PRD closure, worker recovery/dispatch, and status reporting. Never implement in main.
- With `#N` in that slice's worktree, execute the gateway's slice workflow using the base/area skills already attached by oc-skills. Start `sandbox_up`; follow RED/GREEN for every acceptance criterion; keep implementation inside the approved layers; run `sandbox_gate`; use @debugging-and-error-recovery on failure; call `slice_block` with an actionable reason after three failed attempts rather than inventing requirements.
- Use the gateway's context-sensitive Addy workflows throughout implementation and review. /review and /ship remain explicit/recovery forms of its review and PR-delivery stages, not extra phase commands Robin must remember.
- When slice_message or slice_resume wakes an existing worker, continue in that worktree, branch, session and PR; restart prmon_watch after pushing the fix or opening the PR. For all worker feedback, recovery and dispatch, route through the gateway—never centrally fix a slice or create replacement sessions/PRs.

Never edit, weaken, skip or delete tests to make them pass. Never run tests or Docker directly on the host; use oc-sandbox. The user merges; agents never merge.
