# 0013 — Sandbox bootstrap RED: a missing initial contract is a legitimate RED

Status: accepted (2026-11-20)

## Context

RED/GREEN discipline (blueprint §7.2) requires every behaviour-changing commit to have a preceding failing test-only commit with a recorded `sandbox_test` RED. A first-time repo has no root `compose.yml` and no `AGENTS.md` test front matter until its onboarding slice adds them, so the onboarding slice's test-only commit could never record a RED: `ensureUp` blocked before evidence was taken. With a `compose.yml` present but no front matter, the parser's default fallback made the undeclared `test` service run and fail at runtime — recorded as convenient RED evidence that proved nothing about the code. Worse, `sandbox_gate` ended with `steps.every(...)` and printed "PASSED" over an empty report for a contract that declared nothing usable.

## Decision

`ensureUp` reports structured blocked reasons instead of message-text-only blocks, and `sandbox_test` — and only `sandbox_test` — converts exactly two of them, `missing-compose` and `missing-front-matter`, into recorded failed evidence without invoking Docker or any backend: a `bootstrap`-marked failing record (`passed: false`, `exitCode: 1`) against the current HEAD sha, with output naming the missing initial contract as the failure and the implementation commit (`compose.yml` + `AGENTS.md` test front matter) as the remedy. The supported onboarding sequence is: test-only commit → bootstrap RED → implementation commit adding the contract → real GREEN → `redgreen_check`.

The fail-closed boundary: a DECLARED-but-empty or malformed contract is never bootstrap-eligible — and a declaration the repo actually made wins over anything it forgot to add. A declared-but-empty contract (`declared-empty-contract`) is BLOCKED even when compose.yml is missing too. A front-matter block that is started but never closed is malformed, not absent (`malformed-front-matter`; `readFrontMatter` returns an empty string for both, so the assessment checks the raw file to tell them apart) — the repo attempted a contract, so that is a BLOCKED error, never convenient RED. Every other blocked reason (backend unavailable, sidecar failure, mountpoint preflight, compose build/warm-up failures) stays BLOCKED and records nothing, and a requested or derived service not declared in the contract is an unknown-service BLOCKED, not a test failure. `sandbox_up` and `sandbox_gate` keep failing closed for missing or empty contracts, and the gate refuses (`sandbox_gate REFUSED`) when the contract plans zero steps, so no missing, empty, malformed or effectively-empty contract — nor the parser's default fallback — can ever produce a vacuous pass.

A bootstrap record cannot substitute for GREEN: it is ordinary failing evidence, satisfying only a test-only commit's RED requirement; a GREEN requirement needs `passed: true`, which a bootstrap record never has. `redgreenCheck` and commit classification are unchanged — `AGENTS.md`, `compose.yml`, Dockerfiles, CI and app files remain code, and a code commit without a preceding failing test-only commit is still a violation.

## Alternatives considered

- **Record the BLOCKED message as RED evidence:** rejected — a blocked condition is not a test failure, and it would make every infrastructure failure look like legitimate RED.
- **Treat a declared-but-empty contract as bootstrap-eligible too:** rejected — the repo attempted a contract; empty or malformed must fail closed rather than become convenient RED (the runtime-failure loophole this ADR closes).
- **Let the gate pass on zero steps (status quo):** rejected — a vacuous "sandbox_gate PASSED" with an empty report certifies nothing.
- **Give `sandbox_up`/`sandbox_gate` the same conversion:** rejected — only the tool whose job is recording evidence may convert, and only for the missing-initial-contract case.

## Consequences

A first-time repo can be onboarded through the same RED/GREEN discipline without a special-cased flow, and nothing is repo-specific. Evidence records gain an optional `bootstrap: true` marker so a bootstrap RED is distinguishable in the evidence store. The narrowness is regression-tested: `isBootstrapReason` is true only for the two eligible reasons, a bootstrap record satisfies a RED requirement but never a GREEN one, and the gate refuses zero steps.
