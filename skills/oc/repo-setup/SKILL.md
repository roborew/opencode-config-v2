---
name: repo-setup
description: Scaffolds or upgrades a single-app or multi-app repo using the Project Template guidance, isolated Compose test contract, AGENTS.md front matter and a starting CI workflow. Runs the same read-only project health check Plan uses at Define, shows every change first, and applies nothing without approval.
---

# repo-setup — bring an app repo into the flow

Point this at an app repo (new, or an existing project of any stack). It
proposes changes and applies them **only after each one is approved**. Start
from the repository's real components and preserve its idiomatic structure. The
Project Template guides boundaries and conventions; it never requires a
monorepo, `apps/`, `packages/`, or an API client (D28, D29).

## What it compares against

- The single-app and multi-app architecture guidance in
  `templates/project/TEMPLATE.md`: framework-native source layout, explicit
  component deployment boundaries, shared or generated packages only when
  needed, `docs/spec|decisions|deployment`, and `.github/`.
- The actual repo's manifests, framework entry points, existing tests and
  `AGENTS.md`. Identify whether it is a full-stack app, a single-tier project,
  or multiple deployables before proposing directories or stack-specific files.
- The isolated Compose test contract (blueprint §9.2): exactly one root
  `compose.yml` with dev/test/full profiles, test-target images, a throwaway
  `_test` database when a database exists, applicable static-check services for
  the repo’s real lint/typecheck tooling, applicable generation and browser
  E2E services, and a runtime smoke check — nothing from the host, no published
  ports, dummy env committed.

## Project health check (read-only)

Before any proposal or write, run the quick read-only check the Plan gateway
also uses at the start of Define:

1. Parse the repo's `AGENTS.md` front matter and compare its `apps:` entries
   with the repo's real components and scoped skills.
2. Validate the test contract: one root `compose.yml`, `test`/`full` profiles,
   declared commands and services, and `test_globs` matching the repo's test
   paths.
3. Validate `test.checks`: the repo's real lint/typecheck tooling must be
   declared and backed by Compose services. Never invent a check the stack
   does not have.
4. Report each missing or stale instruction with its file path. Do not edit
   anything during the check; remediation is a separate, approved action.

## What it writes (after approval)

- The `AGENTS.md` front matter from blueprint §9.3: `apps:` as logical
  components (kind, stack, skills), optional `contract:` for real generated
  artifacts, `test:` (compose, profiles, commands, services, checks) and
  `test_globs`. `checks:` declares the repo’s real lint/typecheck services,
  built from the same Compose test contract; omit checks the stack does not
  have. Repo-specific facts only — **no flow reference material**
  (D33): no issue templates, no PR template, no `labels.json`, no copies of
  flow skills.
- A starting `.github/workflows/ci.yml` running the same isolated Compose
  static-check and test path with a final `ci-ok` aggregate job. The repo owns
  it from then on.
- On an existing repo: propose removing the old `.github/ISSUE_TEMPLATE/*`,
  `pull_request_template.md` and `labels.yml` — delete only after approval;
  keep `ci.yml`, `deploy.yml` and `dependabot.yml`.
- Branch protection on `main` via `gh api`: require `ci-ok`, 1 approving
  review, resolved conversations, no force push.

`templates/repo/` holds the starting `AGENTS.md` skeleton and `ci.yml`.
