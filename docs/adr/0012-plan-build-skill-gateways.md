# 0012 — Plan and Build gateways activate Addy's skills

Status: accepted (2026-11-19)

## Context

The initial configuration made `/spec` and `/plan` the deterministic entry points and only guaranteed slice-specific skills in worktree sessions. That was not the requested contract. Entering `/plan` with a new idea could incorrectly assume an existing PRD; merely selecting Plan or Build could leave the global skill table as only a soft fallback.

There were also two concrete coverage defects: Build could not invoke `using-agent-skills`, and neither primary could invoke `shipping-and-launch`. Other contextual skills were available but lacked a coherent discovery rule. The existing prompt hook logged routing errors and admitted the prompt, silently removing the supposed guarantee.

Robin expects two simple gateways, with every applicable Addy workflow considered at session start and as context changes. Vendoring all 25 skills is insufficient; they need explicit, reachable activation contracts without running every workflow on every task.

## Decision

`plan` and `build` are the two gateways into the delivery flow. `oc-skills` reads `session.agent` for every admitted prompt and attaches:

- `using-agent-skills` for continual Addy discovery; and
- `oc-plan-gateway` or `oc-build-gateway` for the mandatory core workflow.

An older session with no agent field uses the configured default `build`. Session/routing failures reject admission instead of silently dropping the required workflows.

The Plan gateway starts Define whenever a significant initiative lacks an approved spec, whether the request came from `/plan`, `/spec`, or bare Plan. `/spec` is only an optional explicit shortcut. Plan writes the spec before its approval gate, owns the spec PR and PRD after approval, then presents the slice breakdown for a second approval before creating issues. Generic Addy `tasks/plan.md` and `tasks/todo.md` outputs are replaced by the spec + PRD + linked GitHub issues for this flow.

The Build gateway distinguishes central coordination from implementation in a slice worktree. Bare Plan also receives interview/spec/planning/GitHub; bare Build receives worktree/GitHub. Slice overlays compose the gateway with incremental implementation, context engineering, TDD, git workflow, sandbox tooling, review/simplification, PR monitoring, and area/risk skills. Core workflows therefore never depend on a merely referenced but unloaded skill. All other Addy capabilities have explicit contextual triggers in the gateways and global `AGENTS.md`. `using-agent-skills` is now permitted in Build; `constraint-driven-development` and `shipping-and-launch` are permitted as quality/release-readiness workflows.

PR delivery remains distinct from production launch. `shipping-and-launch` does not imply automatic deployment, and Robin still merges. Conditional skill availability grants no extra shell or deployment permission.

Commands remain explicit/recovery interfaces into the same gateways rather than a competing routing implementation. The gateway files are canonical; commands and system prompts defer to them.

A static regression suite checks that all 25 vendored skills have an agent owner and an activation rule, that both modes have the meta-skill, and that mode-specific gateways have the correct exclusive permissions and files. Composition tests ensure primary gateway injection does not displace slice overlays.

## Alternatives considered

- **Rely on skill descriptions and one more ordinary top-level skill:** rejected because model discovery remains the same soft fallback that caused the gap. The gateways require mechanical attachment by the prompt hook.
- **Inject every Addy skill on every prompt:** rejected as unnecessary context use and indiscriminate execution. Only discovery and gateway skills are universal; full workflows attach deterministically at core phases or contextually when applicable.
- **Put a second full router in each command/system prompt:** rejected as drift-prone duplication. Gateway skills own the route; prompts and commands point to it.
- **Keep the hook fail-open:** rejected because it advertises a guarantee while silently omitting required skills exactly when runtime behavior goes wrong.

## Consequences

Plan and Build no longer depend on Robin naming the correct phase command, TDD, frontend, or other individual skills. Core workflow loading and plugin error behavior become testable mechanical concerns. Following a loaded skill still requires model compliance; this configuration does not claim that every model decision can be made deterministic.

Plan's read-only restriction is now explicitly limited to research/drafting before approval. It cannot be used to justify handing spec and issue output to Build. Older incomplete sessions need a fresh prompt for gateway attachment; commands are no longer required to provide the missing workflows.
