# Spec: OpenCode v2 delivery flow (opencode-config-v2 + opencode-server)

Status: ready-for-agent. Date: 2026-11-14. Repo: `roborew/opencode-config-v2` (new, empty).
Companion files: `blueprint.md` (exact layout, IDs, contracts, templates), `decisions.md` (D1–D32), `../CONTEXT.md` (glossary), `../adr/`, and Robin's Project Template at `../../templates/project/TEMPLATE.md` (example monorepo layout and architecture).

## Problem Statement

Robin's earlier OpenCode delivery setup worked but was slow and heavy. It had dozens of agents, large plugins built on OpenCode 1.x endpoints, many helper scripts, a feature-branch → ticket-branch hierarchy that needed its own sync gates, and skill loading that depended on the model choosing to load a skill. Each agent hand-off cost time and tokens. OpenCode 2.x changed the config shape and plugin API, so it has to be rebuilt anyway.

Robin wants a **brand-new repo, `opencode-config-v2`, started from an empty `git init`**, with nothing copied from earlier repos. It should give one quick flow that follows addy's agent-skills lifecycle (Define → Plan → Build → Verify → Review → Ship). It must isolate parallel work in worktrees and sandboxes, behave identically on his Mac and on his server, and add custom pieces only where an external tool (OpenCode server, GitHub, Sysbox/Docker) has to be integrated. Everything needed to build it is in this plan pack: this spec, `blueprint.md`, `decisions.md`, `../CONTEXT.md`, `../adr/` and the tickets.

## Solution

A clean-slate, v2-only config branch with two primary modes, which are the built-in OpenCode agents overridden by ID:

- **`plan`** (Claude Opus 5.5, Zen). `/spec` interviews and writes the spec, then opens the PRD umbrella issue. After Robin approves, `/plan` breaks the spec into vertical-slice sub-issues with blockers, `area:*` labels, a flag plan and acceptance criteria.
- **`build`** (DeepSeek V4.1 Flash, Go). Run in the main checkout, `/build` picks unblocked slices (at most 3), creates one worktree off `main` per slice and opens a slice session. In each slice session, `/build #N` runs RED → GREEN → verify in the sandbox → local review (addy `code-reviewer`, plus `security-auditor` when risky paths change) → opens the PR. The PR monitor then loops on CodeRabbit comments and GitHub Actions until both are clean. Robin merges.

Skills are loaded deterministically. Commands and kickoff prompts name them with `@skill-id`, and the slice's `area:<app>` labels add each app's domain skills and its own `.agents/skills/`. App repos use the monorepo layout and architecture from Robin's Project Template (`templates/project/TEMPLATE.md`): `apps/` with a Dockerfile per app, `packages/` for the generated API client, `infra/`, `scripts/`, `docs/`. Slices are vertical through that stack (migration → API → generated client → web → E2E) in one PR. **Every test run is fully isolated in Docker**, built only from the repo's own Dockerfiles and Compose test contract, and assumes nothing from the machine it runs on. On the server, where OpenCode itself runs in Docker, each slice gets its own Sysbox container. On the Mac, Docker Compose runs directly with a per-slice project. GitHub Actions runs the same isolated test run as the final gate, and deploys the separate app images.

## User Stories

### Define and plan
1. As Robin, I want `/spec <idea>` to interview me before writing anything, so that the spec reflects what I actually want and not the model's guess.
2. As Robin, I want the spec written by an expensive planning model (Claude Opus 5.5), so that the costly reasoning happens once, up front.
3. As Robin, I want the planning agent's read-only research done by GLM 5.3 subagents, so that repo exploration doesn't burn Opus tokens.
4. As Robin, I want the spec saved under `docs/spec/` in the app monorepo (decisions under `docs/decisions/`, as in my Project Template), with a PRD umbrella issue linking to it, so that the spec is versioned next to the code and GitHub tracks the work.
5. As Robin, I want an explicit approval checkpoint between `/spec` and `/plan`, so that no slices are created from a spec I haven't approved.
6. As Robin, I want `/plan` to produce vertical slices that each cut through every layer and are independently mergeable to `main`, so that each PR is small, reviewable and safe.
7. As Robin, I want each slice issue to list its blocking slices, so that `/build` only starts work that is ready.
8. As Robin, I want each slice issue to carry an `area:<app>` label for every app it touches (plus `area:db` or `area:infra` where relevant), so that the right domain skills and that app's own `.agents/skills/` load automatically during build.
8a. As Robin, I want a user-facing change planned as one vertical slice through the whole stack (migration, API, generated client, web, E2E) and not as separate backend and frontend PRs, so that every PR delivers working behaviour.
8b. As Robin, I want API changes made contract-first, with the client regenerated and committed in the same slice, so that the frontend never hand-writes API types and CI catches drift.
9. As Robin, I want each slice to state its flag or branch-by-abstraction plan and acceptance criteria, so that incomplete behaviour stays dark on `main`.
10. As Robin, I want every flag to come with a removal slice, so that flags don't pile up.
11. As Robin, I want schema changes planned as expand/contract slices, so that each migration is safe to merge on its own.
12. As Robin, I want `/plan` to show me the slice breakdown before creating issues, so that I can merge, split or reorder slices first.
13. As Robin, I want the planning agent unable to edit app code, so that planning stays planning.

### Build
14. As Robin, I want `/build` in the main checkout to pick at most 3 unblocked slices and create one worktree per slice off `main`, so that parallel work never shares files.
15. As Robin, I want each slice worktree to open its own visible OpenCode session already running `/build #N`, so that I can watch or step into any slice.
16. As Robin, I want slice worktrees, branches and sandboxes to use short, predictable names (`slice/<issue>-<slug>`), so that I can find them in Tower, the Desktop app and Docker.
17. As Robin, I want `.env` files copied (not symlinked or printed) into each worktree for my own use, while tests never depend on them, so that worktrees are convenient and no real secret reaches the model or the tests.
18. As Robin, I want the slice session to load incremental-implementation, test-driven-development and context-engineering, plus frontend-ui-engineering or api-and-interface-design according to the slice's labels, so that the right expertise is always present.
19. As Robin, I want each behaviour change to land as a failing test-only commit followed by a code commit, so that red/green is real.
20. As Robin, I want the sandbox to record evidence that the test-only commit failed, so that red/green is enforced by a check and not by trust.
21. As Robin, I want builds on DeepSeek V4.1 Flash, so that implementation is cheap and fast.
22. As Robin, I want a slice that can't converge to stop as BLOCKED with a short reason posted on its issue, so that spec gaps come back to `plan` and don't loop forever.

### Verify
23. As Robin, I want every repo to have exactly one `compose.yml` that builds and runs the whole system and its test suite from the repo's own Dockerfiles, with dummy env and throwaway dependencies, so that tests are production-ready and "tests pass" means the same thing on my Mac, on the server and in GitHub Actions.
24. As Robin, I want each slice's tests to run fully isolated (its own Sysbox container on the server, where OpenCode runs in Docker; its own Compose project on my Mac, isolated from my machine), so that Rails, FastAPI and other stacks never clash and never depend on my local environment.
25. As Robin, I want the sandbox backend detected automatically, with an override, so that one config works on both machines.
26. As Robin, I want the sandbox warmed (built and smoke-run) when the slice starts, so that the first RED run isn't slowed by a cold build.
27. As Robin, I want agents unable to run raw `docker` or `sandbox` commands, so that isolation can't be bypassed.
28. As Robin, I want the host Docker socket removed from the OpenCode container on the server, so that no agent shell has root-equivalent access to the host.

### Review
29. As Robin, I want an addy `code-reviewer` subagent, on a different model family from the builder (MiniMax M3), to review every slice before the PR, so that obvious problems are caught locally.
30. As Robin, I want `security-auditor` (Qwen3.8 Max) to run only when risky paths change (auth, secrets, migrations, dependency manifests, infra), so that I pay for security review only when it matters.
31. As Robin, I want the reviewer to check that tests weren't weakened to pass, so that green means correct.

### Ship
32. As Robin, I want the slice session to push the branch and open a PR to `main` that links the slice issue and its PRD, so that GitHub shows the full trail.
33. As Robin, I want a PR monitor that waits on a timer without spending tokens and wakes the slice session when CodeRabbit comments or Actions results arrive, so that waiting is free.
34. As Robin, I want the slice session to fix each comment or reply "won't fix, because…", capped at about 5 rounds, so that review loops end.
35. As Robin, I want GitHub Actions green and all CodeRabbit threads resolved as the final gate, with me as the merge approver, so that nothing reaches `main` without my say.
36. As Robin, I want open slices updated from `main` after every merge, so that they don't drift.
37. As Robin, I want the slice worktree, branch and sandbox cleaned up safely after merge, so that nothing leaks and no unpushed work is lost.
38. As Robin, I want the PRD issue to close when its last slice merges, so that umbrella tracking stays accurate.

### Config, models and maintenance
39. As Robin, I want all models to come from OpenCode Go or Zen, so that billing and access stay in one place.
40. As Robin, I want addy's skills vendored unmodified plus an `addy-sync` skill that pulls upstream changes, so that I get addy's improvements without merge pain.
41. As Robin, I want my own integration skills (`oc-worktree`, `oc-sandbox`, `oc-github`, `oc-pr-monitor`) kept separate from addy's, so that the boundary between upstream and mine stays obvious.
42. As Robin, I want the new repo to start from an empty `git init` with no files from earlier config repos, so that there is one way to work and no legacy to maintain.
43. As Robin, I want a repo setup skill that scaffolds or upgrades an app repo to the monorepo layout and architecture from my Project Template (internals chosen per stack), plus the Compose test contract and flow additions (`AGENTS.md` front matter, issue/PR templates, labels, branch protection on `ci-ok`),
44. As Robin, I want server-only behaviour (gitdir rewrite, delete guard, localhost rewrite) to live in opencode-server overrides, so that the config stays universal.
45. As Robin, I want the server image to clone `opencode-config-v2` and drop the CodeRabbit CLI and preview/tunnel settings, so that the server matches the new flow.

## Implementation Decisions

### Modules (opencode-config-v2)
- Concrete layout, model IDs, permissions, tool signatures and templates are in `blueprint.md`. If this spec and the blueprint disagree, the blueprint wins for detail and the spec wins for intent.
- **Config root:** v2 `opencode.jsonc` with Go and Zen providers only. It holds `agents` overrides for `plan` and `build` (model, system prompt, permissions), the two persona subagents, the `skills` paths, the commands, and the plugins. `plan` gets edit permission only for `docs/spec/**` and `docs/decisions/**`. `build` gets edit permission in its working directory, a shell allow-list, and denies for raw `docker`/`sandbox`, force push and pushes to `main`. Per-agent `skill` permissions show each agent only the skills it uses.
- **Commands:** `/spec`, `/plan`, `/build` (with or without an issue number), `/review`, `/ship`. They are adapted from addy's command prompts and each sets `agent`. The `/spec` and `/plan` templates name their skills with `@skill-id`. The `/build #N` kickoff names the base build skills, plus the domain skills mapped from the slice's `area:*` labels.
- **Skills:** addy's skills sit unmodified in their own folder. The integration skills are `oc-github` (PRD and slice issues, labels, blockers, PR open), `oc-worktree`, `oc-sandbox`, `oc-pr-monitor`, `addy-sync` and `repo-setup`. Root `AGENTS.md` holds the phase → skill table.
- **Plugin `oc-skills`:** a prompt hook that adds the slice's base and area skills to `prompt.skills` when `/build #N` runs in a slice worktree, so skills always load.
- **Plugin `oc-worktree`** (deep module). Tools: `slice_start(issue)` → `{directory, branch, session_id}`, `slice_status()`, `slice_finish(issue)`. Inside, it creates the worktree off `origin/main` with v2 worktree support (`ctx.worktree.transform` or the v2 worktree API, chosen by the spike), copies `.env*` files, creates the slice session with the kickoff prompt, enforces the limit of 3 parallel slices, updates open slices from `main` after merges, and refuses to clean up dirty worktrees or worktrees with unpushed commits.
- **Plugin `oc-sandbox`** (deep module). Tools: `sandbox_up(slice)` (create, build images, warm dependencies), `sandbox_test(slice, service?, args?)` (one test service from the contract, focused args allowed), `sandbox_gate(slice)` (every test service, client drift, production-image smoke), `redgreen_check(slice)`, `sandbox_down(slice)`. Every run is fully isolated in Docker. Backend selection: sidecar reachable → sysbox (a Sysbox container per slice, the Compose contract runs inside); else local Docker → docker (`docker compose -p <slice>`, no published ports); else BLOCKED. `OC_SANDBOX_BACKEND=auto|sysbox|docker` overrides. It records each run against the commit SHA as red/green evidence.
- **Plugin `oc-pr-monitor`.** It starts a zero-token timer when a PR opens, polls GitHub for review threads and check runs, wakes the slice session with a compact summary when something changes, counts rounds (cap of 5) and reports `READY` / `BLOCKED`.
- **Red/green check:** for each slice, every code commit that changes behaviour must have a preceding test-only commit whose recorded sandbox run failed. The check runs in `oc-sandbox` before the PR opens and is repeated in the reviewer's checklist.

### Modules (opencode-server, upgrading-to-2.0)
- **Sandbox sidecar:** a new service that alone mounts the host Docker socket. It exposes a fixed internal API (`create`, `exec`, `destroy`, `status`), forces the `sysbox-runc` runtime and the sandbox image, and rejects anything else. The OpenCode container no longer mounts the socket.
- **Overrides:** `opencode.server.json` rewritten in the v2 shape (`permissions`, `mcp.servers`), with the redundant external-directory allows removed. Server-only plugins stay: gitdir rewrite, delete guard, localhost rewrite.
- **Image:** the CodeRabbit CLI and the preview/tunnel env vars are removed. `CONFIG_REPO` points at `opencode-config-v2` and `CONFIG_REF` at its tag or `main`. OpenCode stays pinned at 2.3.0.

### Contracts
- **Slice naming:** issue `#N`, branch and worktree `slice/<N>-<slug>`, Compose project and sandbox ID derived from `N` (short, under the 64-byte hostname cap).
- **Issue labels:** `prd`, `slice`, `area:web|api|db|infra|docs`, `risk:security`, and status `ready|in-progress|blocked|in-review`. A slice's dependencies are stored as GitHub sub-issue/blocking relationships where available, otherwise as a "Blocked by" section.
- **App repo layout:** the monorepo layout and architecture from Robin's Project Template (`templates/project/TEMPLATE.md`). Only layout and architecture apply. The template's testing section doesn't set how the flow tests.
- **Test contract:** exactly one `compose.yml` per repo, with the template's dev, test and full profiles. The flow only uses the Docker path (test and full profiles plus smoke). It runs every app, its test dependencies (test database and so on), test runners, the client generator and E2E from the repo's own Dockerfiles, with committed dummy env, no published ports and a caller-set project name. The same file is used in Sysbox (server), local Docker (Mac) and GitHub Actions. Compose is for development and testing only. Production images are built and deployed separately by GitHub Actions.
- **Vertical slice order:** migration (expand) → API RED/GREEN → regenerate the client → web RED/GREEN → E2E → gate.
- **Model roster:** `plan` uses Claude Opus 5.5 (Zen). `explore`/`general` use GLM 5.3 (Go). `build` uses DeepSeek V4.1 Flash (Go). `code-reviewer` uses MiniMax M3 (Go), with Kimi K2.7 Code as an alternative. `security-auditor` uses Qwen3.8 Max (Go). UI/vision uses Gemini 3.8 Flash (Zen). Titles use GPT 6 Luna (Go).

### To be confirmed by the spike (ticket 01)
These are documented by OpenCode but not yet run. Each one has a fallback in the blueprint.
- `@skill-id` inside a command template loads the skill.
- The prompt hook can add `prompt.skills` for a `/build #N` command.
- A plugin can create a session in a given worktree directory and run a command in it (`ctx.session.create` + `ctx.session.command`).
- `ctx.worktree.transform` (or plain `git worktree add`) gives a `slice/<N>-<slug>` branch from `origin/main`.
- A plugin `setInterval` + `ctx.session.prompt` can wake an idle session.
- The `plan`/`build` overrides accept `model`, `system` and `permissions` together, and markdown agents in `agents/` accept the same fields.
- `policies` with `provider.use` restricts the config to `opencode` and `opencode-go`.
- `skills` paths resolve correctly when the repo is the global config directory.
- The runtime and package layout for local plugins (`package` path + `package.json`).

## Testing Decisions

- Test external behaviour only: what a user or agent observes (issues created, worktree exists, sandbox result, PR state), not internal function calls.
- **Highest seam (primary):** an end-to-end smoke run against a small fixture monorepo with two apps (one API, one web), in the Project Template layout, with per-app Dockerfiles, a generated client and the Compose test contract. Run `/spec` → `/plan` → `/build` on a tiny feature and assert: PRD and slice issues exist with labels and blockers; one worktree per unblocked slice; a test-only failing commit before each code commit; a cross-stack slice lands as one PR with a regenerated client and E2E; `sandbox_gate` and `ci-ok` green. Run it on both backends (docker on the Mac, sysbox on the server).
- **Plugin seams:** the tool interfaces of `oc-worktree`, `oc-sandbox` and `oc-pr-monitor`, each tested against a throwaway git repo, a real Docker daemon and a recorded GitHub API fixture.
- **Server seam:** the sidecar API is tested by checking that allowed calls work and that everything else is rejected (another runtime, another image, raw `docker` passthrough). The OpenCode container must have no Docker socket.
- **Prior art:** none in this repo; it starts empty. The repo's own CI (blueprint §13) validates the config, checks skill references, checks addy vendoring, runs plugin tests and scans for secrets from the first commit.

## Out of Scope

- OpenCode 1.x compatibility, migration shims, and any content from earlier config repos.
- Cloudflare skills, preview/staging deploys, and running apps for manual QA (pull the branch locally or deploy to staging).
- Local CodeRabbit CLI review.
- Releases (done by tag, outside the pipeline).
- Kilo, OpenRouter and fallback agents.
- Cross-repo fanout. Each app moves to its own monorepo, and moving existing repos is separate work done per app with `repo-setup`.
- Hard multi-tenant isolation. Sysbox is sized for trusted code on Robin's own server.

## Further Notes

- The behaviours these requirements must keep are listed in blueprint §14: short sandbox IDs, `.env` files copied without printing values, a sandbox warm-up, an inode guard before cleanup, clear server-down vs not-a-worktree errors, and only plugins touching git worktree/docker.
- Nothing is copied from earlier config repos. addy's skills and personas are the only vendored content, pinned at commit `39b723c` under the MIT licence.
- The opencode-server work (tickets 09–10) happens in that repo against the contract in blueprint §10–11.
- Nothing is pushed or published, and no GitHub issues are opened, until Robin approves.

## Resolved Questions

- **Q-A (answered, D29):** one `compose.yml` per repo holds everything, and it is used only for testing. Production packages each image separately.
- **Q-C (answered, D32):** `compose.yml` has an `e2e` service in the test profile. It uses the official Playwright image and runs against the full-profile production images.
- **Q-B (answered, D31):** the flow runs `docker compose` directly. The `justfile` is optional, a shortcut for Robin, and the sandbox box image stays Docker + Compose only.
