# Spec: skill-enforcement

Module id: `skill-enforcement`
Depends on: `lifecycle-contract`
Approved map: `capability-map-lifecycle-assurance.md` (pending Robin's approval)

## Objective

Extend `oc-skills` from guaranteed prompt attachment into phase-aware workflow enforcement. A coding session receives required core/domain workflows, is told the next required workflow on every primary model call, and cannot cross a guarded lifecycle boundary while required current-context evidence is missing or has a negative outcome.

Use four existing OpenCode 2.3.0 seams:

1. **Prompt hook:** retain fail-closed gateway/base/domain attachment and record explicit command attachments as loaded workflows.
2. **Model context hook:** add only the compact current lifecycle requirement on primary agent-loop calls, including tool-driven continuations. Do not inject every skill or duplicate full skill documents.
3. **Tool execute-after hook:** record observed skill invocations, specialist verdicts, sandbox outcomes and other workflow evidence against repository/slice/session and immutable head.
4. **Tool execute-before hook:** reject premature transitions, including issue creation without valid Plan approvals, initial push/PR creation/monitoring without local readiness, a recognized subsequent slice push without refreshed readiness, and a post-failure fix before the required debugging workflow. Read-only research remains available.

For shell transitions, recognize only the existing explicitly allowed slice-push/GitHub shapes; do not build a general shell parser or pretend compound commands are safe to classify. Existing watches must also revalidate shared local evidence whenever they observe a new head, so a direct push cannot bypass READY.

### Shared evidence and outcome semantics

Use one versioned readiness/evidence record in the existing canonical shared slice-store seam, readable by `oc-skills` and `oc-pr-monitor`. Plugin-private `ctx.storage` may cache transient state but is not shared truth. No second database or orchestration plugin.

OpenCode `status: "completed"` means only that a tool returned. It does not prove domain success:

- `sandbox_gate FAILED` and `redgreen_check VIOLATIONS` are negative outcomes.
- A specialist `REQUEST CHANGES`/Critical verdict is not approval.
- Blocked/refused/malformed/missing outcomes and interrupted/background specialists are incomplete or negative, never passing evidence.

Prefer structured tool outcomes. Where an existing tool returns text, validate only an explicit documented result contract; if it cannot be validated reliably, stop rather than parse loose prose or infer success. A negative review requires correction and fresh evidence as defined by `delivery-readiness`.

Evidence is head-scoped where applicable. A new head invalidates review/gate evidence but not timeless Plan approval or issue declarations. Uncommitted/untracked changes, issue declarations, repository facts and observed failure events also invalidate or recompute relevant requirements; cache invalidation is not limited to HEAD/session changes.

The first implementation task characterizes registered built-in tool IDs and result payloads through `ctx.tool.list()` and runtime contract tests. Do not assume tool names or treat a spawned specialist as completed before its final validated verdict. If OpenCode cannot observe a required outcome, stop that slice and report the limitation.

## Tech Stack

- OpenCode 2.3.0, `@opencode/plugin` 2.3.0, TypeScript.
- Existing `plugins/oc-skills/`, `plugins/shared/`, slice records and shared canonical storage.
- Official session `prompt`/`context` and tool `execute.before`/`execute.after` hooks.
- No new provider, model, npm dependency or external service.

## Commands

```text
npm install
npm test
npm run typecheck
```

Focused runtime verification:

```text
npm test -- tests/plugins/oc-skills.test.ts tests/plugins/oc-skills-routing.test.ts tests/lifecycle-policy.test.ts
```

## Project Structure

```text
plugins/oc-skills/index.ts                # existing hook registration and fail-closed admission
plugins/oc-skills/skills.ts               # existing attachment composition
plugins/shared/lifecycle-policy.ts        # canonical rules from lifecycle-contract
plugins/shared/lifecycle-store.ts         # versioned readiness/evidence contract and pure helpers
plugins/shared/slice-store.ts             # existing shared persistence/locking seam
tests/plugins/oc-skills-routing.test.ts   # prompt/context/tool-hook behavior
tests/plugins/oc-skills.test.ts           # composition and evidence unit tests
tests/lifecycle-policy.test.ts            # pure transition/trigger fixtures
```

## Code Style

Keep orchestration in the hook adapter and deterministic decisions in pure helpers. A ledger entry records a validated observed outcome, not a model's claim or a tool's mere completion.

```ts
{
  schemaVersion: 1,
  slice: 47,
  head: "immutable-sha",
  kind: "sandbox_gate",
  outcome: "passed",
}
```

- No LLM calls in routing or gate evaluation.
- No full transcript scan or full diff read on every model call; cache bounded context and invalidate on relevant metadata, working-tree, failure, head or session changes.
- No duplicate lifecycle state machine in another plugin.
- Errors identify the missing/negative requirement and exact next action.

## Testing Strategy

- RED/GREEN tests for attachment, invocation, validated outcome and artifact evidence.
- Include completed-with-`FAILED`, completed-with-`VIOLATIONS`, blocked/refused, malformed/missing, negative-verdict and interrupted/background fixtures.
- Prove context guidance survives tool continuations and does not attach to unrelated agents/title/generate calls.
- Prove head, working-tree, issue/repository metadata and failure events invalidate/recompute appropriate state.
- Exercise security, browser, migration, documentation, failure/debugging, declared-judgment and explicit not-applicable fixtures.
- Prove initial push/PR/watch and recognized subsequent pushes enforce readiness; an existing watch rechecks a new head.
- Prove read-only exploration and standalone maintenance are not unnecessarily blocked.
- Test legacy-session/watch reconciliation without backdated evidence or duplicate READY.

## Boundaries

- **Always:** fail closed at guarded transitions when evidence is unavailable, stale, malformed or negative.
- **Always:** distinguish attached, invoked, validated-outcome, artifact-backed and human-approved evidence.
- **Always:** keep context bounded, redacted and restricted to the correct agent/session.
- **Ask first:** before adding a new plugin/tool or changing public tool schemas.
- **Never:** infer success from tool completion, PR prose, spawned processes, bot approval or missing transcripts.
- **Never:** classify semantic ambiguity as N/A, run all 25 skills, add a second router, print secrets or weaken permissions.

## Success Criteria

- Bare Build and explicit commands receive equivalent required workflow routing.
- Plan issue creation and PR delivery transitions reject missing/stale/negative evidence.
- A test/build failure activates `debugging-and-error-recovery` before the fix path continues.
- Mechanical contextual triggers survive stale labels; declared judgment triggers remain explicit and ambiguity blocks safely.
- Existing monitors consume the shared readiness record on every relevant head change.
- Restarted and legacy sessions/watches cannot reuse stale/self-attested evidence or emit duplicate READY.
- `npm test` and `npm run typecheck` pass.

## Open Questions

None before implementation. Built-in tool payload details are an implementation verification item with an explicit stop condition, not a reason to guess.

## Sources

- OpenCode prompt and model-context hooks: <https://opencode.ai/docs/build/plugins/server/#hooks>
- OpenCode tool interception and registered tool inspection: <https://opencode.ai/docs/build/plugins/server/#tools>
- OpenCode plugin storage scope: <https://opencode.ai/docs/build/plugins/server/#storage>
- Existing shared-store rationale: `plugins/shared/slice-store.ts`.
