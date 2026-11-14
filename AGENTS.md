# AGENTS.md — how agents work on this repo

This repository is Robin's user-level OpenCode 2.x configuration
(`opencode-config-v2`), and it is being built from a fixed plan pack. If you
are an agent working here, read this first and follow it.

## What this repo is

- **It is the OpenCode config directory.** On the Mac it is cloned to
  `~/.config/opencode`; on the server, the opencode-server image clones it at
  `CONFIG_REF`. It is not an app repo and holds no app code.
- **App repos use `templates/project/TEMPLATE.md`** as the example monorepo
  layout and architecture (zones, per-app Dockerfiles, contract-first API,
  docs next to the code). The template covers layout and architecture only;
  how the flow tests is set by the test contract in `docs/plan/blueprint.md`
  (§7.2, §9.2).

## How work happens here

- The plan pack is the source of truth. Read it in the order given in
  `docs/plan/README.md`: `spec.md` → `blueprint.md` → `commands.md` →
  `decisions.md` → `docs/CONTEXT.md` and `docs/adr/` → the tickets.
- Work is tracked as the local tickets in `.scratch/opencode-v2/issues/`
  (00–12, with no 03), in dependency order (the build order in
  `docs/plan/README.md`). Each ticket names its blockers. Do exactly one ticket
  per session, and stop where the ticket says to stop.
- Anything in the blueprint marked **[spike]** is documented but not yet run;
  ticket 01 settles each one. Don't build on a spike until its result is
  recorded.
- If the spec and the blueprint disagree, the blueprint wins on detail and the
  spec wins on intent (`docs/plan/spec.md`).

## Hard rules

- Nothing is pushed or published, and no GitHub issues are opened, until Robin
  explicitly approves. Robin merges; agents never merge, never force-push, and
  never push to `main`.
- Nothing is copied from earlier config repos. The only vendored content is
  addy's skills under `skills/addy/`, unmodified at the commit pinned in
  `skills/addy/UPSTREAM.md` and changed only by `addy-sync`.
- Agents never run raw `docker`, `git worktree` or `sandbox` commands. Once
  the plugins exist, every test run goes through `oc-sandbox`, fully isolated
  in Docker, never on the host.
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
