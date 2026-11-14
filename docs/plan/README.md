# Plan pack: opencode-config-v2

Everything needed to build `roborew/opencode-config-v2` from an empty `git init`. Nothing is taken from earlier config repos.

Read in this order:
1. `spec.md`: problem, solution, 45 user stories, module decisions, test seams, out of scope.
2. `blueprint.md`: exact layout, `opencode.jsonc`, model IDs, permissions, plugin tool signatures, the app repo contract, the sidecar API, secrets, CI.
3. `commands.md`: drafts of the five command templates.
4. `decisions.md`: D1–D32, the decisions behind it all.
5. `../CONTEXT.md`: glossary. `../adr/`: ADRs 0001–0008.
6. `../../.scratch/opencode-v2/issues/`: tickets 00–12, in dependency order.

Build order (frontier):
- 00 → 01 → 02. In parallel after 00: 03 (fixture)
- After 02 + 03: 04 and 05 in parallel
- After 03: 11. After 05: 07 and 09 in parallel
- After 04 + 05: 06. After 06 + 07: 08. After 02 + 09: 10
- After 08 + 10 + 11: 12

App repos use the monorepo layout and architecture from Robin's Project Template (`../../templates/project/TEMPLATE.md`). Tests always run fully isolated in Docker (blueprint §7.2, §9.2). Each repo has one test-only `compose.yml` (D29). Agents call Compose directly, and the `justfile` is Robin's optional shortcut (D31). E2E runs in Docker (D32).
Tickets 09 and 10 are carried out in the opencode-server repo, against blueprint §10–§11.
Items marked [spike] are documented by OpenCode but not yet run; ticket 01 settles them.
