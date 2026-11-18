---
name: oc-pr-monitor
description: The zero-token PR wait loop — call prmon_watch after opening a PR, handle wake-ups by fixing or replying to each listed item, and respect the round cap. Use whenever a slice PR is open and waiting on review or CI.
---

# oc-pr-monitor — waiting for review without spending tokens

After `/ship` opens the PR, call `prmon_watch({ slice, pr })` and go idle. The
monitor polls GitHub on a timer (`gh api graphql`) — no model calls happen
between wakes. Every review thread is included regardless of its author or app:
CodeRabbit, Kilo, Copilot, security scanners and human reviewers all follow the
same fix-or-reply-and-resolve loop.

## Handling a wake-up

A wake lists only the NEW unresolved review threads (file, line, body) and the
failed checks (name, log tail URL). For each item, either:

1. **Fix it**: commit, push (only ever to the slice branch), or
2. **Decline it**: reply starting exactly with "Won't fix, because…" and resolve
   the thread.

Then go idle again. Never merge; Robin merges.

## Rounds and end states

- Each wake is one round. The cap is 5 rounds — on the 6th the slice becomes
  BLOCKED and the monitor posts a summary on the issue.
- A resolved-to-unresolved thread transition counts as actionable feedback even
  if its text did not change. Coordinator READY delivery, worker wake-up and the
  PR comment are retried independently, so a transient failure does not repeat
  the steps that already succeeded.
- READY means every review thread is resolved and `ci-ok` passed: the monitor
  sets `status:ready`, posts a short PR comment and notifies both the worker and
  central build session. It keeps watching for late feedback until merge.
- MERGED stops the watch and notifies central build. CLOSED without merge also
  stops it and asks the user to decide whether to reopen or close the slice.

## Tools

- `prmon_watch({ slice, pr })` — start or resume watching; records the PR URL
  and `in-review` state, then returns `{ watching: true }`. Call it again after
  pushing a fix requested through `slice_message`.
- `prmon_status({ slice })` — `{ round, threadsOpen, checks: {pending, failed,
  passed}, state }`.
