---
name: matt-sync
description: Prepares or applies stable-release updates for the vendored Matt Pocock skills under skills/matt/. Use from skills-sync or when the user explicitly asks for a Matt update; nothing else may change skills/matt/.
---

# matt-sync — vendoring updates for Matt Pocock's skills

`skills/matt/` is unmodified upstream content from
<https://github.com/mattpocock/skills>, pinned in `skills/matt/UPSTREAM.md`.
This adapter is the only thing that may change it.

## Prepare

1. Read the current pin and production contract from `UPSTREAM.md` and
   `skills/matt/.claude-plugin/plugin.json`.
2. Resolve the requested target. With no target, choose the latest **non-draft,
   non-prerelease** GitHub release and resolve its tag to a full commit SHA.
   Never default or fall back to `main`.
3. Fetch the target into a throwaway clone outside this repository.
4. Read the target release's `.claude-plugin/plugin.json`. It is the production
   allowlist; do not infer production membership from a `skills.sh` listing or
   from every `SKILL.md` in the repository.
5. Build the exact set of promoted `skills/engineering/<id>/` and
   `skills/productivity/<id>/` directories.
6. Validate:
   - every manifest entry exists and has `SKILL.md` and `agents/openai.yaml`;
   - companion files and executable modes are present;
   - operative Skill-tool references resolve inside the promoted set or are
     reported as external runtime dependencies;
   - no IDs collide with Addy or OC skills;
   - no `in-progress`, `misc`, deprecated or out-of-scope skill is included.
7. Show the diff of `skills/matt/` against the current pin, including added,
   changed, removed and renamed skills.
8. Report OpenCode integration impact:
   - update `agents/matt.md` skill permissions to mirror the promoted set;
   - verify Plan and Build still have no Matt skill allow rules;
   - verify `oc-skills`, gateways, lifecycle commands and `AGENTS.md` contain no
     Matt routing;
   - update the menu/isolation tests and any documented counts.
9. Change nothing yet when called from `skills-sync`: return this report to the
   combined approval gate. When invoked directly, ask for explicit approval
   before applying.

## Apply

Only after approval:

1. Copy the complete promoted skill folders, preserving relative
   `engineering/` and `productivity/` grouping and file modes.
2. Remove only previously vendored skill folders that are no longer promoted or
   no longer exist upstream.
3. Copy the upstream `LICENSE` and `.claude-plugin/plugin.json` verbatim and
   update them if upstream did.
4. Update `UPSTREAM.md` with the repository URL, release tag, tag object when
   relevant, full commit SHA, date and licence.
5. Apply the separately approved `agents/matt.md` permission update.
6. The resulting commit must carry a `Matt-Sync: <full-sha>` trailer naming the
   upstream commit. CI rejects `skills/matt/` changes without it.

## After any sync

The exclusion boundary remains absolute: Matt's beta, frozen, deprecated and
out-of-scope skills are not vendored. Matt remains manual-only and never gains a
Plan/Build activation, `oc-skills` attachment, gateway route or slice overlay.

Never push, publish, open issues or PRs, merge, or commit without a separate
explicit user request.
