# Spec: plan-project-health

Module id: `plan-project-health`
Depends on: `sandbox-static-checks`
Approved map: `capability-map-local-quality-feedback.md`

## Objective

Start every new Define/spec phase with a quick, read-only project health check that confirms the app repo has the correct instructions and tooling declarations before work is planned.

Robin wants the following user-visible behavior:

- At the start of every new spec, Plan checks the app repo’s `AGENTS.md` and its actual manifests.
- The check confirms that the repo’s logical components, test contract, and static-check declarations match the real project.
- Missing or stale instructions are reported in the spec, not silently ignored.
- Required remediation is planned as an explicit, approved infrastructure slice.
- Plan never edits the app repo directly.

## Tech Stack

- OpenCode Plan gateway workflow.
- Read-only repo inspection through the existing `explore`/`general` agents.
- Existing `repo-setup` and `oc-plan-gateway` skills.
- No new plugin or external tool.

## Commands

This repo’s verification commands:

```text
npm install
npm test
npm run typecheck
```

## Project Structure

Expected areas of change:

```text
skills/oc/oc-plan-gateway/SKILL.md
skills/oc/repo-setup/SKILL.md
commands/spec.md
commands/plan.md
templates/project/TEMPLATE.md
docs/plan/
```

## Code Style

- Keep the health check short and deterministic.
- Report findings as concrete facts with file paths.
- Do not invent tooling that the repo does not have.
- Do not duplicate the full `repo-setup` upgrade workflow.
- Keep the check read-only.

## Testing Strategy

- Documentation and skill-coverage tests confirm the new workflow is referenced.
- No new app code is introduced.
- If the health check becomes a helper, its unit tests use temporary repositories.
- The check does not require a real Docker daemon or a real app repo.

## Boundaries

- **Always:** run the health check at the start of Define for a new spec or delta spec.
- **Always:** report missing or stale instructions with file paths.
- **Always:** route remediation through the normal spec/approval/slice flow.
- **Ask first:** before turning the check into a blocking gate.
- **Never:** edit the app repo directly.
- **Never:** fabricate lint/typecheck tooling that the stack does not have.

## Success Criteria

- Every new Define phase begins with the health check.
- The check covers `AGENTS.md` front matter, test contract, and static-check declarations.
- Findings are written into the spec as explicit remediation items.
- No app repo file is modified by Plan.
- `npm test` and `npm run typecheck` pass.

## Open Questions

None.
