---
name: repo-setup
description: Scaffolds or upgrades an app repo to the Project Template layout with the isolated Compose test contract, AGENTS.md front matter and a starting CI workflow. Shows every change first and applies nothing without approval.
---

# repo-setup — bring an app repo into the flow

Point this at an app repo (new, or an existing project such as a Rails or
FastAPI app). It proposes changes and applies them **only after Robin approves
each one**. Internals are chosen per stack; the zones and contracts stay the
same (D28, D29).

## What it compares against

- The monorepo layout and architecture in `templates/project/TEMPLATE.md`:
  `apps/` (each with its own Dockerfile and lockfile), `packages/` (generated
  `api-client`), `infra/`, `scripts/`, `docs/spec|decisions|deployment`,
  `.github/`.
- The isolated Compose test contract (blueprint §9.2): exactly one root
  `compose.yml` with dev/test/full profiles, test-target images, a throwaway
  `_test` database, the client generator, an `e2e` service on the official
  Playwright image, and a smoke check — nothing from the host, no published
  ports, dummy env committed.

## What it writes (after approval)

- The `AGENTS.md` front matter from blueprint §9.3: `apps:` (kind, stack,
  skills), `contract:`, `test:` (compose, profiles, commands, services) and
  `test_globs`. Repo-specific facts only — **no flow reference material**
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
