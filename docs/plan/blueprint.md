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

App repos never hold a copy of this config. Every app repo uses the **monorepo layout and architecture** from Robin's Project Template (`templates/project/TEMPLATE.md`, an example kept verbatim in this repo), plus the test contract and the app-repo rules in §9. Only the template's layout and architecture apply. How tests run is set by this flow (§7.2, §9.2), not by the template.

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
│   ├── project/TEMPLATE.md        # Robin's Project Template: example monorepo layout + architecture (verbatim)
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
      "model": "opencode/claude-opus-5-5",
      "system": "<§4.1>",
      "permissions": [/* §4.1 */],
    },
    "build": {
      "model": "opencode-go/deepseek-v4.1-flash",
      "system": "<§4.2>",
      "permissions": [/* §4.2 */],
    },
    "explore": { "model": "opencode-go/glm-5.3" },
    "general": { "model": "opencode-go/glm-5.3" },
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

| Agent                     | Model ID                                                    | Price per 1M (in/out)                                                             |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| plan                      | `opencode/claude-opus-5-5`                                  | $4 / $20                                                                          |
| explore, general          | `opencode-go/glm-5.3`                                       | $1.40 / $4.40                                                                     |
| build                     | `opencode-go/deepseek-v4.1-flash`                           | $0.15/$0.60 off-peak; $0.30/$1.20 peak (01:00–04:00 and 06:00–10:00 UTC, Mon–Fri) |
| code-reviewer             | `opencode-go/minimax-m3` (alt `opencode-go/kimi-k2.7-code`) | $0.30/$1.20 (alt $0.95/$4)                                                        |
| security-auditor          | `opencode-go/qwen3.8-max`                                   | $2 / $6                                                                           |
| UI/vision work (optional) | `opencode/gemini-3.8-flash`                                 | $0.75 / $3.75                                                                     |
| title                     | `opencode-go/gpt-6-luna`                                    | $0.10 / $0.50                                                                     |

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
  4. Slices are vertical, each mergeable to `main` on its own, ≤ 1 fresh context of work, and each has `area:*` labels, a blocker list, a flag plan and acceptance criteria. A user-facing change is **one slice through the whole stack** (migration → API → generated client → web → E2E), never split into a backend PR and a frontend PR. Read the repo's `AGENTS.md` front matter for its apps and stacks.
  5. Two approval checkpoints: after the spec, and before any slice issue is created. Treat hedged answers as not approved.
  6. Delegate read-only repo research to `explore`/`general`.

### 4.2 `build` (overrides the built-in)

- **Job:** Build → Verify → Review → Ship for one slice (`/build #N` in a slice worktree), or coordinate slices (`/build` in the main checkout).
- **Permissions:**
  - edit `*` allow (within the session directory)
  - shell `*` ask; shell allow for `git add*|git commit*|git status*|git diff*|git log*|git push -u origin slice/*`, `gh pr *`, `gh issue comment*`. Tests run only through `oc-sandbox`.
  - shell deny for `docker*`, `sandbox*`, `git push --force*`, `git push * main`, `git reset --hard*`, `rm -rf /*`
  - skill `*` deny; then skill allow for: incremental-implementation, test-driven-development, context-engineering, source-driven-development, doubt-driven-development, frontend-ui-engineering, api-and-interface-design, browser-testing-with-devtools, debugging-and-error-recovery, code-review-and-quality, code-simplification, security-and-hardening, performance-optimization, git-workflow-and-versioning, ci-cd-and-automation, deprecation-and-migration, documentation-and-adrs, observability-and-instrumentation, oc-worktree, oc-sandbox, oc-github, oc-pr-monitor
  - subagent allow `code-reviewer`, `security-auditor`, `explore`
- **System prompt outline:**
  1. You are the build half (Build → Verify → Review → Ship). Specs and slices come from `plan`. If a slice is ambiguous or doesn't converge, stop as BLOCKED, comment on the issue, and don't invent requirements.
  2. In the main checkout, `/build` coordinates only: `slice_start` for unblocked slices, then `slice_status`. Never implement there.
  3. In a slice worktree, work through the slice in the vertical order from §9.3 (migration → API → generated client → web → E2E). For each acceptance criterion, follow addy's `/build` loop: a failing test-only commit (RED, through `sandbox_test`), then a code commit (GREEN). Every test runs in the isolated Docker setup through `oc-sandbox`, never on the host. Never edit or weaken a test to make it pass, and never hand-edit generated client code.
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
2. **The `oc-skills` plugin** registers `ctx.session.hook("prompt", …)`. The 2.0 prompt hook gets a mutable draft whose `prompt.skills` can be extended ([server plugin docs](https://opencode.ai/docs/build/plugins/server/)). Commands submitted through `session.prompt` run the hook. Rules:
   - If the prompt starts with `/build #N` and the session is in a slice worktree, read the slice record that `oc-worktree` saved at `slice_start` (labels included) and add the base skills plus the area skills from the table below.
   - Otherwise do nothing. The command templates already cover `/spec` and `/plan`.
3. **The global `AGENTS.md`** carries the same table, so the model knows which skill applies when work comes outside a command.

**Per-app skills.** The Project Template puts agent context for each app in `apps/<app>/.agents/skills/`. `skills` config entries support **no globs** (confirmed, ADR 0009), and project `.agents/skills` discovery only searches from the current directory upwards, while slice sessions run at the repo root. So the `oc-skills` hook adds each `area:<app>` slice's app skills explicitly.

| Trigger                                   | Skills added                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/spec`                                   | interview-me, spec-driven-development (+ idea-refine if the idea is vague; + api-and-interface-design when contracts change)                                                                                        |
| `/plan`                                   | planning-and-task-breakdown, oc-github (+ documentation-and-adrs when a decision is recorded)                                                                                                                       |
| `/build` (main checkout)                  | oc-worktree                                                                                                                                                                                                         |
| `/build #N` (slice) base                  | incremental-implementation, test-driven-development, context-engineering, oc-sandbox                                                                                                                                |
| label `area:<app>` (one per `apps/<app>`) | the skills mapped to that app in the repo's `AGENTS.md` front matter (`apps.<app>.skills`). Defaults by kind: backend → api-and-interface-design; frontend → frontend-ui-engineering, browser-testing-with-devtools |
| any `area:<app>`                          | that app's own `apps/<app>/.agents/skills/` (see below)                                                                                                                                                             |
| label `area:db`                           | deprecation-and-migration (expand/contract)                                                                                                                                                                         |
| label `area:infra`                        | ci-cd-and-automation                                                                                                                                                                                                |
| label `risk:security`                     | security-and-hardening (+ the security-auditor subagent)                                                                                                                                                            |
| on test failure                           | debugging-and-error-recovery                                                                                                                                                                                        |
| `/review`                                 | code-review-and-quality, code-simplification                                                                                                                                                                        |
| `/ship`                                   | git-workflow-and-versioning, oc-github, oc-pr-monitor                                                                                                                                                               |

## 7. Plugins (TypeScript, `@opencode/plugin`)

Each one is `export default Plugin.define({ id, setup(ctx) })`, registers its tools with `ctx.tool.transform` + `editor.add` under a namespace, keeps its state in `ctx.storage`, and returns a cleanup function. Tool names below are shown with the namespace prefix.

### 7.1 `oc-worktree` (namespace `slice`)

| Tool           | Input               | Output                                                      | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | ------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slice_start`  | `{ issue: number }` | `{ directory, branch, sessionID }` or `{ blocked: reason }` | Reads the issue (title, labels, blockers) with `gh`. Refuses if any blocker is open or if `maxParallel` slices are already active. Runs `git fetch origin main`, then creates the worktree on branch `slice/<N>-<slug>` from `origin/main` through the plugin's own **worktree strategy** (confirmed, ADR 0009: registered with `ctx.worktree.transform`, whose `create` runs `git worktree add -b slice/<N>-<slug> <dir> origin/main` — the built-in strategy checks out detached and its `branch` input requires a pre-existing branch). The worktree lands at `<worktreeRoot>/<repo>/slice-<N>-<slug>`. **Anti-cascade rule:** worktrees are created only from tool calls, never from plugin setup or timers, and only in the canonical checkout (`ctx.location.directory === ctx.location.project.canonical`). Copies `.env*` from the main checkout (except `.env.example`) for Robin's convenience when he opens the worktree, and returns paths only, never values. Verification never depends on these files: the test setup is self-contained (§9.2). Saves the slice record `{issue, labels, branch, directory, prd}`. Creates a session in the directory titled `#N <title>` (`ctx.session.create({ title, location: { directory } })`, confirmed) and runs `ctx.session.command({sessionID, name:"build", text:"#N"})`. Sets the issue label to `status:in-progress`. |
| `slice_status` | `{}`                | list of `{issue, branch, sessionID, state, prURL?}`         | State is one of `building`, `in-review`, `ready`, `blocked`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `slice_sync`   | `{}`                | per slice `{issue, result}`                                 | After any merge to `main`: in each active worktree run `git fetch` and `git merge origin/main`. Conflicts are reported as BLOCKED and never forced.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `slice_finish` | `{ issue: number }` | `{ ok }` or `{ refused: reason }`                           | Only after the PR is merged. Refuses if the worktree is dirty or has unpushed commits. Calls `sandbox_down`, removes the worktree and deletes the local branch. Before removing, it compares directory identity (device and inode) with the worktree root, so a bind-mounted root can never be removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Errors must tell "OpenCode server unreachable" (the server needs a restart) apart from "path is not a git worktree" (recoverable: prune and retry once).

### 7.2 `oc-sandbox` (namespace `sandbox`)

**Rule:** every test run happens in a fully isolated Docker setup, built from the repo's own Dockerfiles and its single `compose.yml` (§9.2). Nothing is taken from the machine running OpenCode: no host toolchains, no host env, no host services. That's what makes the result production-ready and the same everywhere.

| Tool             | Input                                          | Output                             | Behaviour                                                                                                                                                                                                                                                                                 |
| ---------------- | ---------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sandbox_up`     | `{ slice: string }`                            | `{ backend, id }`                  | Picks the backend (below). The ID is `s<N>-<6-char hash>`, kept under Docker's 64-byte hostname limit. Builds the test contract's images and warms them (dependencies up and healthy), so the first RED run isn't a cold build.                                                           |
| `sandbox_test`   | `{ slice, service?: string, args?: string[] }` | `{ exit_code, passed, sha, tail }` | Runs one test service from the contract (default: the full suite) with optional focused args, for example one test file. Records `{sha, service, args, passed, at}` as evidence. `tail` is the last 200 lines with secrets redacted.                                                      |
| `sandbox_gate`   | `{ slice }`                                    | `{ passed, steps[] }`              | The full pre-PR run: every test service in the contract, the client drift check and the production-image smoke check, all in the isolated setup.                                                                                                                                          |
| `redgreen_check` | `{ slice }`                                    | `{ ok, violations[] }`             | For each commit `main..HEAD`: a commit that changes only test paths must have a failing evidence record; the next commit that changes non-test paths must have a passing one. Generated client code counts as neither. Test-path globs come from `AGENTS.md` front matter (`test_globs`). |
| `sandbox_down`   | `{ slice }`                                    | `{ ok }`                           | Tears down the slice's Compose project with its volumes and destroys the box.                                                                                                                                                                                                             |

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
- **READY** means all threads are resolved and every required check passed. It sets the issue label `status:ready`, posts a short PR comment, stops the watch and notifies the main-checkout session.
- **BLOCKED** means `round > maxRounds`. It comments a summary on the issue and stops.
- The slice session answers each thread with a fix commit, or a reply that begins "Won't fix, because…" followed by a resolve.

### 7.4 `oc-skills`

Defined in §6. It has no tools, only the prompt hook.

## 8. Integration skills (`skills/oc/`)

Each is a short `SKILL.md` with `name` and `description` frontmatter. It describes when to use the plugin's tools and what to do with their results, and doesn't re-explain addy's process.

- **oc-github:** PRD and slice issue creation, using its own templates (`skills/oc/oc-github/templates/`, §9.3; never repo templates). It creates missing labels on demand. Sets labels and dependencies, using the GitHub sub-issue and "blocked by" relationships (falling back to a "Blocked by" section). Opens the PR with the template and links `Closes #N` and `Part of #PRD`. Closes the PRD when its last slice merges.
- **oc-worktree:** when and how to call `slice_*`, and what each state means.
- **oc-sandbox:** the red/green loop through `sandbox_test`, focused runs vs full runs, and reading `redgreen_check`.
- **oc-pr-monitor:** handling a wake-up, the fix/reply rules and the round cap.
- **addy-sync:** fetch addy at a target ref (default `main`), show the diff of `skills/addy/` and `references/` against `UPSTREAM.md`, apply only after Robin approves, update `UPSTREAM.md`, and flag any skill that was renamed or removed and is still referenced in §6 or in the permissions.
- **repo-setup:** scaffold §9 into an app repo. Show every file and setting before applying it, and apply only after approval. Branch protection and labels go through `gh api`.

## 9. App repo contract

### 9.1 Layout and architecture: Robin's Project Template

App repos use the monorepo **layout and architecture** shown in `templates/project/TEMPLATE.md` (an example taken from Rekalled):

- **Zones:** `apps/` (deployable apps), `packages/` (shared or generated code such as `api-client`), `infra/`, `scripts/`, `docs/` (`spec/`, `decisions/`, `deployment/`), `.github/`.
- **Each app has its own Dockerfile, image and lockfile.** Images are built and deployed separately by GitHub Actions. Production databases and other services can be external, or run as separate services.
- **Contract-first API:** the backend exports OpenAPI, the typed client is generated into `packages/api-client` and committed, and the frontend never hand-writes API types.
- **Layered backend, feature-based frontend.**
- **Docs next to the code:** product specs in `docs/spec/`, ADRs in `docs/decisions/`, deployment docs in `docs/deployment/`.

Internals vary by stack (for example Rails instead of FastAPI). The template's testing section (§4) doesn't decide how the flow tests: §9.2 does. The `justfile` is optional, a shortcut for Robin. The flow never depends on it (D31).

### 9.2 Test contract: one `compose.yml` per repo, fully isolated

This follows the template's §4: the standalone Docker test path.

- **Every repo has exactly one Compose file, `compose.yml`, at the root** (D29), with the template's profiles:
  - **dev** (the default): dependencies only, for Robin's native inner loop. The flow never uses it.
  - **test** (`just test-docker`): the test suites in containers built from each app's **test target**, against a throwaway `db-test`.
  - **full** (`just full`): production images, a throwaway db, migrations on start, waits for health.
  - The **smoke** run uses the production images and a throwaway db.
  - There is no second Compose file and no override file.
- **The flow always uses the Docker path, never the host path.** The host inner loop (`just test`, `just dev`) is Robin's, for working by hand. Every agent test run, red/green evidence and gate uses the test and full profiles plus smoke, inside the slice's sandbox.
- **Test targets, not runtime images.** Test containers build from a test target in each app's Dockerfile (the dev environment plus source, never shipped). Runtime images exclude dev dependencies and tests.
- **Test databases are guarded.** Tests refuse to run against a database whose name doesn't end in `_test`.
- **Compose is for development and testing only, never production.** GitHub Actions builds, scans and deploys each app's runtime image separately. Production databases and services are external or run as separate services.
- **Nothing is assumed from the host.** Test env values are committed dummies, and real secrets are never needed. No host ports are published, and the caller sets the project name (`-p <id>`).
- **GitHub Actions runs the same test and smoke path on every PR** as the final gate (`ci-ok`).
- **E2E in Docker (D32).** The test profile has an `e2e` service: the official Playwright image, pinned to the repo's `@playwright/test` version, running against the full-profile production images over the Compose network. This is the agents' only E2E path, and `just e2e` stays Robin's host path.
- **The flow calls Compose directly (D31).** Commands are declared in `AGENTS.md`, never `just`. An optional `justfile` wraps the same commands for Robin.

### 9.3 What lives in an app repo, and what doesn't (D33)

An app repo only holds **facts about itself**: its code, `compose.yml`, Dockerfiles, CI workflow, `docs/spec|decisions|deployment`, per-app `.agents/skills/`, and the `AGENTS.md` front matter below. **No flow reference material lives in app repos**: no issue templates, PR template, `labels.json` or copies of flow skills. All of that lives in this config, under `skills/oc/oc-github/templates/`. `.github/` keeps only GitHub's own files, and the repo owns them in full: `workflows/` (`ci.yml` as the PR gate, `deploy.yml` with the app's own registry and deploy wiring outside this flow, and any others) and `dependabot.yml`. There's no shared or reusable workflow from the config. `repo-setup` writes a starting `ci.yml` once, and after that the repo maintains it. When `repo-setup` upgrades an existing repo, it proposes deleting the old `.github/ISSUE_TEMPLATE/*`, `pull_request_template.md` and `labels.yml`, and deletes them only after approval.

**Root `AGENTS.md`** front matter:

```markdown
---
apps:
  api: { kind: backend, stack: fastapi, skills: [api-and-interface-design] }
  web:
    {
      kind: frontend,
      stack: tanstack-start,
      skills: [frontend-ui-engineering, browser-testing-with-devtools],
    }
contract: { generated: ["packages/api-client/**"], generator_service: "api-client-gen" }
test:
  compose: compose.yml # always this file
  profiles: { test: test, full: full }
  commands: # what oc-sandbox runs; an optional justfile wraps the same commands
    test: "docker compose -f compose.yml --profile test run --rm {service} {args}"
    full: "docker compose -f compose.yml --profile full up -d --wait"
  services: { all: "test", api: "api-test", web: "web-test", e2e: "e2e", smoke: "smoke" }
test_globs: ["apps/*/tests/**", "apps/web/e2e/**", "apps/*/**/*.test.*", "apps/*/**/*_spec.rb"]
---
```

The body describes each app, the flag convention, and points to `docs/spec/` and `docs/decisions/`.

**Vertical slice order inside one PR:** migration (expand) → API test RED → API GREEN → regenerate the client (through the contract's generator service; commit it) → web test RED → web GREEN → E2E for the user flow → `sandbox_gate`. A slice that touches only one app skips the steps it doesn't need.

**Issue and PR bodies (config only, `skills/oc/oc-github/templates/`).** `oc-github` fills them in and creates issues and PRs with `gh … --body-file`, so GitHub never needs a repo template. `prd.md` has: Problem, Solution, User stories, Spec link (`docs/spec/…`), Slices (auto-filled), Out of scope. `slice.md` has: Parent PRD, What to build, Acceptance criteria, Apps touched (`area:<app>`), Contract change (yes/no), Flag plan, Blocked by.

`pr.md` has: `Closes #N`, `Part of #PRD`, What changed, Contract change and regenerated client, Red/green evidence, `sandbox_gate` result, Review summary, Flag state, and Deploy notes (the migration is expand/contract safe; any new env value has been added to the secrets manager for staging **and** production; docs are updated).

**`labels.json` (config only):** `oc-github` creates any missing label the first time it needs it (`gh label create --force`, idempotent). `area:<app>` labels come from the `apps:` keys in `AGENTS.md`. This set replaces the older `state:*`, `category:*` and `mode:*` labels and their `labels.yml`. Labels: `prd`, `slice`, `area:<app>` for each app, `area:db`, `area:infra`, `area:docs`, `risk:security`, `status:ready`, `status:in-progress`, `status:in-review`, `status:blocked`, `flag-removal`.

**CI:** the PR gate runs the same isolated Compose test run. A final aggregate job (`ci-ok`) is the single required check. Image build and deploy workflows are separate and outside this flow.

**Branch protection on `main`:** require `ci-ok`, 1 approving review (Robin) and resolved conversations (CodeRabbit). No force push.

**CodeRabbit:** the GitHub app, installed per repo by Robin. It isn't run locally.

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
- No CodeRabbit CLI, and no preview/tunnel settings.

## 12. Environment and secrets (Robin enters every value himself)

| Name                                 | Where                           | Purpose                                               |
| ------------------------------------ | ------------------------------- | ----------------------------------------------------- |
| OpenCode Go / Zen login              | `/connect` on each machine      | models                                                |
| GitHub auth for `gh`                 | `gh auth login` on each machine | issues, PRs, monitor                                  |
| `OC_SANDBOX_BACKEND`                 | env (optional)                  | `auto` \| `sysbox` \| `docker`                        |
| Real app secrets                     | Robin's secrets manager         | never needed for tests (§9.2), never pulled by agents |
| `OC_SANDBOX_URL`, `OC_SANDBOX_TOKEN` | server env                      | sidecar access                                        |
| CodeRabbit app                       | GitHub, per repo                | PR review                                             |

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
