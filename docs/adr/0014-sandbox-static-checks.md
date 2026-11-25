# 0014 — Sandbox static checks: lint and typecheck in the coding loop and gate

Status: accepted (2026-11-25)

## Context

`sandbox_gate` ran test services, generation drift, and smoke, but not the repo's lint or typecheck services. That meant failures such as `ruff check`, `ruff format --check`, `mypy`, or `vp check` surfaced first in GitHub Actions rather than during the coding loop. CI was the first place the agent saw the failure, which is too late and wastes a PR round.

RED/GREEN discipline is evidence-backed: every behaviour-changing commit needs a preceding failing test-only commit and a passing test record. A lint or typecheck pass is not a test pass. Treating static checks as ordinary test services would let a lint run satisfy the GREEN requirement and weaken `redgreen_check`.

## Decision

App repos declare their real static-check services in the same `AGENTS.md` test contract, under `test.checks`:

```yaml
test:
  checks:
    lint: app-lint
    typecheck: app-typecheck
```

- `checks` is an inline name → Compose service map, like `services`.
- Keys are flexible (`lint`, `typecheck`, `api-lint`, `web-typecheck`, …) so multi-app repos can declare per-component checks.
- Values are Compose services in the same `test` profile, built from the repo's own test targets.
- A repo declares only the checks its stack actually has. Checks are never invented just to fill the map.

`oc-sandbox` gains `sandbox_check({ slice, check?, args? })`:

- `check` names one declared static-check service.
- Omitting `check` runs every declared check.
- `args` are allowed only with a named check, for focused runs.
- Runs go through the same isolated Compose path as tests.
- Output is bounded and redacted like test output.
- **Static checks never create RED/GREEN evidence.** `sandbox_test` continues to accept only test services and the generator service, never `checks`.

`sandbox_gate` runs every declared static check **before** every test service, generation drift check, and smoke check. Static checks never create evidence there either.

A contract with only `checks` and no test services, generator, or smoke is still declared-empty and refused. Static checks supplement dynamic verification; they never replace it.

## Alternatives considered

- **Leave lint/typecheck to GitHub Actions only:** rejected — failures surface too late, after a PR round, and the agent's coding loop loses the fastest feedback it can get.
- **Declare static checks as ordinary `services` and run them through `sandbox_test`:** rejected — a lint/typecheck pass would then count as RED/GREEN evidence and could falsely satisfy the GREEN requirement.
- **Run host-native lint/typecheck commands directly:** rejected — violates the isolation contract and assumes toolchains on the machine running OpenCode.
- **Require every repo to declare lint and typecheck even when the stack has none:** rejected — inventing commands a framework does not provide adds fake confidence; `checks` is optional and framework-driven.
- **Separate static-check gate tooling outside Compose:** rejected — it would add a second contract, a second backend path, and drift between Mac, server, and CI.

## Consequences

- Lint and type failures surface during the coding loop and always before the PR, on both sandbox backends.
- GitHub Actions repeats the same isolated checks as a final confirmation, not the first discovery point.
- `redgreen_check` semantics are unchanged and protected by regression tests: static checks never enter the evidence store.
- A checks-only contract cannot pass the gate.
- App repos must provide real Compose-backed check services when their stack has lint/typecheck tooling; `repo-setup` proposes them from the repo's actual commands.
- The sidecar contract is unchanged: static checks reuse the allowed `docker compose … run --rm <service>` shape.
