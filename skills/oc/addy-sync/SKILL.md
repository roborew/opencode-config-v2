---
name: addy-sync
description: Prepares or applies stable-release updates for the vendored Addy skills under skills/addy/. Use from skills-sync or when the user explicitly asks for an Addy update; nothing else may change skills/addy/.
---

# addy-sync — vendoring updates for Addy's skills

`skills/addy/` is unmodified upstream content from
<https://github.com/addyosmani/agent-skills>, pinned in
`skills/addy/UPSTREAM.md`. This adapter is the only thing that may change it.

## Prepare

1. Read the current pin from `UPSTREAM.md`.
2. Resolve the requested target. With no target, choose the latest **non-draft,
   non-prerelease** GitHub release and resolve its tag to a full commit SHA.
   Never default or fall back to `main`.
3. Fetch the target into a throwaway clone outside this repository.
4. Validate that the release carries the complete published skill set, the
   `references/` material those skills require, a licence, and any release
   manifest or version metadata.
5. Show the diff of `skills/addy/` against the pinned commit — new, changed and
   removed files, plus executable-mode changes.
6. Report lifecycle impact:
   - new skills need a proposed owner, activation phase(s), trigger, evidence
     kind and permissions;
   - removed or renamed skills still referenced in
     `plugins/shared/lifecycle-policy.ts`, Plan/Build permissions, commands,
     gateways, `AGENTS.md` or tests need an explicit mapping;
   - content changes that alter a skill's expected behavior or evidence need
     review even when its identity is unchanged.
7. Change nothing yet when called from `skills-sync`: return this report to the
   combined approval gate. When invoked directly, ask for explicit approval
   before applying.

## Apply

Only after approval:

1. Copy complete released skill directories and the root `references/` folder
   over `skills/addy/`.
2. Delete skills that upstream removed.
3. Keep `LICENSE` verbatim and update it if upstream did.
4. Update `UPSTREAM.md` with the repository URL, release tag when known, full
   commit SHA, date and licence.
5. Apply only the separately approved lifecycle/permission reconciliation.
6. The resulting commit must carry an `Addy-Sync: <full-sha>` trailer naming the
   upstream commit. CI rejects `skills/addy/` changes without it.

## After any sync

Flag every skill that upstream renamed or removed and that is still referenced
in the canonical lifecycle policy, any agent's skill permission allow-list, a
command or a gateway. Those references must be repaired in the same approved
change or config verification must fail.

Never push, publish, open issues or PRs, merge, or commit without a separate
explicit user request.
