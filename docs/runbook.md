# Runbook — the v2 delivery flow

Daily use of `opencode-config-v2` on the Mac (the server is the same flow; see
§Server). Everything here assumes the config is installed per the
[README](../README.md#install) and `gh` is authenticated.

## The loop

Stay in **one central session in the app repo's main checkout**. Slice sessions
are visible for optional inspection, but you never need to visit them or move
between worktrees.

1. **Enter Plan with the idea (or `/plan <idea>`)** — new work with no approved
   spec automatically starts addy's interview/spec workflow; you never need to
   invoke `/spec` first. `/spec` remains an optional explicit Define-only entry.
   Plan writes `docs/spec/<slug>.md` before requesting approval, then owns the
   spec branch/PR and PRD after approval. Hedged answers are not approval.
2. **Continue in Plan after spec approval** — it proposes vertical slices through
   every applicable layer, skipping layers the repo does not have, then shows you
   the numbered breakdown. On this second explicit approval, it creates sub-issues
   with `area:*` labels, blockers and `status:ready`. A PRD with verified linked-spec
   approval can also be passed as `/plan <PRD>` to resume here. Plan owns these outputs;
   switching to Build is not needed for file writes or GitHub issue creation.
3. **Switch to Build** — this central session is now your persistent build
   coordinator. It starts up to 3 unblocked slices. Each gets a worktree off
   `origin/main` (`slice/<N>-<slug>`) and a session already running `/build #N`.
   Both modes always have `using-agent-skills` and their OC gateway; slice workers
   automatically get TDD, context, incremental/git workflows and area/risk skills.
4. **Workers do the routine work** — RED → GREEN through `sandbox_test`, local
   persona review, conditional Addy workflows, then push, open the PR and monitor.
5. **Workers exhaust remote feedback before calling you** — new resolvable
   review threads from any PR tool (CodeRabbit, Kilo, Copilot, security scanners,
   etc.) and failed
   Actions checks wake the slice session (max 5 rounds); each item is
   fixed or answered "Won't fix, because…". READY means every review thread is
   resolved and `ci-ok` is green. The central session then tells you which PR to
   review and test. The monitor stays armed for late feedback until merge.
6. **If you find a problem, tell central build** — for example, "PR #42 misses
   the empty-state recovery action." Build resolves that PR to its linked slice
   issue, then calls `slice_message` to wake the existing worker with its
   original context. It fixes and verifies the same branch and PR, restarts the
   monitor, and reports READY again. Do not create a replacement worktree,
   session or PR.
7. **If the PR is acceptable, merge it in GitHub.** Agents never merge.
8. **Tell central build "I merged #N"** (or run `/build` again). Build verifies
   the merge, calls `slice_finish`, confirms the `Closes #N` issue is closed,
   retries any pending `slice_sync`, closes every affected PRD whose last slice
   has merged, then starts newly unblocked slices and reports `slice_status`. If
   cleanup is refused, the dirty worktree and edits are retained and reported.

## BLOCKED slices

A slice that can't converge (3 failed attempts on the same criterion, merge
conflicts in `slice_sync`, or the PR monitor's round cap) stops as BLOCKED with
a short reason on its issue. Worker and monitor BLOCKED states are also sent to
the central build session. Read the reason; it is usually a spec gap — take it
back to `/plan`. After the blocker is resolved or replanned, call
`slice_resume({ issue })` from the central session; this wakes the existing
worker in its existing worktree and branch. There is no need to enter the slice
worktree or run `/build #N` there yourself. If the PR was CLOSED without
merging, decide whether to reopen it or close the slice; resume becomes
available after the PR is OPEN and the blocker is resolved.

## Sandboxes

Every test run is isolated in Docker through the `oc-sandbox` tools — never run
tests on the host, never raw `docker`. The backend is auto-detected (sidecar →
sysbox on the server, local Docker on the Mac); `OC_SANDBOX_BACKEND` overrides.
If `sandbox_up` returns BLOCKED with "no sandbox backend", check Docker is
running (`docker info`) or the `OC_SANDBOX_URL`/`OC_SANDBOX_TOKEN` env vars.

Evidence for red/green is recorded per commit SHA; `redgreen_check` fails the
gate if a behaviour change has no preceding failing test-only commit.

## Updating addy's skills

Use the `addy-sync` skill (procedure in `skills/oc/addy-sync/SKILL.md`):
it shows the upstream diff, applies it only after your approval, updates
`skills/addy/UPSTREAM.md`, and the commit carries `Addy-Sync: <sha>` (CI
enforces the trailer). It also flags any renamed/removed skill still referenced
by the phase table, permissions or command templates.

## Cleanup

- Merged slices: `slice_finish` refuses dirty or unpushed worktrees, tears down
  the sandbox (volumes included), removes the worktree and branch. Nothing is
  removed without the PR being merged first.
- Stray worktrees: `git worktree list` in the app repo, `git worktree prune`
  after manual removals. Worktrees live under `$OPENCODE_WORKTREES_DIR`
  (`~/.opencode-worktrees` when it is unset or empty) — see
  [README › Environment](../README.md#environment).
- Stray sandboxes: `docker compose ls` shows `s<N>-<hash>` projects;
  `docker compose -p <id> down -v --remove-orphans` cleans one up.

## Troubleshooting

- **"OpenCode server unreachable"** vs **"path is not a git worktree"** — the
  first needs a server restart; the second is recoverable: `git worktree prune`
  and retry once.
- **MCP servers** — `mcpjungle` connects to the MCP gateway at
  `MCPJUNGLE_URL` (an absolute URL such as `https://mcpjungle.example.com/mcp`)
  with `MCPJUNGLE_TOKEN` from the environment; an empty URL or a 401 "invalid
  MCP client token" means a variable is unset or stale — set both (shell env or
  server env) and restart OpenCode, then check `/mcps` shows it connected.
  `browse` is the Mac-local browsing companion; the server overrides repoint or
  disable it.
- **Plugin logs** — start the server with `opencode serve --print-logs`; every
  plugin logs under `[oc-…]`. `sandbox_test` output tails 200 lines with
  secrets redacted.
- **Skills not loading in a slice session** — the `oc-skills` hook registers
  applicable nested component skills and adds them to every prompt in a slice
  worktree (root `.agents/skills/` is discovered normally); check `AGENTS.md`
  has the right logical `apps:` entry and the issue has its `area:<app>` label.
- **Config changes not picked up** — `opencode reload` restarts configuration;
  plugin changes need a server restart.

## Cost and time per slice

Recorded from the live end-to-end runs (ticket 12, pending): model spend per
slice by agent, wall-clock per round-trip, and tokens per wake-up. The roster
(ADR 0010): plan = Kimi K3.1 Pro (Go), explore/general = GLM 5.3 Flash (Go), build =
DeepSeek V4.1 Flash (Go), personas = MiniMax M3.1 Flash / Qwen3.8 Max (Go),
titles = GPT 6 Luna (Go); waiting on the PR monitor costs nothing.

## Dependencies and supply chain

`npm audit` (against the committed lockfile) currently reports 24 **moderate**
findings, 0 high/critical. All are transitive through the pinned official
`@opencode/plugin@2.3.0` SDK (npm-CLI internals: `glob`/`minimatch`,
`@npmcli/arborist`, `rimraf` — pulled by `@opencode/util` and `@opencode/ai`),
with no fix available at our ranges. Deferred as unreachable: those code paths
run only for npm-published plugin packages and cleanup tasks, never from
untrusted input — our plugins load from local directories. Review when
`@opencode/plugin` is next bumped. Secret scanning: gitleaks 8.30.1 over the
full history is clean, and CI re-runs gitleaks on every commit; the action
SHAs in CI are pinned.

## Upgrading OpenCode

OpenCode is pinned at **2.3.0** (`curl -fsSL https://opencode.ai/v2/install |
bash -s -- --version 2.3.0`). To move: check the config schema still validates
(CI's config-verify job does this on every commit against the live schema),
re-run the plugin tests (`npm test`), then bump the pin in the server image
and on the Mac together. The spike results (`docs/adr/0009-spike-results.md`)
say which mechanisms the plugins depend on — re-verify items there if a major
version changes plugin APIs.
