# 12 — End-to-end run on the Mac and the server, install docs and runbook

**What to build:** A recorded full run (`/spec` → `/plan` → `/build` → PRs → Robin merges) on an app repo prepared with `repo-setup`, on both the Mac (docker backend) and the server (sysbox backend), including at least one slice that changes API and web together. The README gets the install steps for each, and `docs/runbook.md` covers daily use, BLOCKED handling, `addy-sync`, cleanup and upgrading OpenCode.

**Blocked by:** 08, 10, 11

**Status:** ready-for-agent

- [ ] Both runs finish with every slice merged, `ci-ok` green and the PRD closed
- [ ] The cross-stack slice landed as one PR with a regenerated client and E2E
- [ ] The README install steps work from a clean machine
- [ ] Time and model cost per slice are recorded in the runbook
- [ ] The repo is tagged `v2.0.0` only after Robin approves
