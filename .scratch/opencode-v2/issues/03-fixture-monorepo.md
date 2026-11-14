# 03 — Fixture monorepo in the template layout, with the isolated Compose test contract

**What to build:** `tests/fixture-monorepo`: the smallest repo in the Project Template's layout and architecture. It has `apps/api` (FastAPI, layered, migrations, tests), `apps/web` (TanStack Start, features/, Playwright E2E), `packages/api-client` generated from OpenAPI, `infra/`, `scripts/`, `docs/spec|decisions|deployment`, and a Dockerfile per app that builds the production image plus a test stage. It also has a single root `compose.yml` with the template's dev, test and full profiles (test-target images, throwaway `db-test`, generator, smoke, Playwright `e2e` service) and the `AGENTS.md` front matter from blueprint §9.3.

**Blocked by:** 00

**Status:** ready-for-agent

- [ ] The full test run passes with nothing installed on the machine except Docker
- [ ] It needs no host env file: dummy test env is committed and dependencies are throwaway containers
- [ ] Two runs with different project names work side by side, with no published host ports
- [ ] A focused run of one test file works through the API and web test services
- [ ] Client regeneration through the generator service produces no drift
- [ ] Tests refuse a database whose name doesn't end in `_test`
- [ ] The `e2e` service runs Playwright in Docker against the full-profile images
- [ ] The optional `justfile` wraps the same Compose commands, and CI checks they match
- [ ] There is no other Compose or override file, and nothing production-related depends on `compose.yml`
- [ ] Production images build separately per app, and the smoke check runs against them
- [ ] The PR workflow on a throwaway GitHub copy runs the same contract, with `ci-ok` aggregating
