# 08 — Ship and the PR monitor

**What to build:** Following blueprint §7.3 and §9.3: `/ship`, `oc-pr-monitor` and its skill, and the PR template. The slice session pushes, opens the PR (`Closes #N`, `Part of #PRD`, contract change, red/green and gate evidence, review summary) and starts the monitor. The monitor wakes the session only on change, the session fixes or replies "Won't fix, because…", and the slice ends READY (all threads resolved and `ci-ok` green) or BLOCKED.

**Blocked by:** 06, 07

**Status:** ready-for-agent

- [ ] No model calls happen between wakes
- [ ] A wake lists only new unresolved threads and failed checks
- [ ] The 6th round results in BLOCKED with a summary on the issue
- [ ] READY requires every thread resolved and `ci-ok` passed, and sets `status:ready`
- [ ] After Robin merges, `slice_finish` and `slice_sync` run, and the PRD closes when its last slice merges
