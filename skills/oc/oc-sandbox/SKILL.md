---
name: oc-sandbox
description: Isolated test runs for a slice — sandbox_up to warm, sandbox_test for RED/GREEN runs with evidence, sandbox_gate before the PR, redgreen_check to verify test-first discipline, sandbox_down to clean up. Every test run goes through these tools; never raw docker.
---

# oc-sandbox — the verification box

Every test run happens fully isolated in Docker, built from the repo's own
Dockerfiles and its single `compose.yml` (D29). Nothing is taken from the
machine running OpenCode. The backend (sysbox on the server, docker on the Mac)
is detected automatically; `OC_SANDBOX_BACKEND` overrides it.

## The RED/GREEN loop

1. `sandbox_up({ slice })` once when the slice starts — builds the contract's
   images and warms dependencies so the first RED run isn't cold.
2. For each acceptance criterion: write the failing test, commit it test-only,
   then `sandbox_test({ slice, service, args })` with the focused test args —
   it must FAIL (that failure is recorded as evidence = RED). Then write the
   minimum code, commit, and re-run the same focused command — it must PASS
   (GREEN). Evidence is recorded against the commit SHA.
3. `sandbox_gate({ slice })` before the PR: every test service in the contract,
   the client drift check, and the production-image smoke check.
4. `redgreen_check({ slice })`: verifies each behaviour-changing commit has a
   preceding failing test-only commit. Generated client files count as neither.
5. `sandbox_down({ slice })` when the slice ends.

## Reading results

- `sandbox_test` returns GREEN/RED with the exit code, the commit SHA it recorded
  evidence against, and the last 200 lines of output with secrets redacted.
  Read the tail before deciding anything.
- `sandbox_up` builds the contract's images and brings the dev-profile
  dependencies up healthy (the warm-up), so the first RED run isn't a cold build.
- `sandbox_gate` runs every test service in the contract's `services` map
  (except e2e/smoke), regenerates the client through the `generator_service`
  and diffs the generated globs, then brings up the full profile (production
  images) and runs the smoke service.
- `redgreen_check` classifies each commit `main..HEAD` by its changed files
  (`test_globs` vs `contract.generated`): a test-only commit needs a failing
  record, the following code commit needs a passing one, and a code commit
  with no preceding test-only commit is a violation. Generated commits count
  as neither.
- On failure, follow debugging-and-error-recovery; after three failed attempts
  on the same criterion, stop as BLOCKED and comment on the slice issue.
- Test-path globs come from the repo's `AGENTS.md` front matter (`test_globs`).

Never run `docker`, `sandbox` or `just` test commands directly — they are denied
for good reason: raw runs are not isolated and leave no evidence.
