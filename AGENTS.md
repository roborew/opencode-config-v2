# AGENTS.md — opencode-config-v2

When this repo is the OpenCode config directory (cloned to `~/.config/opencode`
on the Mac, or at `CONFIG_REF` in the opencode-server image), this file is the
global instruction set for every project. The second half covers working on this
config repo itself.

## The delivery flow

Two primary modes override OpenCode's built-in agents: **plan** (Define + Plan)
and **build** (Build → Verify → Review → Ship). The lifecycle follows addy's
agent-skills: Define → Plan → Build → Verify → Review → Ship, trunk-based — one
vertical slice = one issue = one worktree off `origin/main` = one PR to `main`.
The user approves specs and slice breakdowns and merges; agents never merge.

Core rules in every mode:

- Tests run only through the `oc-sandbox` tools, fully isolated in Docker —
  never on the host, never through raw `docker` or `just`.
- Slice worktrees, branches and sandboxes are named `slice/<N>-<slug>`; only
  plugins touch `git worktree` and Docker.
- `.env` values are never printed; worktrees get copies of `.env*` for the user
  only, and tests never depend on them.
- Models come from OpenCode Zen and OpenCode Go only; force-push and
  push-to-main are denied by policy.

## Two gateway modes, then contextual Addy skills

**Plan and Build are the only gateways the flow needs.** The `oc-skills` prompt hook
reads `session.agent` and always attaches `using-agent-skills` plus
`oc-plan-gateway` or `oc-build-gateway`, including sessions without a command.
Commands are explicit/recovery entry points into the same gateways, not a second
workflow. A routing failure rejects prompt admission rather than silently losing
required skills.

The gateways own phase transitions and human handoffs. The canonical skill
owners, triggers, activation phases and evidence requirements live in
`plugins/shared/lifecycle-policy.ts`; do not maintain a second trigger table in
this file, a gateway or a command.

Use `using-agent-skills` whenever context changes and follow the lifecycle
instruction supplied for the current session. Labels and app front matter
supply deterministic context, while the actual working-tree and final diff can
add requirements but never suppress one. Judgment-based triggers are declared
and reviewed explicitly; ambiguity blocks for a coordinator or human decision
rather than becoming “not applicable”. Run every applicable workflow, not every
skill on every task.

The 25-skill policy, mode/gateway permissions, skill files and command
references are regression-tested; config verification enforces missing skill
references.

## App repos

Each project has one app repo, whose internals may be a single application or a
multi-app monorepo. `templates/project/TEMPLATE.md` provides architecture
guidance for both without requiring `apps/`, `packages/`, a separate API or any
particular framework. The test contract and app-repo rules are in
`docs/plan/blueprint.md` §9. App repos hold **facts about themselves only**
(D33): code, `compose.yml`, Dockerfiles, CI, docs, applicable scoped skills and
the `AGENTS.md` front matter. All flow reference material (issue and
PR bodies, labels) lives in this config under `skills/oc/oc-github/templates/`.

---

# Working on this config repo itself

This repository is under construction from a fixed plan pack. If you are an
agent working here, read this half first and follow it.

## What this repo is

- **It is the OpenCode config directory.** It holds no app code (D34) — only
  what OpenCode needs to run, plus config verification.
- **App repos use `templates/project/TEMPLATE.md` as architecture guidance.**
  One repo may hold a root-level single app or several apps; framework-native
  layouts are valid and API/client boundaries apply only when they exist. The
  template covers architecture only; how the flow tests is set by the test
  contract in `docs/plan/blueprint.md` (§7.2, §9.2).

## How work happens here

- The plan pack is the source of truth. Read it in the order given in
  `docs/plan/README.md`: `spec.md` → `blueprint.md` → `commands.md` →
  `decisions.md` → `docs/CONTEXT.md` and `docs/adr/` → the tickets.
- Work is tracked as the local tickets in `.scratch/opencode-v2/issues/`
  (00–12, with no 03), in dependency order (the build order in
  `docs/plan/README.md`). Each ticket names its blockers. Do exactly one ticket
  per session, and stop where the ticket says to stop.
- Anything the spike settled is recorded in `docs/adr/0009-spike-results.md`;
  the blueprint records the confirmed approaches.
- If the spec and the blueprint disagree, the blueprint wins on detail and the
  spec wins on intent (`docs/plan/spec.md`).

## Hard rules

- Nothing is pushed or published, and no GitHub issues are opened, until the user
  explicitly approves. The user merges; agents never merge, never force-push, and
  never push to `main`.
- Nothing is copied from earlier config repos. The only vendored content is
  addy's skills under `skills/addy/`, unmodified at the commit pinned in
  `skills/addy/UPSTREAM.md` and changed only by `addy-sync` (commits touching
  it need an `Addy-Sync: <sha>` trailer).
- Agents never run raw `docker`, `git worktree` or `sandbox` commands in app
  repos; every test run goes through `oc-sandbox`, fully isolated in Docker.
- Real secrets never enter this repo. CI (gitleaks) scans every commit.

## Conventions

- LF line endings everywhere (`.gitattributes` and `.editorconfig`, enforced
  in CI).
- GitHub Actions are pinned to commit SHAs.
- The glossary is `docs/CONTEXT.md`: terms like _slice_, _PRD_ and _sandbox_
  mean exactly what it says there.

## Status

Under construction — see the current ticket for what exists and what is still
to come. The final layout is `docs/plan/blueprint.md` §2.
