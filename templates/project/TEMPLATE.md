# Project Template — Standard Architecture

This document defines the standard repository architecture for all projects. It is
distilled from the Rekalled codebase, which is the reference implementation. When
starting or upgrading a project, copy this structure and the invariants below; swap
the internals (languages, frameworks) per project, keep the zones, verbs, and
contracts identical.

## 1. Repository layout

```
<project>/
├── apps/                    # Deployable applications (each has its own Dockerfile)
│   ├── api/                 # Backend (reference: FastAPI + uv)
│   │   ├── app/             # Layered source: api/ → schemas/ → services/ → models
│   │   │   └── <domain>/    # Domain modules (auth/, study/, ...) owning their logic
│   │   ├── migrations/      # DB migrations (reference: Alembic)
│   │   ├── tests/           # Unit + integration tests
│   │   ├── docker/          # Entrypoint scripts and image support files
│   │   ├── scripts/         # App-local tooling (e.g. OpenAPI export)
│   │   └── .agents/skills/  # Agent context scoped to this app
│   └── web/                 # Frontend (reference: TanStack Start + pnpm)
│       ├── src/             # features/ components/ routes/ auth/ server/ lib/
│       ├── e2e/             # Browser tests (reference: Playwright)
│       └── docker/
├── packages/                # Shared or generated code — never hand-edited if generated
│   └── api-client/          # Typed client GENERATED from the backend's OpenAPI schema
├── infra/                   # Environment bootstrap (db init SQL, cloud config)
├── scripts/                 # Cross-app orchestration: dev.sh, env pull, ci/, deploy/
├── docs/                    # spec/ (product), decisions/ (ADRs), deployment/
├── .github/                 # Workflows (ci, deploy, promote, release) + dependabot + zizmor
├── justfile                 # THE task interface — uniform verbs across all projects
├── docker-compose.yml       # Dev dependencies + optional full-stack profile
└── CONTRIBUTING.md, README.md
```

## 2. Core invariants (non-negotiable)

1. **One task interface.** `justfile` at the root wraps everything. Nobody needs to
   know whether a step is pnpm, uv, docker, or bash. `just start` is the idempotent
   "fresh machine → running app" path. The verb set is standard across all projects:
   `start`, `dev`, `install`, `db`, `api`, `web`, `migrate`, `revision`, `test`,
   `test-docker`, `lint`, `gen-client`, `images`, `smoke`, `full`, `e2e`,
   `env-files`, `import-env`.

2. **Contract-first API boundary.** The backend exposes an OpenAPI schema; the typed
   frontend client is generated from it (`just gen-client`) and committed. The
   frontend never hand-writes API types. CI regenerates and diffs to fail on drift.

3. **Layered backend, feature-based frontend.** Backend: routes → schemas → services
   → models, with domain modules owning business logic. Frontend: `features/` own UI
   and state; `routes/` stays thin.

4. **Per-ecosystem lockfiles, one repo.** Each app owns its lockfile and Dockerfile.
   CI builds the same images you can build locally (`just images`) and smoke-tests
   them (`just smoke`) — no "works in CI but not locally".

5. **Docs as architecture.** Product spec, ADRs, and deployment/rollback docs live in
   `docs/` next to the code. Every significant decision gets an ADR.

6. **Security wired in early.** Secrets manager for real secrets (bootstrap `.env`
   vs secrets in `.env.local`), gitleaks, zizmor on workflows, dependabot, no
   default credentials in committed files (CI enforces this), pinned action SHAs.

## 3. Environment and secrets

- `.env` — non-secret bootstrap config, committed via `.env.example`.
- `.env.local` — real secrets, pulled from the secrets manager (`just import-env`),
  never committed.
- `just env-files` makes worktrees and fresh clones work without manual copying.

## 4. Testing strategy — what runs where

The rule: **every test suite must run in two places.** On the host, where it is the
fast inner loop (watch mode, debugger, instant re-runs). And inside Docker, where
the project becomes a standalone package — the only prerequisite is Docker, no
language toolchain on the machine. Both paths run the same suites against the same
kind of throwaway database; only the packaging differs.

| Tier               | Host (inner loop)                                     | Docker (standalone)                                           | What it proves                                         |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| Unit + integration | `just test` against `just db`                         | `just test-docker` — test-target images + throwaway `db-test` | The code, with real migrations                         |
| E2E                | `just e2e` (Playwright starts dev servers)            | — (needs real browsers; CI covers it)                         | Real browser flows                                     |
| Smoke              | `just smoke` — the _production_ images + throwaway DB | same (it already is Docker)                                   | Migrations-on-start, health, auth enforced, image scan |
| Whole app          | —                                                     | `just full` — production images, full compose profile         | The images work together, end to end                   |

**Implementation notes:**

- Test containers are built from **test targets**, not the runtime images: runtime
  images exclude dev dependencies and tests by design (`UV_NO_DEV=1`, ship only the
  built output). The test target is the dev environment plus source, never shipped.
- Tests refuse to run against a database whose name doesn't end in `_test`, so host
  and container runs can never touch real data.
- The host path stays the default for the inner loop: building an image per test
  run is slower than re-running pytest locally. The Docker path is for hermetic,
  zero-toolchain execution — fresh machines, other processes, paranoid reproducibility.

### Docker Compose's job

1. **Dev profile (default):** containerized _dependencies only_ — the database.
   Apps run natively (`just dev`) for reload speed and debugger access.
2. **Full profile (`just full`):** the entire application from production-built
   images — throwaway db + api + web, migrations on start, waits for health. Used
   for production-parity runs, demos, and verifying the images work together
   locally. Auth stays in local dev mode (no auth tenant to point at); the
   production-env path is covered by the smoke tier. `just full-reset` discards
   the throwaway database without touching dev data.
3. **Test profile (`just test-docker`):** the test suites in containers, as above.

Every project must have both profiles: the first for daily development, the second
so anyone can run the complete built application with one command.

## 5. CI/CD pipeline

Workflows in `.github/workflows/`, all on pinned SHAs:

- **ci** — required gate on every PR, reused by release: repo lint (actionlint,
  zizmor, gitleaks, hadolint, shellcheck, line endings), per-app lint + typecheck +
  tests, migration drift check (`alembic check`), generated-client staleness diff,
  dependency audits, E2E, image build + smoke + Grype scan. A final `ci-ok` job
  aggregates all jobs so required checks never need editing when jobs are added.
- **deploy** — image deploy from CI artifacts.
- **promote / release** — promotion and tagging; see `docs/deployment/TAGS.md`.

## 6. New project checklist

- [ ] Monorepo skeleton: `apps/`, `packages/`, `infra/`, `scripts/`, `docs/`, `.github/`
- [ ] `justfile` with the standard verb set; `just start` works from a fresh clone
- [ ] Each app: own lockfile, own Dockerfile, layered source layout
- [ ] OpenAPI schema export + generated client package + drift check in CI
- [ ] `docker-compose.yml` with dev profile (dependencies) and full profile (whole app)
- [ ] Secrets manager wiring; `.env` / `.env.local` split; no committed credentials
- [ ] Three-tier testing: host tests, E2E, image smoke + scan — plus the standalone
      Docker test path (`just test-docker`) so only Docker is needed to verify a clone
- [ ] CI with `ci-ok` aggregation job; deploy/promote/release workflows
- [ ] `docs/spec/`, `docs/decisions/`, `docs/deployment/` created; first ADR written
- [ ] Per-app `.agents/skills/` for agent-scoped context
