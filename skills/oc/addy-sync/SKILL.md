---
name: addy-sync
description: Updates the vendored addy skills under skills/addy/ from upstream after the user approves the diff. Use only when the user asks for an addy update; nothing else may change skills/addy/.
---

# addy-sync — vendoring updates for addy's skills

`skills/addy/` is unmodified upstream content from
<https://github.com/addyosmani/agent-skills>, pinned in
`skills/addy/UPSTREAM.md`. This skill is the ONLY thing that may change it.

## Procedure

1. Fetch upstream at the target ref (default: `main`) into a throwaway clone.
2. Show the user the diff of `skills/addy/` (all 25 skills plus `references/`)
   against the pinned commit from `UPSTREAM.md` — new, changed and removed
   files.
3. **Wait for an explicit approval.** Change nothing without it.
4. On approval: copy the new `skills/<id>/` skills and `references/` over
   `skills/addy/`, delete skills that upstream removed, keep `LICENSE`
   (upstream's MIT, verbatim), and update `UPSTREAM.md` (URL, commit SHA, date,
   licence).
5. The update commit must carry an `Addy-Sync: <sha>` trailer naming the
   upstream commit — CI rejects `skills/addy/` changes without it.

## After any sync

Flag every skill that upstream renamed or removed that is still referenced in
the phase → skill table of the global `AGENTS.md`, in any agent's `skill`
permission allow-list, or in a command template — those references must be
repaired in the same commit or the config verification fails.
