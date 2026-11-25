# 0015 — Plan project health: a read-only Define-phase check

Status: accepted (2026-11-25)

## Context

The delivery flow assumes each app repo carries accurate `AGENTS.md` front matter: logical components, scoped skills, a usable Compose test contract, `test_globs`, and — after ADR 0014 — `test.checks` static-check declarations. Nothing guaranteed that those instructions still matched the repo when a new spec started. A repo could drift silently: components renamed, tests moved, lint/typecheck commands changed, or `AGENTS.md` never upgraded at all.

Plan is the natural place to catch that drift, but Plan must not become an editor of app repos. Its approval gates and slice flow exist precisely so changes to an app repo are proposed, reviewed, and merged deliberately.

## Decision

Every new Define/spec phase begins with a quick, read-only **project health check**:

1. Confirm the app repo has a closed `AGENTS.md` front-matter block whose `apps:` entries match the repo's real components and scoped skills.
2. Confirm the test contract is usable: one root `compose.yml`, `test`/`full` profiles, declared commands and services, and `test_globs` matching the repo's test paths.
3. Confirm `test.checks` declares the repo's real lint/typecheck services, derived from the repo's actual tooling and Compose services. Never invent a check the stack does not have.
4. Record any missing or stale instruction as an explicit remediation item in the spec.

The check never edits the app repo. Remediation follows the normal spec → approval → slice flow, or `repo-setup` when Robin explicitly asks for a repo upgrade. `repo-setup` exposes the same read-only audit as its first step, so the check has one owner and one interpretation.

## Alternatives considered

- **No check; trust `AGENTS.md` indefinitely:** rejected — front matter drifts as the repo changes, and the Build gate then enforces the wrong or incomplete contract.
- **Let Plan fix `AGENTS.md` directly during Define:** rejected — Plan would bypass the approval gates and blur the Plan/Build boundary.
- **Make the check a full architecture review:** rejected — Define needs a quick health signal, not a second planning workflow.
- **Put the check only in `repo-setup`:** rejected — `repo-setup` runs on explicit upgrade requests, while the gap appears whenever a new spec starts.

## Consequences

- Missing or stale instructions surface before a spec is drafted, not after Build fails or CI reports a lint/typecheck error.
- The check is deterministic enough to stay quick: front matter, Compose contract, and declared checks, not a subjective audit.
- App repos are never edited from Plan; every fix is approved work.
- `repo-setup` and `oc-plan-gateway` share the same checklist, so the health signal means the same thing everywhere.
