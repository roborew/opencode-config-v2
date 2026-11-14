# opencode-config-v2

Robin's user-level OpenCode 2.x configuration. It defines one delivery flow —
Define → Plan → Build → Verify → Review → Ship — that behaves identically on his
Mac and on his server, and adds custom pieces only where an external tool
(OpenCode server, GitHub, Sysbox/Docker) has to be integrated.

**This repository is the OpenCode config directory.** It is not an app repo and
holds no app code.

- **On the Mac:** clone it to `~/.config/opencode`. OpenCode then loads
  `opencode.jsonc`, `agents/`, `commands/`, `skills/` and `plugins/` from there
  for every project.
- **On the server:** the opencode-server image clones this repo at `CONFIG_REF`
  into the config directory. Server-only behaviour (gitdir rewrite, delete
  guard, localhost rewrite) lives in opencode-server overrides, never here.

## App repos

App repos use the monorepo **layout and architecture** from
[`templates/project/TEMPLATE.md`](templates/project/TEMPLATE.md) — the example
(taken from Rekalled): zones (`apps/`, `packages/`, `infra/`, `scripts/`,
`docs/`, `.github/`), a Dockerfile and image per app, a contract-first API with
a generated client, a layered backend, a feature-based frontend, and docs next
to the code. The template covers layout and architecture only. How the flow
tests is defined by the test contract in `docs/plan/blueprint.md` (§7.2, §9.2),
not by the template.

## Status

Under construction from the plan pack. Start at
[`docs/plan/README.md`](docs/plan/README.md) for the reading order and the
build order of the tickets. Work is tracked locally in
`.scratch/opencode-v2/issues/` (tickets 00–12) until the GitHub tracker is
switched on. The layout above (agents, commands, skills, plugins) is filled in
by later tickets; the initial commit holds the plan pack, the Project Template,
this README and CI.

## Updating addy's skills

addy's agent-skills are vendored **unmodified** under `skills/addy/` at the
commit pinned in `skills/addy/UPSTREAM.md` (MIT licence). Only the `addy-sync`
skill may change that folder; CI rejects any other change to it.

## Development

The plugins (`plugins/`) are TypeScript, built on
[`@opencode/plugin`](https://opencode.ai/docs/build/plugins/server/). Plugin
dev dependencies live in `package.json`; `npm install && npm test`. Plugin
tests live in `tests/plugins/` and always run fully isolated in Docker, never
on the host.

## Licence

MIT — see [LICENSE](LICENSE).
