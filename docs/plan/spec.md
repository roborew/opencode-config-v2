# Spec: OpenCode v2 delivery flow (opencode-config-v2 + opencode-server)

Status: ready-for-agent. Date: 2026-11-14. Repo: `owner/opencode-config-v2` (new, empty).
Companion files: `blueprint.md` (exact layout, IDs, contracts, templates), `decisions.md` (D1–D37), `../CONTEXT.md` (glossary), `../adr/`, and the Project Template at `../../templates/project/TEMPLATE.md` (single-app and multi-app architecture guidance).

## Problem Statement

An earlier OpenCode delivery setup worked but was slow and heavy. It had dozens of agents, large plugins built on OpenCode 1.x endpoints, many helper scripts, a feature-branch → ticket-branch hierarchy that needed its own sync gates, and skill loading that depended on the model choosing to load a skill. Each agent hand-off cost time and tokens. OpenCode 2.x changed the config shape and plugin API, so it has to be rebuilt anyway.

The project needs a **brand-new repo, `opencode-config-v2`, started from an empty `git init`**, with nothing copied from earlier repos. It should give one quick flow that follows addy's agent-skills lifecycle (Define → Plan → Build → Verify → Review → Ship). It must isolate parallel work in worktrees and sandboxes, behave identically on the Mac and on the server, and add custom pieces only where an external tool (OpenCode server, GitHub, Sysbox/Docker) has to be integrated. Everything needed to build it is in this plan pack: this spec, `blueprint.md`, `decisions.md`, `../CONTEXT.md`, `../adr/` and the tickets.

## Solution

A clean-slate, v2-only config branch with two primary modes, which are the built-in OpenCode agents overridden by ID:

- **`plan`** (Kimi K3.1 Pro, Go; ADR 0010). `/spec` interviews and writes the spec, then opens the PRD umbrella issue. After the spec is approved, `/plan` breaks the spec into vertical-slice sub-issues with blockers, `area:*` labels, a flag plan and acceptance criteria.
- **`build`** (DeepSeek V4.1 Flash, Go). Run in the main checkout, `/build` picks unblocked slices (at most 3), creates one worktree off `main` per slice and opens a slice session. In each slice session, `/build #N` runs RED → GREEN → verify in the sandbox → local review (addy `code-reviewer`, plus `security-auditor` when risky paths change) → opens the PR. The PR monitor then loops on resolvable review threads from any PR tool and GitHub Actions until every thread is resolved and checks are green. The user merges.

Skills are loaded deterministically. Commands and kickoff prompts name them with `@skill-id`, and the slice's `area:<app>` labels add each logical component's domain skills and any applicable scoped `.agents/skills/`. Each project has one app repo; the Project Template (`templates/project/TEMPLATE.md`) guides framework-native single-app layouts and multi-app monorepos without requiring `apps/`, `packages/`, a separate API or a particular stack. Slices are vertical through every applicable layer (for example migration → API → generated client → web → E2E) in one PR, skipping layers and artifacts the project does not have. **Every test run is fully isolated in Docker**, built only from the repo's own Dockerfiles and Compose test contract, and assumes nothing from the machine it runs on. On the server, where OpenCode itself runs in Docker, each slice gets its own Sysbox container. On the Mac, Docker Compose runs directly with a per-slice project. GitHub Actions runs the same isolated test run as the final gate, and deploys the separate app images.

## User Stories

### Define and plan

1. As a developer, I want `/spec <idea>` to interview me before writing anything, so that the spec reflects what I actually want and not the model's guess.
2. As a developer, I want the spec written by a strong planning model (Kimi K3.1 Pro, Go; ADR 0010), so that the costly reasoning happens once, up front.
3. As a developer, I want the planning agent's read-only research done by GLM 5.3 Flash subagents, so that repo exploration stays cheap.
4. As a developer, I want the spec saved under `docs/spec/` in the app repo (decisions under `docs/decisions/`, as in the Project Template), with a PRD umbrella issue linking to it, so that the spec is versioned next to the code and GitHub tracks the work.
5. As a developer, I want an explicit approval checkpoint between `/spec` and `/plan`, so that no slices are created from a spec I haven't approved.
6. As a developer, I want `/plan` to produce vertical slices that each cut through every layer and are independently mergeable to `main`, so that each PR is small, reviewable and safe.
7. As a developer, I want each slice issue to list its blocking slices, so that `/build` only starts work that is ready.
8. As a developer, I want each slice issue to carry an `area:<app>` label for every logical component it touches (plus `area:db` or `area:infra` where relevant), so that the right domain skills and any applicable scoped `.agents/skills/` load automatically during build.
   8a. As a developer, I want a user-facing change planned as one vertical slice through every applicable layer (for example migration, API, generated client, web, E2E) and not as separate tier-only PRs, so that every PR delivers working behaviour without inventing absent layers.
   8b. As a developer, I want changes across an explicit API contract made contract-first, with any generated client regenerated and committed in the same slice, so that consumers never hand-write generated API types and CI catches drift. Repositories without that boundary need no client generator.
9. As a developer, I want each slice to state its flag or branch-by-abstraction plan and acceptance criteria, so that incomplete behaviour stays dark on `main`.
10. As a developer, I want every flag to come with a removal slice, so that flags don't pile up.
11. As a developer, I want schema changes planned as expand/contract slices, so that each migration is safe to merge on its own.
12. As Robin, I want `/plan` to show me the slice breakdown before creating issues, so that I can merge, split or reorder slices first.
    12a. As Robin, I want every new Define/spec phase to start with a quick read-only project health check that confirms the app repo's `AGENTS.md`, test contract, and lint/typecheck declarations match its real tooling, so that missing or stale instructions become explicit remediation items instead of silently weakening the build.
13. As Robin, I want the planning agent unable to edit app code, so that planning stays planning.

### Build

14. As a developer, I want `/build` in the main checkout to pick at most 3 unblocked slices and create one worktree per slice off `main`, so that parallel work never shares files.
15. As a developer, I want each slice worktree to open its own visible OpenCode session already running `/build #N`, so that I can watch or step into any slice.
16. As a developer, I want slice worktrees, branches and sandboxes to use short, predictable names (`slice/<issue>-<slug>`), so that I can find them in Tower, the Desktop app and Docker.
17. As a developer, I want `.env` files copied (not symlinked or printed) into each worktree for personal use, while tests never depend on them, so that worktrees are convenient and no real secret reaches the model or the tests.
18. As a developer, I want the slice session to load incremental-implementation, test-driven-development and context-engineering, plus frontend-ui-engineering or api-and-interface-design according to the slice's labels, so that the right expertise is always present.
19. As a developer, I want each behaviour change to land as a failing test-only commit followed by a code commit, so that red/green is real.
20. As a developer, I want the sandbox to record evidence that the test-only commit failed, so that red/green is enforced by a check and not by trust.
21. As a developer, I want builds on DeepSeek V4.1 Flash, so that implementation is cheap and fast.
22. As a developer, I want a slice that can't converge to stop as BLOCKED with a short reason posted on its issue, so that spec gaps come back to `plan` and don't loop forever.

### Verify

23. As Robin, I want every repo to have exactly one `compose.yml` that builds and runs the whole system and its test suite from the repo's own Dockerfiles, with dummy env and throwaway dependencies, so that tests are production-ready and "tests pass" means the same thing on my Mac, on the server and in GitHub Actions.
    23a. As Robin, I want the repo's real lint and typecheck services (for example `ruff check`, `ruff format --check`, `mypy`, `vp check`) declared in the same test contract and run through `sandbox_check` during the coding loop, plus first in `sandbox_gate`, so that lint and type failures surface before the PR and GitHub Actions is a final confirmation rather than the first place they appear.
24. As Robin, I want each slice's tests to run fully isolated (its own Sysbox container on the server, where OpenCode runs in Docker; its own Compose project on my Mac, isolated from my machine), so that Rails, FastAPI and other stacks never clash and never depend on my local environment.
25. As a developer, I want the sandbox backend detected automatically, with an override, so that one config works on both machines.
26. As a developer, I want the sandbox warmed (built and smoke-run) when the slice starts, so that the first RED run isn't slowed by a cold build.
27. As a developer, I want agents unable to run raw `docker` or `sandbox` commands, so that isolation can't be bypassed.
28. As a developer, I want the host Docker socket removed from the OpenCode container on the server, so that no agent shell has root-equivalent access to the host.

### Review

29. As a developer, I want an addy `code-reviewer` subagent, on a different model family from the builder (MiniMax M3.1 Flash), to review every slice before the PR, so that obvious problems are caught locally.
30. As a developer, I want `security-auditor` (Qwen3.8 Max) to run only when risky paths change (auth, secrets, migrations, dependency manifests, infra), so that security review is paid for only when it matters.
31. As a developer, I want the reviewer to check that tests weren't weakened to pass, so that green means correct.

### Ship

32. As a developer, I want the slice session to push the branch and open a PR to `main` that links the slice issue and its PRD, so that GitHub shows the full trail.
33. As a developer, I want a PR monitor that waits on a timer without spending tokens and wakes the slice session when review threads from any PR tool or Actions results arrive, so that waiting is free.
34. As a developer, I want the slice session to fix each comment or reply "won't fix, because…", capped at about 5 rounds, so that review loops end.
35. As a developer, I want GitHub Actions green and all PR review threads resolved, regardless of which tool created them as the final gate, with a human as the merge approver, so that nothing reaches `main` without my say.
36. As a developer, I want open slices updated from `main` after every merge, so that they don't drift.
37. As a developer, I want the slice worktree, branch and sandbox cleaned up safely after merge, so that nothing leaks and no unpushed work is lost.
38. As a developer, I want the PRD issue to close when its last slice merges, so that umbrella tracking stays accurate.

### Config, models and maintenance

39. As a developer, I want all models to come from OpenCode Go or Zen, so that billing and access stay in one place.
40. As a developer, I want addy's skills vendored unmodified plus an `addy-sync` skill that pulls upstream changes, so that I get addy's improvements without merge pain.
41. As a developer, I want the integration skills (`oc-worktree`, `oc-sandbox`, `oc-github`, `oc-pr-monitor`) kept separate from addy's, so that the boundary between upstream and the flow's own skills stays obvious.
42. As a developer, I want the new repo to start from an empty `git init` with no files from earlier config repos, so that there is one way to work and no legacy to maintain.
43. As a developer, I want a repo setup skill that scaffolds or upgrades an app repo using the Project Template's single-app and multi-app guidance (preserving idiomatic structure and choosing internals per stack), plus the Compose test contract, the `AGENTS.md` front matter, the CI workflow and branch protection on `ci-ok`, with no flow templates copied into the repo,
44. As a developer, I want server-only behaviour (gitdir rewrite, delete guard, localhost rewrite) to live in opencode-server overrides, so that the config stays universal.
45. As a developer, I want the server image to clone `opencode-config-v2` and drop local PR-review CLIs and preview/tunnel settings, so that the server matches the new flow.

## Implementation Decisions

### Modules (opencode-config-v2)

- Concrete layout, model IDs, permissions, tool signatures and templates are in `blueprint.md`. If this spec and the blueprint disagree, the blueprint wins for detail and the spec wins for intent.
- **Config root:** v2 `opencode.jsonc` with Go and Zen providers only. It holds `agents` overrides for `plan` and `build` (model, system prompt, permissions), the two persona subagents, the `skills` paths, the commands, and the plugins. `plan` gets edit permission only for `docs/spec/**` and `docs/decisions/**`. `build` gets edit permission in its working directory, a shell allow-list, and denies for raw `docker`/`sandbox`, force push and pushes to `main`. Per-agent `skill` permissions show each agent only the skills it uses.
- **Two modes are the public gateways.** Entering Plan with a new initiative starts Addy's Define workflow without requiring `/spec`; `/plan` accepts either an idea or an existing spec/PRD and resumes at the correct approval-gated stage. Every new Define/spec phase begins with a quick read-only project health check of the app repo's `AGENTS.md`, test contract, and `test.checks` declarations; gaps become explicit remediation items, never direct edits. Build coordinates from main or implements an approved slice. `/spec`, `/build #N`, `/review` and `/ship` remain explicit/recovery forms, and all route through the same mode gateways.
- **Skills:** all 25 addy skills sit unmodified in their own folder and have explicit activation rules, not merely files on disk. `using-agent-skills` is always active in both modes. OC-owned `oc-plan-gateway` and `oc-build-gateway` make the core route deterministic and select contextual addy workflows; existing integration skills remain `oc-github`, `oc-worktree`, `oc-sandbox`, `oc-pr-monitor`, `addy-sync` and `repo-setup`. Root `AGENTS.md` holds the full activation matrix.
- **Plugin `oc-skills`:** on every prompt, resolve `session.agent` and attach `using-agent-skills` plus the relevant mode gateway, even without a command; in a slice worktree additionally add base and area/risk overlays. Session routing errors reject admission rather than silently missing required workflows. Build's base includes git workflow. Missing meta/launch permissions are closed: Build may use `using-agent-skills`, `constraint-driven-development` and `shipping-and-launch` without gaining merge/deploy permission.
- **Plugin `oc-worktree`** (deep module). Tools: `slice_start(issue)` → `{directory, branch, session_id}`, `slice_status()`, `slice_finish(issue)`. Inside, it creates the worktree off `origin/main` with v2 worktree support (`ctx.worktree.transform` or the v2 worktree API, chosen by the spike), copies `.env*` files, creates the slice session with the kickoff prompt, enforces the limit of 3 parallel slices, updates open slices from `main` after merges, and refuses to clean up dirty worktrees or worktrees with unpushed commits.
- **Plugin `oc-sandbox`** (deep module). Tools: `sandbox_up(slice)` (create, build images, warm dependencies), `sandbox_test(slice, service?, args?)` (one test service from the contract, focused args allowed), `sandbox_check(slice, check?)` (one declared static-check service, or every declared check when `check` is omitted; never records red/green evidence), `sandbox_gate(slice)` (every declared static check, every test service, client drift, production-image smoke), `redgreen_check(slice)`, `sandbox_down(slice)`. Every run is fully isolated in Docker. Backend selection: sidecar reachable → sysbox (a Sysbox container per slice, the Compose contract runs inside); else local Docker → docker (`docker compose -p <slice>`, no published ports); else BLOCKED. `OC_SANDBOX_BACKEND=auto|sysbox|docker` overrides. It records each `sandbox_test` run against the commit SHA as red/green evidence; static checks never create evidence.
- **Plugin `oc-pr-monitor`.** It starts a zero-token timer when a PR opens, polls GitHub for review threads and check runs, wakes the slice session with a compact summary when something changes, counts rounds (cap of 5) and reports `READY` / `BLOCKED`.
- **Red/green check:** for each slice, every code commit that changes behaviour must have a preceding test-only commit whose recorded sandbox run failed. The check runs in `oc-sandbox` before the PR opens and is repeated in the reviewer's checklist.

### Modules (opencode-server, upgrading-to-2.0)

- **Sandbox sidecar:** a new service that alone mounts the host Docker socket. It exposes a fixed internal API (`create`, `exec`, `destroy`, `status`), forces the `sysbox-runc` runtime and the sandbox image, and rejects anything else. The OpenCode container no longer mounts the socket.
- **Overrides:** `opencode.server.json` rewritten in the v2 shape (`permissions`, `mcp.servers`), with the redundant external-directory allows removed. Server-only plugins stay: gitdir rewrite, delete guard, localhost rewrite.
- **Image:** local PR-review CLIs and the preview/tunnel env vars are removed. `CONFIG_REPO` points at `opencode-config-v2` and `CONFIG_REF` at its tag or `main`. OpenCode stays pinned at 2.3.0.

### Contracts

- **Slice naming:** issue `#N`, branch and worktree `slice/<N>-<slug>`, Compose project and sandbox ID derived from `N` (short, under the 64-byte hostname cap).
- **Issue labels:** `prd`, `slice`, `area:web|api|db|infra|docs`, `risk:security`, and status `ready|in-progress|blocked|in-review`. A slice's dependencies are stored as GitHub sub-issue/blocking relationships where available, otherwise as a "Blocked by" section.
- **App repo layout:** one repo per project, using the Project Template (`templates/project/TEMPLATE.md`) as guidance for either a root-level single app or multiple apps. Nested `apps/`, shared `packages/`, generated clients and stack-specific conventions apply only when the project needs them. The template's testing section doesn't set how the flow tests.
- **Test contract:** exactly one `compose.yml` per repo, with the template's dev, test and full profiles. The flow only uses the Docker path (test and full profiles plus smoke). It runs every app, its test dependencies (test database and so on), test runners, any client generator and applicable E2E from the repo's own Dockerfiles, with committed dummy env, no published ports and a caller-set project name. The same file is used in Sysbox (server), local Docker (Mac) and GitHub Actions. Compose is for development and testing only. Production images are built and deployed separately by GitHub Actions.
- **Vertical slice order:** every applicable layer — for example migration (expand) → API RED/GREEN → regenerate the client → web RED/GREEN → E2E → gate. Skip layers and generated artifacts that do not exist.
- **Model roster:** `plan` uses Kimi K3.1 Pro (Go). `explore`/`general` use GLM 5.3 Flash (Go). `build` uses DeepSeek V4.1 Flash (Go). `code-reviewer` uses MiniMax M3.1 Flash (Go), with Kimi K2.7 Code as an alternative. `security-auditor` uses Qwen3.8 Max (Go). UI/vision uses Gemini 3.8 Flash (Zen). Titles use GPT 6 Luna (Go). (Updated 2026-11-16, ADR 0010.)

### To be confirmed by the spike (ticket 01)

Resolved 2026-11-14 — evidence and consequences in `../adr/0009-spike-results.md`. Summary:

- `@skill-id` in a command template loads the skill — confirmed (worktree-boot race covered by the hook).
- The prompt hook can add `prompt.skills` — confirmed.
- `ctx.session.create` in a worktree directory + `ctx.session.command` — confirmed (`location: { directory }`).
- Slice worktrees — confirmed via a **custom worktree strategy** (`ctx.worktree.transform`); the built-in `branch` input needs a pre-existing branch and checks out detached.
- `setInterval` + `ctx.session.prompt` wakes an idle session — confirmed.
- `plan`/`build`/`title` overrides and markdown agents accept `model`/`system`/`permissions` — confirmed.
- `policies` `provider.use` gates model use (listing still shows the catalog) — confirmed.
- `skills` paths: relative entries resolve from the working directory (so the repo relies on auto-discovery of the config `skills/` dir); `~` and absolute entries work; **no glob support** — the hook adds per-app skills.
- Local plugin layout: `index.ts` in a plugin dir, `package` paths resolve against the config file's directory, deps resolve from the repo's `node_modules` — confirmed.
- Extra: the global config directory ignores `HOME`/`XDG_CONFIG_HOME` (resolved from the OS user record) — the server image must clone `CONFIG_REF` into the container user's real config path. Plugins must never create worktrees outside tool calls (cascade risk).

## Testing Decisions

- Test external behaviour only: what a user or agent observes (issues created, worktree exists, sandbox result, PR state), not internal function calls.
- **This repo holds no app code** (D34). Its own checks are config verification only (blueprint §13: schema validation, skill references, addy vendoring, model allow-list, secrets scan) plus small plugin tool tests that create temporary git repos at test time.
- **Acceptance (manual):** the full flow (`/spec` → `/plan` → `/build` → PR) is checked by running it on real app repos. Nothing from that run is committed here.
- **Plugin seams:** the tool interfaces of `oc-worktree`, `oc-sandbox` and `oc-pr-monitor`, each tested against a temporary git repo created by the test, a real Docker daemon and a recorded GitHub API fixture.
- **Server seam:** the sidecar API is tested by checking that allowed calls work and that everything else is rejected (another runtime, another image, raw `docker` passthrough). The OpenCode container must have no Docker socket.
- **Prior art:** none in this repo; it starts empty. The repo's own CI (blueprint §13) validates the config, checks skill references, checks addy vendoring, runs plugin tests and scans for secrets from the first commit.

## Out of Scope

- OpenCode 1.x compatibility, migration shims, and any content from earlier config repos.
- Cloudflare skills, preview/staging deploys, and running apps for manual QA (pull the branch locally or deploy to staging).
- Local PR-review CLI review.
- Releases (done by tag, outside the pipeline).
- Kilo, OpenRouter and fallback agents.
- Cross-repo fanout. Each project uses one repo, with either a single-app or multi-app layout; moving existing repos is separate work done per project with `repo-setup`.
- Hard multi-tenant isolation. Sysbox is sized for trusted code on the operator's own server.

## Further Notes

- The behaviours these requirements must keep are listed in blueprint §14: short sandbox IDs, `.env` files copied without printing values, a sandbox warm-up, an inode guard before cleanup, clear server-down vs not-a-worktree errors, and only plugins touching git worktree/docker.
- Nothing is copied from earlier config repos. addy's skills and personas are the only vendored content, pinned at commit `39b723c` under the MIT licence.
- The opencode-server work (tickets 09–10) happens in that repo against the contract in blueprint §10–11.
- No GitHub issues are opened before the user approves. The spec branch and its PR are the review surface and may be opened before approval. The user merges; agents never merge, never force-push, and never push to `main`.

## Resolved Questions

- **Q-A (answered, D29):** one `compose.yml` per repo holds everything, and it is used only for testing. Production packages each image separately.
- **Q-C (answered, D32):** `compose.yml` has an `e2e` service in the test profile. It uses the official Playwright image and runs against the full-profile production images.
- **Q-B (answered, D31):** the flow runs `docker compose` directly. The `justfile` is optional, a shortcut for working by hand, and the sandbox box image stays Docker + Compose only.
