# Spec: sandbox-static-checks

Module id: `sandbox-static-checks`
Depends on: —
Approved map: `capability-map-local-quality-feedback.md`

## Objective

Make lint and typecheck failures surface inside the agent’s isolated Build loop and the pre-PR sandbox gate, instead of first appearing in GitHub Actions.

Robin wants the following user-visible behavior:

- When a slice worker writes or changes code, the repo’s real lint and typecheck services run during the coding loop, not only after the PR opens.
- `sandbox_gate` always runs every declared static check before any test service, generation drift check, or smoke check.
- Static checks use the app repo’s own framework tooling, wrapped in its existing isolated Compose contract.
- A lint/typecheck pass never counts as RED/GREEN test evidence.
- The same contract is used on the Mac, on the server, and in GitHub Actions.

Concrete commands this work must be able to cover, as reported from Rekalled:

- `ruff check`
- `ruff format --check`
- `mypy`
- `vp check`

These are examples of real framework tooling, not requirements for every repo. A repo declares only the static checks its stack actually has.

This module changes only this config repo: its plugin, its skills, its templates, and its documentation. It does not edit any app repository.

## Tech Stack

- OpenCode 2.x plugin TypeScript (`@opencode/plugin`).
- Docker Compose as the only test and static-check contract.
- The app repo’s existing lint and typecheck tooling.
- No new provider, model, or server-side dependency.

## Commands

This repo’s verification commands:

```text
npm install
npm test
npm run typecheck
```

Focused plugin tests:

```text
npm test -- tests/plugins/oc-sandbox.test.ts
```

## Project Structure

Expected areas of change:

```text
plugins/oc-sandbox/         # sandbox_check + static gate ordering
skills/oc/oc-sandbox/       # Build inner-loop instructions
skills/oc/oc-build-gateway/  # mandatory static-check workflow
commands/build.md            # command-facing description
templates/repo/AGENTS.md    # starting front matter example
templates/repo/.github/workflows/ci.yml
templates/project/TEMPLATE.md
docs/plan/                   # spec/blueprint/decision updates
docs/adr/                    # decision record for static checks
```

## Code Style

- Keep plugin logic in small, deterministic helpers.
- Keep every static check inside the isolated Compose contract.
- Keep static-check output redacted and bounded, like test output.
- Keep static checks separate from RED/GREEN evidence by design, not by convention.
- Keep documentation and skills aligned with the actual tool behavior.

Example of the intended app-repo declaration:

```yaml
test:
  checks:
    lint: app-lint
    typecheck: app-typecheck
```

## Testing Strategy

- Unit tests cover the `test.checks` contract.
- Plugin tests cover `sandbox_check`.
- Gate planning tests cover static-before-dynamic ordering.
- Regression tests prove static checks never create RED/GREEN evidence.
- Tests use temporary git repositories and no real Docker daemon.

## Boundaries

- **Always:** keep static checks inside `oc-sandbox`.
- **Always:** run static checks before dynamic gate steps.
- **Always:** keep static-check output redacted and bounded.
- **Ask first:** before extending the sidecar or Compose contract beyond `run --rm`.
- **Never:** edit an app repo directly from this config repo.
- **Never:** let a lint/typecheck pass satisfy a RED/GREEN requirement.
- **Never:** invent lint/typecheck commands a repo’s stack does not have.

## Success Criteria

- `sandbox_check({ slice, check })` runs a declared static-check service in isolation.
- `sandbox_check({ slice })` runs every declared static check.
- `sandbox_gate` runs every declared static check first.
- Static checks never appear in the evidence store.
- A checks-only contract is still invalid.
- Build documentation makes the static-check loop mandatory.
- The app-repo template and starting CI workflow declare example lint/typecheck services.
- `npm test` and `npm run typecheck` pass.

## Open Questions

None.
