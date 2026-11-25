---
name: repo-setup
description: Scaffolds or upgrades a single-app or multi-app repo using the Project Template guidance, isolated Compose test contract, AGENTS.md front matter and a starting CI workflow. Shows every change first and applies nothing without approval.
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
  `_test` database when a database exists, applicable generation and browser
  E2E services, and a runtime smoke check — nothing from the host, no published
  ports, dummy env committed.

## What it writes (after approval)

- The `AGENTS.md` front matter from blueprint §9.3: `apps:` as logical
  components (kind, stack, skills), optional `contract:` for real generated
  artifacts, `test:` (compose, profiles, commands, services) and `test_globs`.
  Repo-specific facts only — **no flow reference material**
  (D33): no issue templates, no PR template, no `labels.json`, no copies of
  flow skills.
- A starting `.github/workflows/ci.yml` running the same isolated Compose test
  path with a final `ci-ok` aggregate job. The repo owns it from then on.
- On an existing repo: propose removing the old `.github/ISSUE_TEMPLATE/*`,
  `pull_request_template.md` and `labels.yml` — delete only after approval;
  keep `ci.yml`, `deploy.yml` and `dependabot.yml`.
- Branch protection on `main` via `gh api`: require `ci-ok`, 1 approving
  review, resolved conversations, no force push.

`templates/repo/` holds the starting `AGENTS.md` skeleton and `ci.yml`.
