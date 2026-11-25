# 0008 — Vendored addy skills

Status: accepted (2026-11-14)

addy/agent-skills is copied unmodified into `skills/addy/` at a pinned commit, with `UPSTREAM.md` and addy's MIT licence. Our integration lives in `skills/oc/` and plugins, never as edits to addy files. `addy-sync` updates the copy after the user approves, and CI rejects other changes to `skills/addy/`.
