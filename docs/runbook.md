# Runbook — the v2 delivery flow

Daily use of `opencode-config-v2` on the Mac (the server is the same flow; see
§Server). Everything here assumes the config is installed per the
[README](../README.md#install) and `gh` is authenticated.

## The loop

1. **`/spec <idea>`** — the plan agent interviews you before writing anything,
   then writes `docs/spec/<slug>.md` in the app repo and opens the PRD umbrella
   issue. Two approval gates: after the spec, and later before any slice issue
   exists. Hedged answers are not approval.
2. **`/plan <PRD>`** — proposes vertical slices through every applicable layer
   (for example migration → API → generated client → web → E2E in one PR),
   skipping layers and artifacts the repo does not have. It shows you the
   numbered breakdown, and on approval creates the slice issues
   as sub-issues with `area:*` labels, blockers and `status:ready`.
3. **`/build`** — in the app repo's main checkout: starts up to 3 unblocked
   slices. Each gets a worktree off `origin/main` (`slice/<N>-<slug>`), a
   session already running `/build #N`, and a warm sandbox.
4. Watch the slice sessions work RED → GREEN through `sandbox_test`, in vertical
   order, then `/review` (personas) and `/ship` (push, PR, monitor).
5. **CodeRabbit + GitHub Actions** review the PR. The monitor wakes the slice
   session on each new comment or failed check (max 5 rounds); each item is
   fixed or answered "Won't fix, because…".
6. **You merge.** After a merge: `/build` again to fan out the next slices —
   `slice_sync` merges `main` into open slices, `slice_finish` (via the flow)
   cleans up merged ones, and the PRD closes when its last slice merges.

## BLOCKED slices

A slice that can't converge (3 failed attempts on the same criterion, merge
conflicts in `slice_sync`, or the PR monitor's round cap) stops as BLOCKED with
a short reason on its issue. Read the reason; it is usually a spec gap — take it
back to `/plan`, or resolve manually and re-run `/build #N`.

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
  after manual removals. Worktrees live under `~/.opencode-worktrees`.
- Stray sandboxes: `docker compose ls` shows `s<N>-<hash>` projects;
  `docker compose -p <id> down -v --remove-orphans` cleans one up.

## Troubleshooting

- **"OpenCode server unreachable"** vs **"path is not a git worktree"** — the
  first needs a server restart; the second is recoverable: `git worktree prune`
  and retry once.
- **MCP servers** — `mcpjungle` connects to Robin's MCP gateway with
  `MCPJUNGLE_TOKEN` from the environment; a 401 "invalid MCP client token"
  means the variable is unset or stale — set it (shell env or server env) and
  restart OpenCode, then check `/mcps` shows it connected. `browse` is the
  Mac-local browsing companion; the server overrides repoint or disable it.
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
