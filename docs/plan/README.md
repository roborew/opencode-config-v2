# Plan pack: opencode-config-v2

Everything needed to build `owner/opencode-config-v2` from an empty `git init`. Nothing is taken from earlier config repos.

Read in this order:

1. `spec.md`: problem, solution, 45 user stories, module decisions, test seams, out of scope.
2. `blueprint.md`: exact layout, `opencode.jsonc`, model IDs, permissions, plugin tool signatures, the app repo contract, the sidecar API, secrets, CI.
3. `commands.md`: drafts of the five command templates.
4. `decisions.md`: D1–D34, the decisions behind it all.
5. `../CONTEXT.md`: glossary. `../adr/`: ADRs 0001–0008.
6. `../../.scratch/opencode-v2/issues/`: tickets 00–12 (no 03), in dependency order.

Build order (frontier):

- 00 → 01 → 02
- After 02: 04, 05 and 11 in parallel
- After 05: 07 and 09 in parallel
- After 04 + 05: 06. After 06 + 07: 08. After 02 + 09: 10
- After 08 + 10 + 11: 12

Each project uses one app repo; the Project Template (`../../templates/project/TEMPLATE.md`) guides both single-app and multi-app layouts without prescribing a monorepo, nested `apps/`, an API boundary or a particular stack. Tests always run fully isolated in Docker (blueprint §7.2, §9.2). Each repo has one test-only `compose.yml` (D29). Agents call Compose directly, and the `justfile` is an optional shortcut (D31). Browser E2E runs in Docker when the repo has browser flows (D32).
Tickets 09 and 10 are carried out in the opencode-server repo, against blueprint §10–§11.
Ticket 01 settled every former [spike] item on 2026-11-14 (`../adr/0009-spike-results.md`); the blueprint records the confirmed approaches.

## Supplementary initiative specs

- `capability-map-local-quality-feedback.md`
- `spec-sandbox-static-checks.md`
- `spec-plan-project-health.md`
- `spec-matt-pocock-skills.md` (approved 2026-11-25)
- `capability-map-lifecycle-assurance.md` (draft, awaiting approval)
- `spec-lifecycle-contract.md` (draft, awaiting approval)
- `spec-skill-enforcement.md` (draft, awaiting approval)
- `spec-delivery-readiness.md` (draft, awaiting approval)
- `plan-lifecycle-assurance.md` (draft, awaiting approval)

The local-quality-feedback documents are later, approved additions to the
original plan pack. Lifecycle-assurance documents are planning-only drafts.
Neither is part of the numbered ticket build order above.
