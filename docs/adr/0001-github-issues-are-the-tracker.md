# 0001 — GitHub Issues are the tracker

Status: accepted (2026-11-14)

PRDs and slices live as GitHub issues, using sub-issues and blocking relationships. Specs live in the app repo under `docs/spec/` and are linked from the PRD. There are no local task files in app repos. Consequence: `plan` and `build` both need `gh`, and all state is visible on GitHub.
