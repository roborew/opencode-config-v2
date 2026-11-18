# Blueprint: opencode-config-v2

This is the concrete reference for building the repo from an empty `git init`. The spec (`spec.md`) says what to build and why. This file says what goes where, and gives the exact names, IDs, contracts and templates. Every former **[spike]** item was settled by ticket 01 (ADR 0009); where the docs' first read and reality differed, the text records the confirmed approach.

Pinned inputs (checked 2026-11-14):

- OpenCode **2.3.0**, installed with `curl -fsSL https://opencode.ai/v2/install | bash -s -- --version 2.3.0`.
- addy/agent-skills at commit **`39b723ceebf81474d0557c1fecd01eddab585563`** (2026-11-13), MIT licence, from <https://github.com/addyosmani/agent-skills>.
- OpenCode docs: [agents](https://opencode.ai/docs/agents/), [config](https://opencode.ai/docs/config/), [commands](https://opencode.ai/docs/commands/), [skills](https://opencode.ai/docs/skills/), [server plugins](https://opencode.ai/docs/build/plugins/server/), [Go models](https://opencode.ai/docs/go/), [Zen models](https://opencode.ai/docs/console/models/).

The spike (ticket 01, `../adr/0009-spike-results.md`) ran every mechanism below on 2026-11-14. All former **[spike]** markers are resolved; the text records the confirmed approach.

---

## 1. What this repo is

This repo **is** the user-level OpenCode config directory.

- On the Mac: clone it to `~/.config/opencode`. OpenCode then loads `opencode.jsonc`, `agents/`, `commands/`, `skills/` and `plugins/` from there for every project.
- On the server: the opencode-server image clones it at `CONFIG_REF` into the config directory. Server-only extras are merged from opencode-server's own overrides (see §11).

App repos never hold a copy of this config. Every project has one app repo, but its internals may be a root-level single application or a multi-app monorepo. Robin's Project Template (`templates/project/TEMPLATE.md`) provides architecture guidance for both, plus the test contract and app-repo rules in §9. It does not require nested `apps/`, shared `packages/`, a separate API or a particular framework. How tests run is set by this flow (§7.2, §9.2), not by the template.

## 2. Repository layout

```text
opencode-config-v2/
├── opencode.jsonc                 # providers policy, agents, skills paths, plugins, permissions
├── AGENTS.md                      # global instructions: lifecycle + phase→skill table (§6)
├── agents/
│   ├── code-reviewer.md           # addy persona, frontmatter adapted to OpenCode (markdown agents confirmed, ADR 0009)
│   └── security-auditor.md        # addy persona, frontmatter adapted to OpenCode (markdown agents confirmed, ADR 0009)
├── commands/
│   ├── spec.md  plan.md  build.md  review.md  ship.md
├── skills/
│   ├── addy/                      # vendored unmodified at the pinned commit
│   │   ├── UPSTREAM.md            # repo URL, commit SHA, date, licence
│   │   ├── LICENSE                # addy's MIT licence, verbatim
│   │   └── <skill>/SKILL.md ...   # all 25 skills (§5)
│   └── oc/
│       ├── oc-github/
│       │   ├── SKILL.md
│       │   └── templates/         # issue/PR bodies + labels, held only here (D33)
│       │       ├── prd.md  slice.md  pr.md
│       │       └── labels.json
│       ├── oc-worktree/SKILL.md
│       ├── oc-sandbox/SKILL.md
│       ├── oc-pr-monitor/SKILL.md
│       ├── addy-sync/SKILL.md
│       └── repo-setup/SKILL.md
├── plugins/
│   ├── oc-skills/                 # prompt hook: guaranteed skill loading (§6)
│   ├── oc-worktree/               # slice worktrees + slice sessions (§7.1)
│   ├── oc-sandbox/                # verification box + red/green evidence (§7.2)
│   └── oc-pr-monitor/             # zero-token PR wait loop (§7.3)
├── templates/
│   ├── project/TEMPLATE.md        # single-app and multi-app architecture guidance; examples, not a required skeleton
│   └── repo/                      # what repo-setup writes into an app repo (§9.3)
│       ├── AGENTS.md              # front matter skeleton (repo-specific facts only)
│       └── .github/workflows/ci.yml   # starting point only; the repo owns it after setup
├── tests/
│   └── plugins/                   # tool-interface tests per plugin; temp git repos are created at test time, and no app code is committed
├── docs/
│   ├── CONTEXT.md                 # glossary
│   ├── adr/                       # 0001–0008
│   ├── plan/                      # this pack (spec, blueprint, decisions)
│   └── runbook.md                 # written in ticket 12
├── .scratch/opencode-v2/issues/   # tickets 00–12 (local tracker until published)
├── .github/workflows/ci.yml       # config validation, plugin tests, secret scan
├── package.json                   # plugin dev deps (@opencode/plugin, test runner) [spike: runtime]
├── .gitignore
├── LICENSE                        # Robin's choice (default: MIT)
└── README.md                      # what it is, install on Mac/server, update addy
```

## 3. `opencode.jsonc`

The shape below follows the 2.0 [config docs](https://opencode.ai/docs/config/). The model IDs come from the [Go](https://opencode.ai/docs/go/) and [Zen](https://opencode.ai/docs/console/models/) pages.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode-go/deepseek-v4.1-flash",
  "default_agent": "build",

  // Only OpenCode Go and Zen
  "policies": [
    { "action": "provider.use", "resource": "*", "effect": "deny" },
    { "action": "provider.use", "resource": "opencode", "effect": "allow" },
    { "action": "provider.use", "resource": "opencode-go", "effect": "allow" },
    { "action": "tool.use", "resource": "shell:git push --force*", "effect": "deny" },
    { "action": "tool.use", "resource": "shell:git push * main", "effect": "deny" },
  ],

  // No `skills` array: the vendored skills are found by auto-discovery of the global
  // config `skills/` directory (skills/addy/<skill>/SKILL.md and skills/oc/<skill>/SKILL.md).
  // Relative `skills` entries resolve from the *working directory*, not the config file,
  // and globs are not supported — both confirmed by ADR 0009. `package` paths for plugins
  // resolve against the config file's directory, so "./plugins/x" is <repo>/plugins/x.
  "worktree": { "directory": "~/.opencode-worktrees" },

  "agents": {
    "plan": {
      "model": "opencode-go/kimi-k3.1-pro",
      "system": "<§4.1>",
      "permissions": [/* §4.1 */],
    },
    "build": {
      "model": "opencode-go/deepseek-v4.1-flash",
      "system": "<§4.2>",
      "permissions": [/* §4.2 */],
    },
    "explore": { "model": "opencode-go/glm-5.3-flash" },
    "general": { "model": "opencode-go/glm-5.3-flash" },
    "title": { "model": "opencode-go/gpt-6-luna" }, // confirmed: hidden agents accept a model override
  },

  "plugins": [
    { "package": "./plugins/oc-skills" },
    {
      "package": "./plugins/oc-worktree",
      "options": { "maxParallel": 3, "worktreeRoot": "~/.opencode-worktrees" },
    },
    {
      "package": "./plugins/oc-sandbox",
      "options": {
        "backend": "{env:OC_SANDBOX_BACKEND}",
        "sidecarUrl": "{env:OC_SANDBOX_URL}",
        "sidecarToken": "{env:OC_SANDBOX_TOKEN}",
      },
    },
    { "package": "./plugins/oc-pr-monitor", "options": { "intervalMs": 120000, "maxRounds": 5 } },
  ],
}
```

Markdown agents in `agents/` accept the same fields as `agents` entries (confirmed, ADR 0009); `plan` and `build` stay as config overrides so their long system prompts can live in `opencode.jsonc` without a file split.

### Model roster

| Agent                     | Model ID                                                            | Price per 1M (in/out)                                                             |
| ------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| plan                      | `opencode-go/kimi-k3.1-pro`                                         | $2 / $10 ($0.20 cached read, $2 cached write)                                     |
| explore, general          | `opencode-go/glm-5.3-flash`                                         | $0.15 / $0.50 ($0.03 cached read)                                                 |
| build                     | `opencode-go/deepseek-v4.1-flash`                                   | $0.15/$0.60 off-peak; $0.30/$1.20 peak (01:00–04:00 and 06:00–10:00 UTC, Mon–Fri) |
| code-reviewer             | `opencode-go/minimax-m3.1-flash` (alt `opencode-go/kimi-k2.7-code`) | $0.15/$0.60 (alt $0.95/$4)                                                        |
| security-auditor          | `opencode-go/qwen3.8-max`                                           | $2 / $6                                                                           |
| UI/vision work (optional) | `opencode/gemini-3.8-flash`                                         | $0.75 / $3.75                                                                     |
| title                     | `opencode-go/gpt-6-luna`                                            | $0.10 / $0.50                                                                     |

Roster updated 2026-11-16 ([ADR 0010](../adr/0010-model-roster-reassessment.md)):
planning moved from Claude Opus 5.5 (Zen) to Kimi K3.1 Pro, exploration to
GLM 5.3 Flash, and code review to MiniMax M3.1 Flash. Prices from the
[Go docs](https://opencode.ai/docs/go/); Go Plus monthly limits: Kimi K3.1 Pro
$60, GLM 5.3 Flash $180, MiniMax M3.1 Flash $80, Qwen3.8 Max $60, DeepSeek
V4.1 Flash $200.

**Setup Robin does himself:** run `/connect` for OpenCode Go and Zen. Then, in Go's **Settings › Privacy › Regions**, choose **Global**; DeepSeek V4.1 Flash needs this ([Go docs](https://opencode.ai/docs/go/)).

## 4. Agents

### 4.1 `plan` (overrides the built-in)

- **Job:** Define + Plan only. Runs `/spec` and `/plan`. Never writes app code.
- **Permissions (ordered, last match wins):**
  - edit `*` deny
  - edit `docs/spec/**` allow
  - edit `docs/decisions/**` allow
  - shell `*` ask
  - shell `gh issue *` allow
  - shell `gh api *` allow
  - shell `git status*|git log*|git diff*` allow
  - skill `*` deny; then skill allow for: interview-me, idea-refine, spec-driven-development, constraint-driven-development, api-and-interface-design, source-driven-development, planning-and-task-breakdown, documentation-and-adrs, using-agent-skills, oc-github
  - subagent allow `explore`, `general`
- **System prompt outline:**
  1. You are the planning half of a two-mode delivery flow (Define → Plan). The `build` mode does the rest.
  2. Always follow the loaded skill's process. Don't skip its interview or approval steps.
  3. Output contract: the spec goes to `docs/spec/<slug>.md` in the app repo (not `SPEC.md` at the root), and ADRs go to `docs/decisions/`, and the PRD umbrella issue is created through `oc-github`.
  4. Slices are vertical, each mergeable to `main` on its own, ≤ 1 fresh context of work, and each has `area:*` labels, a blocker list, a flag plan and acceptance criteria. A user-facing change is **one slice through every applicable layer** (for example migration → API → generated client → web → E2E), never split into tier-only PRs. Skip absent layers and generated artifacts; a self-contained full-stack app needs no imaginary backend or API client. Read the repo's `AGENTS.md` front matter for its logical components and stacks.
  5. Two approval checkpoints: after the spec, and before any slice issue is created. Treat hedged answers as not approved.
  6. Delegate read-only repo research to `explore`/`general`.

### 4.2 `build` (overrides the built-in)

- **Job:** Build → Verify → Review → Ship for one slice (`/build #N` in a slice worktree), or coordinate slices (`/build` in the main checkout).
- **Permissions:**
  - edit `*` allow (within the session directory)
  - shell `*` ask; shell allow for `git add*|git commit*|git status*|git diff*|git log*|git push -u origin slice/*`, `gh pr *`, `gh issue list*|view|edit|comment|close*`. Tests run only through `oc-sandbox`.
  - shell deny for `docker*`, `sandbox*`, `git push --force*`, `git push * main`, `git reset --hard*`, `rm -rf /*`
  - skill `*` deny; then skill allow for: incremental-implementation, test-driven-development, context-engineering, source-driven-development, doubt-driven-development, frontend-ui-engineering, api-and-interface-design, browser-testing-with-devtools, debugging-and-error-recovery, code-review-and-quality, code-simplification, security-and-hardening, performance-optimization, git-workflow-and-versioning, ci-cd-and-automation, deprecation-and-migration, documentation-and-adrs, observability-and-instrumentation, oc-worktree, oc-sandbox, oc-github, oc-pr-monitor
  - subagent allow `code-reviewer`, `security-auditor`, `explore`
- **System prompt outline:**
  1. You are the build half (Build → Verify → Review → Ship). Specs and slices come from `plan`. If a slice is ambiguous or doesn't converge, call `slice_block` with the reason and don't invent requirements.
  2. In the main checkout, `/build` is the user's persistent coordinator and never implements. It routes user feedback through `slice_message`; after a verified merge it calls `slice_finish`, confirms issue closure, calls `slice_sync`, closes a completed PRD, then starts unblocked slices and reports `slice_status`. READY/BLOCKED/MERGED notifications come back to this session.
  3. In a slice worktree, work through every applicable layer in the vertical order from §9.3 (for example migration → API → generated client → web → E2E), skipping layers and artifacts the repo or slice does not have. For each acceptance criterion, follow addy's `/build` loop: a failing test-only commit (RED, through `sandbox_test`), then a code commit (GREEN). Every test runs in the isolated Docker setup through `oc-sandbox`, never on the host. Never edit or weaken a test to make it pass, and never hand-edit declared generated code.
  4. Then call `code-reviewer` (and `security-auditor` when `risk:security` is set or risky paths change), fix or answer every finding, run `sandbox_gate` and `redgreen_check`, push, open the PR through `oc-github`, and hand over to `oc-pr-monitor`.
  5. Run tests only through `oc-sandbox` tools, never through raw docker.

### 4.3 `code-reviewer`, `security-auditor` (addy personas)

- The body is copied verbatim from addy's `agents/code-reviewer.md` and `agents/security-auditor.md`. Only the frontmatter changes: `mode: subagent`, `model` (see §3), permissions edit `*` deny, shell allow for `git diff*|git log*|git show*` only.
- Add one paragraph to the code-reviewer body, as a clearly marked local extension: "Check that the slice's tests were not weakened, deleted or skipped to make them pass, and that each behaviour change has a preceding test-only commit."
- `test-engineer` and `web-performance-auditor` aren't installed.

## 5. Vendored addy skills (all 25, unmodified)

api-and-interface-design · browser-testing-with-devtools · ci-cd-and-automation · code-review-and-quality · code-simplification · constraint-driven-development · context-engineering · debugging-and-error-recovery · deprecation-and-migration · documentation-and-adrs · doubt-driven-development · frontend-ui-engineering · git-workflow-and-versioning · idea-refine · incremental-implementation · interview-me · observability-and-instrumentation · performance-optimization · planning-and-task-breakdown · security-and-hardening · shipping-and-launch · source-driven-development · spec-driven-development · test-driven-development · using-agent-skills

Also vendor addy's `references/` folder, because some skills point into it. `UPSTREAM.md` records the URL, SHA, date and licence. `addy-sync` (§8) is the only thing allowed to change `skills/addy/`.

## 6. Guaranteed skill loading

Skills load in three layers, from strongest to weakest:

1. **Command templates** name skills with `@skill-id` (confirmed inside command templates, ADR 0009). In a freshly created worktree session the mention attach can race location boot, so the base skills are _also_ added by layer 2.
2. **The `oc-skills` plugin** registers `ctx.session.hook("prompt", …)`. The 2.0 prompt hook gets a mutable draft whose `prompt.skills` can be extended ([server plugin docs](https://opencode.ai/docs/build/plugins/server/)). Commands submitted through `session.prompt` run the hook. Two runtime refinements (confirmed in ticket 05):
   - Worktree sessions share the canonical checkout's plugin registry, and `ctx.location` is the plugin _instance's_ location — so the hook resolves the session's own directory from its `sessionID` (`ctx.session.get`) before reading the slice record.
   - A skill ID that the registry never had fails admission ("Skill not found"), so oc-skills also _registers_ each app's `apps/<app>/.agents/skills/` as real skills (`ctx.skill.transform`, from the project's canonical checkout at boot and lazily from a slice worktree for skills the slice adds) and appends `skill: allow` rules for those dynamic IDs to the plan/build permission lists (`ctx.agent.transform`) — static allow-lists can't know repo-specific skill IDs.
   - The trigger: any prompt admitted in a session whose directory is a slice worktree (an `oc-slice.json` record in the worktree's git directory, written by `oc-worktree` at `slice_start`). It adds the base skills plus the area skills from the table below.
   - Otherwise do nothing. The command templates already cover `/spec` and `/plan`.
3. **The global `AGENTS.md`** carries the same table, so the model knows which skill applies when work comes outside a command.

**Scoped skills.** A single-app repo can use root `.agents/skills/`, discovered normally. When components have their own nested skills, such as `apps/<app>/.agents/skills/`, the `oc-skills` hook adds the slice's applicable skills explicitly: `skills` config entries support **no globs** (confirmed, ADR 0009), and project discovery only searches from the current directory upwards. Logical `apps:` keys in `AGENTS.md` do not require an `apps/` directory.

| Trigger                                        | Skills added                                                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/spec`                                        | interview-me, spec-driven-development (+ idea-refine if the idea is vague; + api-and-interface-design when contracts change)                                                                                              |
| `/plan`                                        | planning-and-task-breakdown, oc-github (+ documentation-and-adrs when a decision is recorded)                                                                                                                             |
| `/build` (main checkout)                       | oc-worktree                                                                                                                                                                                                               |
| `/build #N` (slice) base                       | incremental-implementation, test-driven-development, context-engineering, oc-sandbox                                                                                                                                      |
| label `area:<app>` (one per logical component) | the skills mapped to that component in the repo's `AGENTS.md` front matter (`apps.<app>.skills`). Defaults by kind: backend → api-and-interface-design; frontend → frontend-ui-engineering, browser-testing-with-devtools |
| any `area:<app>`                               | applicable component-scoped `.agents/skills/` when present (root skills are discovered normally)                                                                                                                          |
| label `area:db`                                | deprecation-and-migration (expand/contract)                                                                                                                                                                               |
| label `area:infra`                             | ci-cd-and-automation                                                                                                                                                                                                      |
| label `risk:security`                          | security-and-hardening (+ the security-auditor subagent)                                                                                                                                                                  |
| on test failure                                | debugging-and-error-recovery                                                                                                                                                                                              |
| `/review`                                      | code-review-and-quality, code-simplification                                                                                                                                                                              |
| `/ship`                                        | git-workflow-and-versioning, oc-github, oc-pr-monitor                                                                                                                                                                     |

## 7. Plugins (TypeScript, `@opencode/plugin`)

Each one is `export default Plugin.define({ id, setup(ctx) })`, registers its tools with `ctx.tool.transform` + `editor.add` under a namespace, keeps its state in `ctx.storage`, and returns a cleanup function. Tool names below are shown with the namespace prefix.

### 7.1 `oc-worktree` (namespace `slice`)

| Tool            | Input                               | Output                                                                           | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | ----------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `slice_start`   | `{ issue: number }`                 | `{ directory, branch, sessionID }` or `{ blocked: reason }`                      | An existing record with a worker session returns a message naming its state and directory; use `slice_status` for branch and session details. An existing record without a session gets a worker session attached in its directory before returning. Otherwise reads the issue (title, labels, blockers) with `gh`. Refuses if any blocker is open or if `maxParallel` slices are already active. Runs `git fetch origin main`, then creates the worktree on branch `slice/<N>-<slug>` from `origin/main` through the plugin's own **worktree strategy** (confirmed, ADR 0009: registered with `ctx.worktree.transform`, whose `create` runs `git worktree add -b slice/<N>-<slug> <dir> origin/main` — the built-in strategy checks out detached and its `branch` input requires a pre-existing branch). The worktree lands at `<worktreeRoot>/<repo>/slice-<N>-<slug>`. **Anti-cascade rule:** worktrees are created only from tool calls, never from plugin setup or timers, and only in the canonical checkout (`ctx.location.directory === ctx.location.project.canonical`). Copies `.env*` from the main checkout (except `.env.example`) for the user's convenience when they open the worktree, and returns paths only, never values. Verification never depends on these files: the test setup is self-contained (§9.2). Saves the slice record `{issue, labels, branch, directory, prd, sessionID, coordinatorSessionID}`. Creates a session in the directory titled `#N <title>` (`ctx.session.create({ title, location: { directory } })`, confirmed) and runs `ctx.session.command({sessionID, name:"build", text:"#N"})`. Replaces `status:ready` with `status:in-progress`. |
| `slice_status`  | `{}`                                | list of `{issue, branch, sessionID, state, prURL?, pendingLabel?, syncPending?}` | State is one of `building`, `in-review`, `ready`, `blocked`. Backfills a missing coordinator session only if the record still exists, and retries pending GitHub label updates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `slice_message` | `{ issue: number, text: string }`   | `{ sent: true }` or `{ blocked: reason }`                                        | Main checkout only. Verifies the PR is still OPEN, sends the user's pre-merge feedback to the existing worker `sessionID`, marks the slice `building`, and tells the worker to fix and verify the same branch and PR before restarting `prmon_watch`. MERGED/CLOSED feedback needs a new slice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `slice_block`   | `{ issue: number, reason: string }` | `{ blocked: true }`                                                              | From that slice's own worktree only. Marks the slice `blocked`, retains the reason, attempts an issue comment and notifies the coordinator session. A failed comment or notification is reported explicitly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `slice_resume`  | `{ issue: number }`                 | `{ resumed: true }` or `{ blocked: reason }`                                     | Main checkout only. Resumes a BLOCKED slice in its existing worker, worktree, branch and PR after the blocker is resolved. Pre-PR blockers use this path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `slice_sync`    | `{}`                                | per slice `{issue, result}`                                                      | Merges `origin/main` into each building slice; READY and BLOCKED slices are excluded. Call after a merge and on every `/build` run. `syncPending` is stored before each attempt and cleared on success, so an interrupted run is retried. Conflicts are reported as BLOCKED and never forced.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `slice_finish`  | `{ issue: number }`                 | `{ ok }` or `{ refused: reason }`                                                | Only after the PR is merged. Refuses if the worktree is dirty or has unpushed commits. Calls `sandbox_down`, removes the worktree and deletes the local branch. Before removing, it compares directory identity (device and inode) with the worktree root, so a bind-mounted root can never be removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Errors must tell "OpenCode server unreachable" (the server needs a restart) apart from "path is not a git worktree" (recoverable: prune and retry once).

### 7.2 `oc-sandbox` (namespace `sandbox`)

**Rule:** every test run happens in a fully isolated Docker setup, built from the repo's own Dockerfiles and its single `compose.yml` (§9.2). Nothing is taken from the machine running OpenCode: no host toolchains, no host env, no host services. That's what makes the result production-ready and the same everywhere.

| Tool             | Input                                          | Output                             | Behaviour                                                                                                                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sandbox_up`     | `{ slice: string }`                            | `{ backend, id }`                  | Picks the backend (below). The ID is `s<N>-<6-char hash>`, kept under Docker's 64-byte hostname limit. Builds the test contract's images and warms them (dependencies up and healthy), so the first RED run isn't a cold build.                                                             |
| `sandbox_test`   | `{ slice, service?: string, args?: string[] }` | `{ exit_code, passed, sha, tail }` | Runs one test service from the contract (default: the full suite) with optional focused args, for example one test file. Records `{sha, service, args, passed, at}` as evidence. `tail` is the last 200 lines with secrets redacted.                                                        |
| `sandbox_gate`   | `{ slice }`                                    | `{ passed, steps[] }`              | The full pre-PR run: every test service in the contract, any declared generation drift check and the production-image smoke check, all in the isolated setup.                                                                                                                               |
| `redgreen_check` | `{ slice }`                                    | `{ ok, violations[] }`             | For each commit `main..HEAD`: a commit that changes only test paths must have a failing evidence record; the next commit that changes non-test paths must have a passing one. Declared generated code counts as neither. Test-path globs come from `AGENTS.md` front matter (`test_globs`). |
| `sandbox_down`   | `{ slice }`                                    | `{ ok }`                           | Tears down the slice's Compose project with its volumes and destroys the box.                                                                                                                                                                                                               |

**Backends (the same test contract under both):**

1. **sysbox (server).** OpenCode runs in Docker on Ubuntu. Each slice gets its own Sysbox container with its own inner Docker engine, created through the sidecar (§10), and the Compose test contract runs inside it.
2. **docker (local Mac).** Docker Compose is called directly with a unique project name (`-p <id>`), no published host ports, and its own networks and volumes. The containers are isolated from the Mac's own environment.

Selection: `OC_SANDBOX_BACKEND=sysbox|docker` wins. Otherwise (`auto`): sidecar answers `GET /v1/health` → sysbox; otherwise local `docker info` works → docker; otherwise BLOCKED.

### 7.3 `oc-pr-monitor` (namespace `prmon`)

| Tool           | Input                   | Output                                                             |
| -------------- | ----------------------- | ------------------------------------------------------------------ |
| `prmon_watch`  | `{ slice, pr: number }` | `{ watching: true }`                                               |
| `prmon_status` | `{ slice }`             | `{ round, threadsOpen, checks: {pending, failed, passed}, state }` |

- `setInterval(intervalMs)` while a watch is active. Each tick makes plain API calls through `gh api graphql` and spends no model tokens. It reads `reviewThreads { isResolved, comments(last) }` and the commit's check runs, then diffs them with the last snapshot in `ctx.storage`.
- **When something changes and the session is idle:** `ctx.session.prompt({sessionID, text})` sends a compact summary of only the new unresolved threads (file, line, body) and the failed checks (name, log tail URL), and increments `round`.
- Opening a watch records `in-review` and the PR URL on the slice record. **READY** means all threads are resolved and `ci-ok` passed. It sets `status:ready`, posts a short PR comment, updates the slice record and notifies both the worker and main-checkout coordinator. The watch stays armed for late comments and check regressions.
- **BLOCKED** means `round > maxRounds`. It comments a summary on the issue, updates the slice record, notifies the coordinator and stops. **MERGED** notifies the coordinator and stops; **CLOSED** without merge also stops and asks the user to decide.
- The slice session answers each thread with a fix commit, or a reply that begins "Won't fix, because…" followed by a resolve. Session prompts are wake-ups; GitHub and slice records remain the durable state.

### 7.4 `oc-skills`

Defined in §6. It has no tools, only the prompt hook.

## 8. Integration skills (`skills/oc/`)

Each is a short `SKILL.md` with `name` and `description` frontmatter. It describes when to use the plugin's tools and what to do with their results, and doesn't re-explain addy's process.

- **oc-github:** PRD and slice issue creation, using its own templates (`skills/oc/oc-github/templates/`, §9.3; never repo templates). It creates missing labels on demand. Sets labels and dependencies, using the GitHub sub-issue and "blocked by" relationships (falling back to a "Blocked by" section). Opens the PR with the template and links `Closes #N` and `Part of #PRD`. Closes the PRD when its last slice merges.
- **oc-worktree:** when and how to call `slice_*`, and what each state means.
- **oc-sandbox:** the red/green loop through `sandbox_test`, focused runs vs full runs, and reading `redgreen_check`.
- **oc-pr-monitor:** handling a wake-up, the fix/reply rules and the round cap.
- **addy-sync:** fetch addy at a target ref (default `main`), show the diff of `skills/addy/` and `references/` against `UPSTREAM.md`, apply only after Robin approves, update `UPSTREAM.md`, and flag any skill that was renamed or removed and is still referenced in §6 or in the permissions.
- **repo-setup:** propose §9 setup for an app repo using its actual single-app or multi-app shape. Show every file and setting before applying it, and apply only after approval. Branch protection and labels go through `gh api`.

## 9. App repo contract

### 9.1 Layout and architecture: Robin's Project Template

Every project uses one app repo. `templates/project/TEMPLATE.md` guides architecture without imposing the Rekalled monorepo as a skeleton:

- **Single apps stay framework-native.** Next.js, TanStack Start and other full-stack apps can keep source and routes at the root. Single-tier apps, libraries and services also use their ecosystem's normal layout. No nested `apps/` or `packages/` is needed without real boundaries.
- **Multi-app repos use meaningful components.** `apps/` can hold independently deployable apps and `packages/` genuinely shared or generated code. Workspace and build tooling follows the languages in use; Vite, pnpm, uv or any other tool is never presumed.
- **Each actual deployable owns its build.** Its Dockerfile, runtime image and lockfile live at the root for a single app or with the component in a multi-app repo. Production databases and other services can be external or separate services.
- **Contracts are conditional.** When a separate consumer and provider need an explicit API contract, OpenAPI plus a committed generated client is one good approach. A full-stack app with internal server functions needs no standalone backend schema, `packages/api-client` or generator service.
- **Architecture is idiomatic and docs stay next to code.** Backend layering and frontend feature modules are options, not requirements. Product specs live in `docs/spec/`, ADRs in `docs/decisions/`, and deployment docs in `docs/deployment/`.

Existing manifests, framework entry points, tests and `AGENTS.md` determine what the repo is before any restructuring is proposed. The template's testing section (§4) doesn't decide how the flow tests: §9.2 does. The `justfile` is optional, a shortcut for Robin. The flow never depends on it (D31).

### 9.2 Test contract: one `compose.yml` per repo, fully isolated

This follows the template's §4: the standalone Docker test path.

- **Every repo has exactly one Compose file, `compose.yml`, at the root** (D29), with the template's profiles:
  - **dev** (the default): dependencies only, for Robin's native inner loop. The flow never uses it.
  - **test** (`just test-docker`): applicable test suites in containers built from each actual app's **test target**, against throwaway dependencies such as `db-test` when a database exists.
  - **full** (`just full`): production images and throwaway dependencies, with migrations on start when applicable and health waits.
  - The **smoke** run uses the production images and throwaway dependencies.
  - There is no second Compose file and no override file.
- **The flow always uses the Docker path, never the host path.** The host inner loop (`just test`, `just dev`) is Robin's, for working by hand. Every agent test run, red/green evidence and gate uses the test and full profiles plus smoke, inside the slice's sandbox.
- **Test targets, not runtime images.** Test containers build from a test target in each app's Dockerfile (the dev environment plus source, never shipped). Runtime images exclude dev dependencies and tests.
- **Test databases are guarded.** Where a database exists, tests refuse to run against one whose name doesn't end in `_test`.
- **Compose is for development and testing only, never production.** GitHub Actions builds, scans and deploys each app's runtime image separately. Production databases and services are external or run as separate services.
- **Nothing is assumed from the host.** Test env values are committed dummies, and real secrets are never needed. No host ports are published, and the caller sets the project name (`-p <id>`).
- **GitHub Actions runs the same test and smoke path on every PR** as the final gate (`ci-ok`).
- **Browser E2E in Docker when applicable (D32).** A repo with browser flows has an `e2e` service in the test profile: the official Playwright image, pinned to the repo's `@playwright/test` version, running against the full-profile production images over the Compose network. This is the agents' only E2E path, and `just e2e` stays Robin's host path.
- **The flow calls Compose directly (D31).** Commands are declared in `AGENTS.md`, never `just`. An optional `justfile` wraps the same commands for Robin.

### 9.3 What lives in an app repo, and what doesn't (D33)

An app repo only holds **facts about itself**: its code, `compose.yml`, Dockerfiles, CI workflow, `docs/spec|decisions|deployment`, applicable root or component-scoped `.agents/skills/`, and the `AGENTS.md` front matter below. **No flow reference material lives in app repos**: no issue templates, PR template, `labels.json` or copies of flow skills. All of that lives in this config, under `skills/oc/oc-github/templates/`. `.github/` keeps only GitHub's own files, and the repo owns them in full: `workflows/` (`ci.yml` as the PR gate, `deploy.yml` with the app's own registry and deploy wiring outside this flow, and any others) and `dependabot.yml`. There's no shared or reusable workflow from the config. `repo-setup` writes a starting `ci.yml` once, and after that the repo maintains it. When `repo-setup` upgrades an existing repo, it proposes deleting the old `.github/ISSUE_TEMPLATE/*`, `pull_request_template.md` and `labels.yml`, and deletes them only after approval.

**Root `AGENTS.md`** front matter (a single full-stack app example, not a required stack):

```markdown
---
apps:
  app:
    {
      kind: fullstack,
      stack: nextjs,
      skills: [frontend-ui-engineering, browser-testing-with-devtools],
    }
test:
  compose: compose.yml # always this file
  profiles: { test: test, full: full }
  commands: # what oc-sandbox runs; an optional justfile wraps the same commands
    test: "docker compose -f compose.yml --profile test run --rm {service} {args}"
    full: "docker compose -f compose.yml --profile full up -d --wait"
  services: { all: "test", app: "app-test", e2e: "e2e", smoke: "smoke" }
test_globs: ["tests/**", "e2e/**", "src/**/*.test.*"]
---
```

`apps:` names logical components, whether they live at the root or under nested directories; a multi-app repo declares several entries. Add `contract: { generated: [...], generator_service: "..." }` only for real generated artifacts. Replace services and test globs with the repo's facts. The body describes each component, the flag convention, and points to `docs/spec/` and `docs/decisions/`.

**Vertical slice order inside one PR:** every applicable layer — for example migration (expand) → API test RED → API GREEN → regenerate any declared client (through the generator service; commit it) → web test RED → web GREEN → E2E for the user flow → `sandbox_gate`. Skip absent layers and steps the slice doesn't need; a full-stack app with no separate API contract has no API/client phase.

**Issue and PR bodies (config only, `skills/oc/oc-github/templates/`).** `oc-github` fills them in and creates issues and PRs with `gh … --body-file`, so GitHub never needs a repo template. `prd.md` has: Problem, Solution, User stories, Spec link (`docs/spec/…`), Slices (auto-filled), Out of scope. `slice.md` has: Parent PRD, What to build, Acceptance criteria, Apps touched (`area:<app>`), Contract change (yes/no), Flag plan, Blocked by.

`pr.md` has: `Closes #N`, `Part of #PRD`, What changed, Contract change and any regenerated artifacts, Red/green evidence, `sandbox_gate` result, Review summary, Flag state, and Deploy notes (any migration is expand/contract safe; any new env value has been added to the secrets manager for staging **and** production; docs are updated).

**`labels.json` (config only):** `oc-github` creates any missing label the first time it needs it (`gh label create --force`, idempotent). `area:<app>` labels come from the `apps:` keys in `AGENTS.md`. This set replaces the older `state:*`, `category:*` and `mode:*` labels and their `labels.yml`. Labels: `prd`, `slice`, `area:<app>` for each logical component, `area:db`, `area:infra`, `area:docs`, `risk:security`, `status:ready`, `status:in-progress`, `status:in-review`, `status:blocked`, `flag-removal`.

**CI:** the PR gate runs the same isolated Compose test run. A final aggregate job (`ci-ok`) is the single required check. Image build and deploy workflows are separate and outside this flow.

**Branch protection on `main`:** require `ci-ok`, 1 approving review (Robin) and resolved conversations from any PR review tool. No force push.

**PR review tools:** any GitHub app or reviewer may create review threads — for example CodeRabbit, Kilo, Copilot or a security scanner. The monitor does not filter by author or tool, and no review CLI runs locally.

## 10. Sandbox sidecar contract (implemented in opencode-server)

The sidecar is a container on the internal network. It is the **only** container that mounts `/var/run/docker.sock`. All calls require `Authorization: Bearer <OC_SANDBOX_TOKEN>`, which Robin sets.

| Method | Path                      | Body                  | Result                                                                                                                                                                                                                                                               |
| ------ | ------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/health`              | —                     | `{ ok, version }`                                                                                                                                                                                                                                                    |
| POST   | `/v1/sandboxes`           | `{ id, worktree }`    | `{ id, status }`. The worktree must sit under the configured worktree root, or the call is rejected. Creates `opencode-sandbox-<id>` with `--runtime=sysbox-runc` and the pinned **box image** (Docker engine + Compose only), with the worktree mounted at `/work`. |
| POST   | `/v1/sandboxes/{id}/exec` | `{ argv, timeoutMs }` | `{ exit_code, stdout_tail, stderr_tail, duration_ms }`. `argv` must match the allow-list: `docker compose -p <id> -f compose.yml (build \| up -d --wait <deps> \| run --rm <test service> … \| down -v)` or `git diff --exit-code …`. Anything else is rejected.     |
| GET    | `/v1/sandboxes/{id}`      | —                     | `{ id, status, created_at }`                                                                                                                                                                                                                                         |
| DELETE | `/v1/sandboxes/{id}`      | —                     | `{ ok }`                                                                                                                                                                                                                                                             |

**Box image:** a minimal image with only Docker engine and Compose, pinned. Everything else comes from the repo's own Dockerfiles, so nothing app-specific is ever installed on the server.

It rejects any other runtime, any other image, privileged flags, and host mounts outside the worktree root.

## 11. What opencode-server must provide

- OpenCode 2.3.0, pinned.
- `CONFIG_REPO=https://github.com/roborew/opencode-config-v2.git` and `CONFIG_REF=<tag or main>`, cloned into the config directory.
- Server-only overrides, merged on top in the 2.0 shape: the gitdir rewrite plugin (so host Git tools can open worktrees), the worktree delete guard, the localhost → host rewrite plugin, and `OC_SANDBOX_BACKEND=sysbox`, `OC_SANDBOX_URL`, `OC_SANDBOX_TOKEN`.
- The sidecar from §10. The OpenCode container must not mount the Docker socket.
- No local PR-review CLI, and no preview/tunnel settings.

## 12. Environment and secrets (Robin enters every value himself)

| Name                                 | Where                           | Purpose                                               |
| ------------------------------------ | ------------------------------- | ----------------------------------------------------- |
| OpenCode Go / Zen login              | `/connect` on each machine      | models                                                |
| GitHub auth for `gh`                 | `gh auth login` on each machine | issues, PRs, monitor                                  |
| `OC_SANDBOX_BACKEND`                 | env (optional)                  | `auto` \| `sysbox` \| `docker`                        |
| Real app secrets                     | Robin's secrets manager         | never needed for tests (§9.2), never pulled by agents |
| `OC_SANDBOX_URL`, `OC_SANDBOX_TOKEN` | server env                      | sidecar access                                        |
| PR review apps (optional)            | GitHub, per repo                | PR review comments from any tool                      |

## 13. This repo's own CI (`.github/workflows/ci.yml`)

1. Validate `opencode.jsonc` against `https://opencode.ai/config.json`.
2. Check that every skill named in §6, in the permissions and in the command templates exists on disk.
3. Check that `skills/addy/` matches `UPSTREAM.md`: it was changed only by an `addy-sync` commit, with a `Addy-Sync: <sha>` trailer.
4. Run the plugin tests (`tests/plugins`).
5. Run gitleaks and zizmor, with pinned action SHAs.
6. Enforce LF line endings for `*.sh`, `*.ts` and `*.md`.
7. Check the model allow-list: every model ID referenced in `opencode.jsonc` and `agents/` uses the `opencode` or `opencode-go` provider and matches the roster in §3.

## 14. Lessons built in from earlier setups

- Use short sandbox IDs (Docker's hostname limit is 64 bytes).
- Copy `.env` files instead of symlinking them, and never print their values. Tests never depend on them.
- Warm the sandbox when the slice starts, so the first RED run isn't a cold build.
- Compare directory identity (device and inode), not just the path, before removing anything under the worktree root.
- Tell "server down" apart from "not a git worktree" in error messages.
- Agents never call `git worktree`, `docker` or `sandbox` directly; only plugins do.
- Merges are done by Robin on GitHub, never locally by an agent.
