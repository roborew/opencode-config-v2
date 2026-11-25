# Spec: matt-pocock-skills

Module id: `matt-pocock-skills`
Depends on: —

## Objective

Vendor Matt Pocock's complete **promoted production skill set** in the global OpenCode config, using the same pinned, approval-gated maintenance model as Addy's skills.

The integration has two user-facing commands:

- `/matts-skills` — the single entry point for browsing and explicitly selecting a Matt skill. It must not add every Matt skill as a separate slash command.
- `/sync-skills` — resolve the latest stable production releases of Addy and Matt, show both diffs and their lifecycle impact, then update either or both after explicit approval without silently changing the internal delivery lifecycle.

Matt skills remain outside the automated Define → Plan → Build → Verify → Review → Ship flow. Plan and Build must not advertise or load them, and `oc-skills` must not attach them as gateways, base skills, contextual skills, or slice overlays. A Matt workflow runs only when the user explicitly selects it through `/matts-skills` or explicitly mentions its ID in the dedicated Matt utility agent.

### Meaning of “all production-ready Matt skills”

The source of truth is the upstream release's `.claude-plugin/plugin.json` manifest, not every `SKILL.md` visible through skills.sh.

At the researched release, that manifest contains **27 promoted skills**:

- **Engineering (20):** `ask-matt`, `grill-with-docs`, `triage`, `improve-codebase-architecture`, `setup-matt-pocock-skills`, `to-spec`, `to-tickets`, `implement`, `implement-spec`, `wayfinder`, `retro`, `prototype`, `diagnosing-bugs`, `research`, `tdd`, `domain-modeling`, `codebase-design`, `code-review`, `pr`, `wizard`.
- **Productivity (7):** `grill-me`, `handoff`, `teach`, `to-questionnaire`, `wait-what`, `grilling`, `writing-for-agents`.

This set is dynamic: a future stable release may add, rename, or remove promoted skills, and the sync must reconcile those changes through its compatibility gate.

Exclude:

- `skills/in-progress/` — public beta skills that may change or disappear without warning.
- `skills/misc/` — frozen, unmaintained skills explicitly outside the maintained production bar.
- `skills/deprecated/`, `.out-of-scope/`, documentation-only remnants, upstream CI, Changesets, and development tooling.

Vendor every file in each promoted skill directory, including `SKILL.md`, `agents/openai.yaml`, companion Markdown, templates, scripts, and executable modes. Also vendor the upstream MIT `LICENSE` and the release's production manifest. No upstream npm installation is required at runtime.

### Production release policy

“Latest production-ready” means each repository's latest non-draft, non-prerelease GitHub release, resolved to an immutable full commit SHA. It does not mean whichever commits happen to be on `main`.

Research snapshots:

| Upstream                  | Current local/researched state                                  | Latest stable release at research time                      |
| ------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| `addyosmani/agent-skills` | Local pin `39b723ceebf81474d0557c1fecd01eddab585563` (`0.6.16`) | `0.6.18`, commit `e997ac5b9a74eab332d5e9793bb38a38c8cfdd74` |
| `mattpocock/skills`       | Not yet vendored                                                | `v1.3.2`, commit `d1478fcb140db0b93c0c8df17bcfd311844749d0` |

Implementation must resolve the releases current at execution time; these SHAs are evidence, not permanent pins.

Addy's latest release currently contains **26 skills**, adding `accessibility-engineering` to the currently vendored 25. This demonstrates why synchronization must not assume fixed counts or blindly copy new skills into lifecycle routing.

## Tech Stack

- OpenCode 2.x, compatible with the repository's pinned 2.3.0 runtime.
- Native recursive directory-based `SKILL.md` discovery.
- Native Markdown command templates.
- Two non-lifecycle utility agents:
  - `matt` for explicitly selected Matt workflows.
  - `skill-admin` for approval-gated upstream synchronization.
- Both utility agents use the existing `opencode-go/kimi-k3.1-pro` roster entry.
- OC-owned sync skills and TypeScript/Vitest config verification.
- GitHub releases/tags as the upstream version channel; no background updater and no runtime `skills.sh`/npm dependency.

Plan and Build remain the only delivery-lifecycle gateways. The utility agents do not add Define, Plan, Build, Verify, Review, or Ship routes.

### Why two utility agents

OpenCode explicitly loads a skill with `@skill-id`; it does not automatically create a slash command for every skill. Permissions are also agent-scoped, and `disable-model-invocation` hides a skill from autonomous model selection while still allowing explicit loading by ID.

The two utility agents provide mechanical isolation:

- Plan and Build retain their deny-all skill policies and receive no Matt or sync allow rules.
- `matt` can load only the promoted Matt skills needed for the user's selected workflow. It receives no Addy lifecycle or OC gateway skills.
- `skill-admin` can load only `skills-sync`, `addy-sync`, and `matt-sync`. It cannot invoke Matt workflows or Addy lifecycle skills.
- `oc-skills` continues attaching lifecycle gateways only to Plan and Build, so its routing logic needs no Matt or sync additions.
- Sync-time edits to the config are separated from app-repo work performed by a manually selected Matt skill.

A manually selected Matt workflow retains its documented behavior. For example, `teach` creates learning artifacts and `implement` can write code. Such side effects require explicit selection of that workflow; they are never triggered by the OC delivery lifecycle. Repository instructions still take precedence: tests use the repo's required isolated path, the user merges, and agents never force-push, push to `main`, or deploy autonomously.

## Commands

### Browse or start a Matt workflow

```text
/matts-skills
/matts-skills teach
/matts-skills improve-codebase-architecture
```

With no argument, `/matts-skills` presents one grouped menu of the promoted user-facing workflows and stops. The user then chooses by name or number. Only that explicit choice loads the selected skill.

With an argument naming a valid skill, the command treats it as the user's explicit selection and loads it directly. An unknown or ambiguous name produces the menu plus an error; it never guesses.

The menu has two levels of visibility:

1. **User-facing workflows** — skills marked `disable-model-invocation: true`, plus other skills upstream intends users to call directly.
2. **Reusable helpers** — listed as supporting capabilities, normally invoked by a selected workflow rather than presented as equal top-level choices.

At the researched release there are 16 user-invoked workflows and 11 model-invocable helpers. The menu is generated from the vendored production manifest and frontmatter, not maintained as a second hardcoded catalog.

The command may use upstream `ask-matt` for its routing knowledge, but dispatch belongs to the OC-owned command: upstream `ask-matt` recommends and stops, and no skill autonomously chains into another user-invoked skill. The user's menu selection is the explicit invocation.

Direct explicit loading remains available inside the `matt` agent as `@teach`, `@research`, and so on. Because individual `/teach`-style commands are not registered, the `matt` agent must translate upstream human-facing instructions such as “run `/setup-matt-pocock-skills`” into either `@setup-matt-pocock-skills` or a return to `/matts-skills`.

### Synchronize both upstreams

```text
/sync-skills
/sync-skills addy=0.6.18 matt=v1.3.2
```

With no arguments, resolve both latest stable GitHub releases independently. Optional `addy=` and `matt=` values select explicit tags or full SHAs for reproducible updates; `main` is allowed only as a clearly labelled non-production preview and is never the default or a fallback.

Existing individual `@addy-sync` behavior is updated to use the same stable-release policy. `@matt-sync` adds the equivalent Matt adapter. Both remain internal to `skill-admin`; `/sync-skills` is the supported combined entry point.

### Repository verification

```text
npm ci
npm test
npm test -- tests/matt-skill-isolation.test.ts
npm run typecheck
```

Runtime acceptance uses OpenCode 2.3.0 to verify menu dispatch, explicit loading, helper invocation, utility-agent selection, release resolution, approval gates, and Plan/Build isolation.

## Project Structure

Expected additions and updates:

```text
skills/matt/
├── UPSTREAM.md                         # repo, release tag, full SHA, date, licence, production contract
├── LICENSE                             # upstream MIT licence, verbatim
├── .claude-plugin/plugin.json           # release's production allowlist, verbatim
├── engineering/                        # every complete promoted engineering skill folder
│   └── <skill-id>/{SKILL.md,agents/openai.yaml,...}
└── productivity/                       # every complete promoted productivity skill folder
    └── <skill-id>/{SKILL.md,agents/openai.yaml,...}

agents/matt.md                          # explicit Matt workflows only; no OC lifecycle skills
agents/skill-admin.md                   # sync adapters only; config maintenance approvals
commands/matts-skills.md                 # sole Matt workflow slash entry point and menu dispatcher
commands/sync-skills.md                  # combined Addy + Matt update entry point

skills/oc/skills-sync/SKILL.md           # two-release orchestration + compatibility gate
skills/oc/matt-sync/SKILL.md             # Matt release adapter
skills/oc/addy-sync/SKILL.md             # changed from main-first to stable-release-first

tests/matt-skill-isolation.test.ts       # production set, menu, permissions, dependency and lifecycle isolation
tests/addy-skill-coverage.test.ts        # remove fixed 25 assumption; retain explicit routing coverage

opencode.jsonc                          # no Matt/sync permissions added to Plan or Build
plugins/oc-skills/                      # unchanged runtime routing: Plan/Build gateways only
AGENTS.md                               # separate manual Matt and sync rules; no Matt activation matrix
README.md                               # menu, direct @ loading, sync policy, side-effect locations
docs/CONTEXT.md                         # vendored Matt and production-release sync definitions
docs/plan/blueprint.md                  # layout, utility agents, commands, sync and CI contracts
docs/plan/decisions.md                  # new decision for complete Matt vendoring and safe combined sync
docs/adr/0016-manual-matt-skills.md      # isolation, menu, production manifest and release rationale
docs/plan/README.md                     # supplementary spec index
.github/workflows/ci.yml                # recursive discovery + Matt-Sync trailer verification
```

Preserve Matt's upstream `engineering/` and `productivity/` grouping. OpenCode derives IDs from the leaf directory names, so nesting does not change `@skill-id` invocation.

The implementation adds exactly two slash commands. It does not add `/teach`, `/implement`, `/research`, or other individual Matt commands.

### Workflow output locations

- `teach` treats its invocation directory as a persistent workspace and can create `MISSION.md`, `RESOURCES.md`, `NOTES.md`, `reference/`, `learning-records/`, `lessons/`, and `assets/`. The README must recommend a dedicated learning workspace unless those files are intentionally wanted in the current repository.
- `improve-codebase-architecture` writes its HTML report to the OS temp directory. Its grilling phase can update `GLOSSARY.md` and offer ADR changes. Reports use Tailwind and Mermaid CDNs and therefore need network access for full rendering.
- Other Matt workflows retain their upstream-documented outputs. The menu must summarize consequential side effects before selection where practical, especially implementation, tracker, Git, or filesystem changes.
- Neither generated workflow output nor sync temporary clones may be committed into this config repo.

## Code Style and Sync Contract

Keep every vendored upstream file byte-for-byte unmodified and preserve executable modes. All OpenCode adaptation belongs in `agents/`, `commands/`, `skills/oc/`, tests, and documentation.

A Matt command remains a dispatcher, not a duplicate implementation of upstream workflows:

```markdown
---
description: Browse and explicitly select a Matt Pocock skill
agent: matt
---

@ask-matt

$ARGUMENTS

Present the production skill menu. Load a user-invoked skill only after the
user explicitly selects it; never select one autonomously.
```

The exact implementation may refine this prompt to handle direct arguments and ambiguous choices, but it must preserve the single-command and explicit-selection contracts.

Each upstream manifest records its release tag and resolved SHA. Commits changing the corresponding managed trees carry:

```text
Addy-Sync: <full-addy-upstream-sha>
Matt-Sync: <full-matt-upstream-sha>
```

A combined commit touching both trees carries both trailers. Separate commits need only their own upstream's trailer.

### `/sync-skills` procedure

1. **Preflight**
   - Run from a clean config checkout; never operate in an app repo or a dirty managed tree.
   - Confirm the current pins and read the existing lifecycle references.
   - Resolve both requested stable releases to full SHAs. Never silently fall back to `main`.

2. **Fetch and validate before writing**
   - Fetch both snapshots into throwaway clones.
   - For Matt, read `.claude-plugin/plugin.json` and enumerate exactly its promoted `engineering/` and `productivity/` directories.
   - For Addy, enumerate the complete released `skills/` set plus shared `references/`.
   - Validate duplicate skill IDs across Addy, Matt, and OC; missing companion files; broken internal skill references; production-set additions/removals; and executable script modes.
   - Do not include Matt beta, frozen, deprecated, or out-of-scope directories.

3. **Show one combined review**
   - Release tag and old/new SHA for each upstream.
   - Added, changed, and removed files and skills.
   - New, renamed, removed, or newly required skill dependencies.
   - Exact lifecycle impact: Addy activation rules, Plan/Build permissions, command references, gateway references, tests, and documentation requiring reconciliation.
   - Confirmation that no Matt skill will be added to Plan, Build, OC gateways, or slice overlays.
   - Any upstream instruction changes that could affect tests, Git, issues, deployment, writes, or subagent behavior.

4. **Wait for explicit approval**
   - Approval covers the shown upstream diffs and any separately listed compatibility edits.
   - New Addy skills are never silently activated. The sync proposes their permission owner and activation rule, and the user approves or rejects that mapping before it is applied.
   - Removed or renamed Addy skills referenced by the lifecycle block the update until an explicit replacement/removal mapping is approved.
   - Matt production additions update the menu through the manifest but do not gain Plan/Build access.

5. **Apply only approved changes**
   - Copy complete managed directories and remove only stale paths within those managed roots.
   - Leave `plugins/oc-skills/`, gateways, lifecycle commands, and existing Plan/Build Matt denial unchanged.
   - Update each `UPSTREAM.md`, licence, production manifest, and only the approved compatibility wiring.
   - Never push, publish, open issues/PRs, merge, or commit automatically. If the user separately asks for a commit, require the appropriate trailer(s).

6. **Verify**
   - Run focused isolation/coverage tests, the full config test suite, typechecking, and config verification.
   - Treat any failure as an incomplete sync; do not claim success or create a commit.
   - Report the final release pins, approved lifecycle changes, and verification evidence.

No background update, automatic update on OpenCode startup, or unmanaged `npx skills add` installation path is introduced.

## Testing Strategy

### Automated config verification

Add focused Vitest coverage proving:

- The vendored Matt skill directories exactly match the promoted paths in the vendored production manifest, with no `in-progress`, `misc`, or deprecated skill directories.
- Every promoted skill has its complete required supporting files; the upstream licence and release/SHA metadata are present.
- Production IDs are unique across Addy, Matt, and OC.
- Matt's operative helper references resolve within the vendored production set or are explicitly reported as external runtime dependencies.
- `/matts-skills` is the only Matt workflow command, selects `agent: matt`, supports `$ARGUMENTS`, and requires explicit selection before dispatch.
- `/sync-skills` selects `agent: skill-admin` and loads the combined sync workflow.
- `matt` allows only the promoted Matt skills; `skill-admin` allows only the three sync skills; neither receives OC lifecycle gateways.
- Plan and Build have no allow rule for any Matt skill or sync skill.
- `oc-skills` primary/base/label/default routing contains no Matt or sync skill.
- Existing Addy coverage checks every currently vendored Addy skill without asserting a permanent count of 25. A newly synced Addy skill must receive an explicit approved permission owner and activation rule before tests pass.
- Existing lifecycle command and gateway references remain valid after a sync.

Extend CI skill discovery recursively to include `skills/matt/engineering/` and `skills/matt/productivity/`, so command and permission references resolve against the actual leaf IDs.

Add a full-history check analogous to Addy's: every commit touching `skills/matt/` must have a `Matt-Sync: <sha>` trailer. A commit touching both managed trees must contain both trailers.

Run `npm test` and `npm run typecheck`. Config schema validation and existing CI jobs must remain green.

### Runtime acceptance

Using OpenCode 2.3.0:

1. Confirm `/matts-skills` and `/sync-skills` appear, while individual Matt slash commands do not.
2. Open `/matts-skills`, confirm the grouped production menu appears, and confirm no skill runs before a choice.
3. Select `teach` through the menu and confirm explicit loading works despite `disable-model-invocation: true`; repeat with a direct `/matts-skills teach` argument.
4. During architecture review, confirm `codebase-design`, `grilling`, and `domain-modeling` load only as helpers of the explicitly selected workflow.
5. Confirm Plan and Build neither advertise nor successfully load Matt or sync skills, and their existing gateway attachments are unchanged.
6. Run `teach` from a temporary/dedicated workspace and confirm generated state lands there, not in `skills/matt/` or the global config.
7. Exercise `/sync-skills` against recorded or controlled release responses up to the approval gate. Confirm stable tags resolve to SHAs, beta/frozen Matt skills are excluded, both diffs and lifecycle impacts are shown, and no write occurs before approval.
8. Exercise a fixture with an added Addy skill and confirm it is not silently activated; a fixture with a removed referenced skill must block pending an explicit mapping.
9. Confirm no approval, failed verification, or unresolved collision produces no successful sync result.

## Boundaries

- **Always:** vendor the complete promoted Matt production set from a stable release, preserving whole folders, companion files, scripts, modes, licence, and manifest.
- **Always:** keep upstream files unmodified and all OpenCode adaptations outside `skills/addy/` and `skills/matt/`.
- **Always:** resolve stable releases to full SHAs and require explicit diff/compatibility approval before writing.
- **Always:** expose Matt workflows through one `/matts-skills` menu and dispatch only after explicit user selection.
- **Always:** keep Matt and sync skills out of Plan/Build permissions, activation matrices, gateways, lifecycle commands, and slice overlays.
- **Always:** require explicit approval before adding, removing, or remapping an Addy lifecycle activation.
- **Always:** preserve repository-specific rules during manually selected Matt workflows, including isolated tests and human-only merges.
- **Ask first:** before previewing `main`, expanding beyond the production manifest, changing utility-agent models/permissions, or altering lifecycle wiring during sync.
- **Never:** run `npx skills add` as an unmanaged second installation path.
- **Never:** silently sync from moving `main`, auto-update at startup, or partially apply an unreviewed release.
- **Never:** automatically expose every Matt skill as its own slash command or invoke a user-selected workflow without that selection.
- **Never:** let `skill-admin` implement app work, open PRs/issues, push, merge, deploy, or commit without a separate explicit request.
- **Never:** commit generated teaching workspaces, architecture reports, temporary upstream clones, or real secrets into this config repo.

## Success Criteria

- The complete promoted Matt production set is vendored at a pinned stable release, currently 27 skills at the researched release, with beta and frozen sets excluded.
- `/matts-skills` is the only Matt workflow slash command; it lists the current production workflows and launches only the user's explicit choice.
- Matt helper skills work within selected workflows without becoming available to Plan or Build.
- `/sync-skills` can update Addy and Matt independently or together to their latest stable release tags and immutable SHAs.
- The existing `addy-sync` path uses the same release policy, and the new `matt-sync` path mirrors its approval and provenance model.
- Sync previews and approvals cover both upstream content and lifecycle-compatibility changes; new or removed Addy skills never silently rewire the lifecycle.
- A sync does not change Matt isolation or OC gateway routing, and it is not considered complete until all config verification passes.
- Users can understand workflow side effects and output locations, including teaching state and architecture reports.
- Focused tests, the full test suite, typechecking, config validation, vendoring-trailer checks, and existing CI pass.

## Open Questions

None. “All Matt skills” is interpreted as the complete promoted production manifest, excluding upstream's explicitly beta and frozen/unmaintained sets. The single menu and stable-release sync policies are proposed for explicit spec approval.

## Sources

- OpenCode skills discovery, frontmatter, explicit loading, and permissions: <https://opencode.ai/docs/skills/>
- OpenCode command templates and agent selection: <https://opencode.ai/docs/commands/>
- OpenCode utility-agent modes and permissions: <https://opencode.ai/docs/agents/>
- Matt's upstream repository: <https://github.com/mattpocock/skills>
- Matt's production plugin manifest: <https://github.com/mattpocock/skills/blob/v1.3.2/.claude-plugin/plugin.json>
- Matt's invocation contract: <https://github.com/mattpocock/skills/blob/6f7f7831a625f040a8e06a0e7954826b87ce775a/.agents/invocation.md>
- Matt's beta-skill policy: <https://github.com/mattpocock/skills/blob/6f7f7831a625f040a8e06a0e7954826b87ce775a/skills/in-progress/README.md>
- Matt's frozen-skill policy: <https://github.com/mattpocock/skills/blob/6f7f7831a625f040a8e06a0e7954826b87ce775a/.out-of-scope/frozen-misc-skills.md>
- Matt's `ask-matt` router: <https://github.com/mattpocock/skills/blob/6f7f7831a625f040a8e06a0e7954826b87ce775a/skills/engineering/ask-matt/SKILL.md>
- Matt's latest stable release at research time: <https://github.com/mattpocock/skills/releases/tag/v1.3.2>
- Addy's latest stable release at research time: <https://github.com/addyosmani/agent-skills/releases/tag/0.6.18>
