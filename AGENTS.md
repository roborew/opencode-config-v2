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
Robin approves specs and slice breakdowns, and Robin merges; agents never merge.

Core rules in every mode:

- Tests run only through the `oc-sandbox` tools, fully isolated in Docker —
  never on the host, never through raw `docker` or `just`.
- Slice worktrees, branches and sandboxes are named `slice/<N>-<slug>`; only
  plugins touch `git worktree` and Docker.
- `.env` values are never printed; worktrees get copies of `.env*` for Robin
  only, and tests never depend on them.
- Models come from OpenCode Zen and OpenCode Go only; force-push and
  push-to-main are denied by policy.

## Phase → skill table

Skills load deterministically: command templates name them with `@skill-id`,
and the `oc-skills` prompt hook adds the slice's base and `area:*` skills. This
table is the soft fallback when work arrives outside a command.

| Trigger                                   | Skills added                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/spec`                                   | interview-me, spec-driven-development (+ idea-refine if the idea is vague; + api-and-interface-design when contracts change)                                                                                        |
| `/plan`                                   | planning-and-task-breakdown, oc-github (+ documentation-and-adrs when a decision is recorded)                                                                                                                       |
| `/build` (main checkout)                  | oc-worktree                                                                                                                                                                                                         |
| `/build #N` (slice) base                  | incremental-implementation, test-driven-development, context-engineering, oc-sandbox                                                                                                                                |
| label `area:<app>` (one per `apps/<app>`) | the skills mapped to that app in the repo's `AGENTS.md` front matter (`apps.<app>.skills`). Defaults by kind: backend → api-and-interface-design; frontend → frontend-ui-engineering, browser-testing-with-devtools |
| any `area:<app>`                          | that app's own `apps/<app>/.agents/skills/` (added by the oc-skills hook)                                                                                                                                           |
| label `area:db`                           | deprecation-and-migration (expand/contract)                                                                                                                                                                         |
| label `area:infra`                        | ci-cd-and-automation                                                                                                                                                                                                |
| label `risk:security`                     | security-and-hardening (+ the security-auditor subagent)                                                                                                                                                            |
| on test failure                           | debugging-and-error-recovery                                                                                                                                                                                        |
| `/review`                                 | code-review-and-quality, code-simplification                                                                                                                                                                        |
| `/ship`                                   | git-workflow-and-versioning, oc-github, oc-pr-monitor                                                                                                                                                               |

Every skill named here must exist on disk (`skills/addy/` or `skills/oc/`);
config verification in CI enforces it.

## App repos

App repos use the monorepo layout and architecture from
`templates/project/TEMPLATE.md` (layout only), plus the test contract and
app-repo rules in `docs/plan/blueprint.md` §9. App repos hold **facts about
themselves only** (D33): code, `compose.yml`, Dockerfiles, CI, docs, per-app
skills and the `AGENTS.md` front matter. All flow reference material (issue and
PR bodies, labels) lives in this config under `skills/oc/oc-github/templates/`.

---

# Working on this config repo itself

This repository is under construction from a fixed plan pack. If you are an
agent working here, read this half first and follow it.

## What this repo is

- **It is the OpenCode config directory.** It holds no app code (D34) — only
  what OpenCode needs to run, plus config verification.
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
- Anything the spike settled is recorded in `docs/adr/0009-spike-results.md`;
  the blueprint records the confirmed approaches.
- If the spec and the blueprint disagree, the blueprint wins on detail and the
  spec wins on intent (`docs/plan/spec.md`).

## Hard rules

- Nothing is pushed or published, and no GitHub issues are opened, until Robin
  explicitly approves. Robin merges; agents never merge, never force-push, and
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
