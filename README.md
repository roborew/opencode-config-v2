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

Each project lives in one app repo, but that repo does not have to be a
monorepo. [`templates/project/TEMPLATE.md`](templates/project/TEMPLATE.md)
guides both root-level single-app and multi-app architectures: a full-stack
Next.js or TanStack Start app can use its framework-native layout, while a
React + FastAPI system might use `apps/` and share generated code through
`packages/`. API contracts, generated clients, per-component images, and
build tools apply only when the real architecture needs them. The common
defaults are clear ownership, docs next to the code, and idiomatic stack
choices. How the flow tests is defined separately by the test contract in
`docs/plan/blueprint.md` (§7.2, §9.2).

## Install

### Mac

1. Back up the old config if any, then clone this repo as the config directory:
   `git clone git@github.com:roborew/opencode-config-v2.git ~/.config/opencode`
   (the old v1 config that lived there is retired — nothing is copied from it).
2. `cd ~/.config/opencode && npm install` — installs `@opencode/plugin`, which the
   plugins in `plugins/` resolve at runtime.
3. `opencode` (2.3.0 pinned) → `/connect` for **OpenCode** (Zen) and **OpenCode Go**, and
   paste the API keys. In Go's **Settings › Privacy › Regions** choose **Global** —
   DeepSeek V4.1 Flash needs it.
4. `gh auth login` — the flow creates issues, labels and PRs through `gh`.
5. Optional: `OC_SANDBOX_BACKEND=docker` forces the local Docker backend (the default
   is auto-detect: sidecar → sysbox, local Docker → docker).

### Server

The opencode-server image clones this repo at `CONFIG_REF` into the container's
config directory and adds the server-only overrides (sidecar, gitdir rewrite,
delete guard, localhost rewrite) — see blueprint §10–§11 and tickets 09–10 in the
opencode-server repo. No CodeRabbit CLI and no preview/tunnel settings there.

### Update addy's skills

Ask for the `addy-sync` skill: it fetches upstream at a target ref, shows the diff
of `skills/addy/` and `references/` against the pinned commit in
`skills/addy/UPSTREAM.md`, applies it only after you approve, and updates
`UPSTREAM.md`. The update commit carries an `Addy-Sync: <sha>` trailer — CI rejects
`skills/addy/` changes without it.

Daily use, BLOCKED handling, cleanup and upgrading OpenCode are in
[`docs/runbook.md`](docs/runbook.md).

## Status

The flow is implemented (tickets 00–08, 11): config skeleton, vendored addy
skills, the four plugins (`oc-skills`, `oc-sandbox`, `oc-worktree`,
`oc-pr-monitor`), the five commands, and CI config verification plus plugin
tests. Remaining: the opencode-server work (tickets 09–10, in that repo) and the
recorded end-to-end runs (ticket 12, with Robin). Work is tracked locally in
`.scratch/opencode-v2/issues/` (tickets 00–12, no 03) until the GitHub tracker
is switched on.

## Development

The plugins (`plugins/`) are TypeScript, built on
[`@opencode/plugin`](https://opencode.ai/docs/build/plugins/server/). Plugin
dev dependencies live in `package.json`; `npm install && npm test`. Plugin
tests live in `tests/plugins/` — small tool-interface tests that create
temporary git repos at test time. No app code is committed to this repo
(D34): the flow is accepted by running it on a real app repo.

## Licence

MIT — see [LICENSE](LICENSE).
