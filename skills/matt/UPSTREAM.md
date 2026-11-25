# Vendored upstream: mattpocock/skills

- Repository: https://github.com/mattpocock/skills
- Release: `v1.3.2` (published 2026-10-29)
- Tag object: `85cbec972d7a79c278c793d272f7fc715850fad4`
- Commit: `d1478fcb140db0b93c0c8df17bcfd311844749d0`
- Licence: MIT (see `LICENSE`, verbatim from upstream)
- Production contract: `.claude-plugin/plugin.json` (the release's promoted skill manifest)

## Vendored content

All complete skill folders listed by the production manifest:

- `engineering/` — 20 promoted skills.
- `productivity/` — 7 promoted skills.
- `LICENSE` — upstream's MIT licence, verbatim.
- `.claude-plugin/plugin.json` — the production allowlist, verbatim.

Every promoted skill folder is copied whole, including its `SKILL.md`, `agents/openai.yaml` and any companion Markdown, templates or scripts. The upstream README files, `skills/in-progress/`, `skills/misc/`, `skills/deprecated/`, `.out-of-scope/`, documentation site, CI, Changesets and development tooling are not vendored.

This folder is **unmodified** upstream content apart from the relative location of the released files. Only `matt-sync` (the skill at `skills/oc/matt-sync/`) may change it, and only after the diff is approved. Every commit that changes `skills/matt/` must carry a `Matt-Sync: <sha>` trailer naming the upstream commit it vendored; CI rejects anything else.

To check for updates, use `/sync-skills` or see `skills/oc/matt-sync/SKILL.md`.
