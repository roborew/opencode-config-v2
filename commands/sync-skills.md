---
description: Preview and approve stable-release updates for vendored Addy and Matt skills
agent: skill-admin
---

@skills-sync

Arguments: $ARGUMENTS

Synchronize the vendored Addy and Matt skill trees from their latest stable
GitHub releases. With no arguments, resolve both latest non-draft,
non-prerelease releases. Accept `addy=<tag-or-sha>` and
`matt=<tag-or-sha>` for a reproducible update; `main` is preview-only and
never the default or a fallback.

Show one combined diff and lifecycle-impact report, wait for explicit approval,
then apply only the approved changes. Never change Plan/Build Matt isolation or
activate a new Addy skill without approval. Run config verification before
reporting success. Do not commit, push, open issues or PRs, or merge.
