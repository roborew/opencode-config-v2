---
description: Ship — push, open the PR, start the PR monitor
agent: build
---

@git-workflow-and-versioning @oc-github @oc-pr-monitor

Push `slice/<N>-<slug>`. Check whether the branch already has an OPEN PR. If it does, push the fix to that branch and call prmon_watch for that PR; never run `gh pr create` again. If it does not, open the PR with `gh pr create --body-file`, using oc-github's `pr.md` template from the config — never a repo template: Closes #N, Part of #PRD, what changed, contract change and any regenerated artifacts, the redgreen_check and sandbox_gate output, the review summary, the flag state, deploy notes. Call prmon_watch, then go idle. When the monitor wakes you: fix each listed item (commit, push) or reply "Won't fix, because…" and resolve it. Never merge. The user merges.
