---
name: oc-sandbox
description: Isolated test and static-check runs for a slice — sandbox_up to warm, sandbox_test for RED/GREEN runs with evidence, sandbox_check for lint/typecheck during the coding loop, sandbox_gate before the PR, redgreen_check to verify test-first discipline, sandbox_down to clean up. Every run goes through these tools; never raw docker.
---

# oc-sandbox — the verification box

Every test and static-check run happens fully isolated in Docker, built from
the repo's own Dockerfiles and its single `compose.yml` (D29). Nothing is
taken from the machine running OpenCode. The backend (sysbox on the server,
docker on the Mac) is detected automatically; `OC_SANDBOX_BACKEND` overrides
it.

## The RED/GREEN loop

1. `sandbox_up({ slice })` once when the slice starts — builds the contract's
   images and warms dependencies so the first RED run isn't cold.
2. For each acceptance criterion: write the failing test, commit it test-only,
   then `sandbox_test({ slice, service, args })` with the focused test args —
   it must FAIL (that failure is recorded as evidence = RED). Then write the
   minimum code, commit, and re-run the same focused command — it must PASS
   (GREEN). Evidence is recorded against the commit SHA.
3. While writing or changing code, run `sandbox_check({ slice, check })` for
   the repo's real lint/typecheck services. Use `check: "lint"` or
   `check: "typecheck"` for a focused run; omit `check` to run every declared
   static check. Static checks are part of the coding loop, not something to
   leave for CI.
4. `sandbox_gate({ slice })` before the PR: every declared static check,
   every test service in the contract, any declared generation drift check,
   and the production-image smoke check.
5. `redgreen_check({ slice })`: verifies each behaviour-changing commit has a
   preceding failing test-only commit. Declared generated files count as
   neither.
6. `sandbox_down({ slice })` when the slice ends.

Static checks never create RED/GREEN evidence. A lint or typecheck pass is
not a test pass, and `sandbox_test` never accepts a static-check service.

## First-time repo onboarding

A repo that has not been onboarded has no `compose.yml` and no `AGENTS.md`
test front matter yet. Its onboarding slice still follows the loop: commit the
onboarding tests test-only, then run `sandbox_test` — it returns
`RED (bootstrap)` without invoking Docker and records failing evidence
against the commit SHA, because the missing initial contract is the failure.
The implementation commit then adds `compose.yml` and the `AGENTS.md` test
front matter; re-run `sandbox_test` on the real contract for GREEN. This is
the only case where a missing contract becomes evidence: a declared but
empty or malformed contract is a fail-closed BLOCKED, and `sandbox_up` /
`sandbox_gate` always refuse a missing contract (the gate also refuses a
contract that declares no steps). A bootstrap record is failing evidence
only — it can never satisfy a GREEN requirement.

## Reading results

- `sandbox_test` returns GREEN/RED with the exit code, the commit SHA it
  recorded evidence against, and the last 200 lines of output with secrets
  redacted. Read the tail before deciding anything.
- `sandbox_check` returns PASSED/FAILED for one named check or all declared
  checks, with the same bounded, redacted output. It never records evidence
  and never changes the RED/GREEN state.
- `sandbox_up` builds the contract's images and brings the dev-profile
  dependencies up healthy (the warm-up), so the first RED run isn't a cold
  build.
- `sandbox_gate` runs every declared static check first, then every test
  service in the contract's `services` map (except e2e/smoke), regenerates and
  diffs declared generated artifacts when a `generator_service` exists, then
  brings up the full profile (production images) and runs the smoke service
  when one is declared.
- `redgreen_check` classifies each commit `main..HEAD` by its changed files
  (`test_globs` vs `contract.generated`): a test-only commit needs a failing
  record, the following code commit needs a passing one, and a code commit
  with no preceding test-only commit is a violation. Generated commits count
  as neither.
- On failure, follow debugging-and-error-recovery; after three failed attempts
  on the same criterion, call `slice_block` with the actionable reason and go
  idle. That retains the reason, attempts an issue comment and notifies
  central build. If the result says the issue comment or coordinator
  notification failed, surface which delivery failed and identify the issue
  comment if one exists; do not post the same blocker comment again.
- Test-path globs come from the repo's `AGENTS.md` front matter (`test_globs`).
- Static-check services come from the repo's `AGENTS.md` front matter
  (`test.checks`), using the project's real tooling — for example
  `ruff check`, `ruff format --check`, `mypy`, or `vp check` wrapped in the
  Compose contract. Never invent a static check the stack does not have.
- `sandbox_up`, `sandbox_test`, `sandbox_check` and `sandbox_gate` materialize
  every Compose mountpoint in the worktree (bind sources, nested volume
  targets) as the invoking user before containers start, so the Docker daemon
  never creates root-owned directories there. A BLOCKED mountpoint message
  names the exact path and the remedy. When it reports a foreign-owned or
  root-created directory, report the path and stop: only the operator may
  remove it, after confirming it is empty and safe — then retry the tool.
  Never chown, never delete, never weaken the check; `slice_finish` keeps its
  fail-closed removal guard.

Never run `docker`, `sandbox` or `just` test commands directly — they are
denied for good reason: raw runs are not isolated and leave no evidence.
