# 0016 — Matt Pocock skills are complete but manual-only

Status: accepted (2026-11-25)

## Decision

Vendor the complete **promoted production set** from Matt Pocock's latest stable
release under `skills/matt/`. The release's `.claude-plugin/plugin.json` is the
allowlist; `skills/in-progress/` (beta), `skills/misc/` (frozen), deprecated and
out-of-scope material are excluded. Vendored skill folders are unmodified,
including companion references, scripts and `agents/openai.yaml`, and are updated
only by `matt-sync`.

Expose Matt through one `/matts-skills` command. It lists the production
workflows and loads one only after the user explicitly selects it. Reusable
helper skills stay behind the selected workflow. No individual Matt skill gets
its own slash command.

Keep Matt outside the Addy delivery lifecycle:

- Plan and Build have no Matt skill permissions.
- `oc-skills` never attaches a Matt skill to a gateway or slice.
- No lifecycle command, gateway or activation policy references a Matt skill.
- A dedicated `matt` utility agent is the only agent that can load Matt
  workflows.
- A dedicated `skill-admin` utility agent runs approval-gated synchronization and
  cannot run Matt or Addy workflows.

Both utility agents are `mode: subagent`. `/matts-skills` and `/sync-skills` select
them in the current session (`subagent: false`), so the selectable primary modes
remain exactly Plan and Build.

Synchronize both upstreams through `/sync-skills`. It resolves each upstream's
latest non-draft, non-prerelease release to a full commit SHA, stages and
validates both snapshots, reports one combined diff plus lifecycle impact, and
writes only after explicit approval. `main` is preview-only and never a fallback.
A newly released Addy skill is not activated until the user approves its owner,
trigger and evidence contract.

Commits changing `skills/matt/` require a `Matt-Sync: <sha>` trailer, mirroring
the existing `Addy-Sync: <sha>` contract.

## Rationale

Matt's skills are valuable for deliberate work between delivery cycles:
architecture review, teaching, research, handoffs and specification thinking.
They are not substitutes for the project's canonical Addy lifecycle and must not
compete with its gateways.

The stable-release boundary avoids shipping unreleased or beta instructions.
Whole skill folders preserve relative references and executable scripts without
a second runtime dependency. The production manifest makes “all Matt skills”
precise and automatically excludes content upstream itself does not maintain.

The menu keeps OpenCode's slash-command surface small while preserving access to
all promoted workflows. Permission-level isolation is stronger than prose-only
routing: the normal lifecycle agents cannot load Matt even if a future prompt
asks them to.

The combined sync preserves a single maintenance entry point while retaining
source-specific adapters. The compatibility gate prevents a mechanically
successful copy from silently breaking lifecycle coverage or enabling a skill the
user has not reviewed.

## Consequences

- A Matt release can add a promoted skill; the sync updates the production
  manifest, vendored folder set and `agents/matt.md` allow rules after approval.
- A new Addy release that adds or removes a skill may require a separately
  approved lifecycle-policy change before verification passes.
- OpenCode does not create a command for each Matt skill; upstream human-facing
  `/foo` references map to `/matts-skills` or `@foo` inside the `matt` agent.
- The vendored Matt tree is larger than the earlier two-workflow proposal but
  remains limited to upstream's production manifest.
- The utility agents use the existing Go model roster; no provider or model
  policy changes.
