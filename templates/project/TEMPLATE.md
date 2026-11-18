# Project Template — Architecture Guidance

This document helps agents recognise and choose a sound repository architecture.
It is **guidance, not a required directory skeleton**. The examples are distilled
from Rekalled, but its FastAPI + TanStack Start monorepo is only one valid shape.

Each project lives in **one Git repository** and uses trunk-based development.
That repository may contain one application or several independently deployable
applications. Choose the simplest structure that matches the actual boundaries;
do not create empty `apps/`, `packages/`, or other directories "just in case".
For an existing repository, inspect its manifests, workspace configuration,
framework entry points, tests, and `AGENTS.md` before proposing restructuring.

## 1. Choose a layout that matches the project

| Project shape                                            | Appropriate layout                                                                                               | Do not assume                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Single full-stack app, such as Next.js or TanStack Start | Framework-native source and routes at the repository root, with tests, docs, and deployment files alongside them | A nested `apps/` directory, a separate API, `packages/`, or a generated client   |
| Single frontend, backend, library, CLI, or service       | The language or framework's idiomatic root-level layout                                                          | Another application tier, browser tests, or a database                           |
| Multi-app JavaScript/TypeScript monorepo                 | `apps/` for deployables and `packages/` for code that is genuinely shared, using the repo's workspace tooling    | Vite in every app, or shared packages when a small local module would be clearer |
| Separate frontend and backend, such as React + FastAPI   | `apps/web` and `apps/api` (or similarly clear names), plus shared packages only when needed                      | A particular backend language, frontend build tool, or API style                 |
| Any other multi-component system                         | Boundaries based on deployment, ownership, and reuse                                                             | That every component needs the same stack, depth, or directory conventions       |

A nested `apps/` directory is useful when it clarifies real application
boundaries, not because a project uses Git or has multiple source folders. A
full-stack Next.js or TanStack Start app is one application even though it has
both client and server code.

### Example A — single full-stack app

Use the framework's normal conventions rather than copying these names exactly:

```text
<project>/
├── src/                     # Routes, features, components, and server code
├── tests/                   # Unit/integration tests, if not colocated
├── e2e/                     # Browser tests, when the product has a browser UI
├── docs/                    # spec/, decisions/, deployment/
├── .agents/skills/          # Repo-wide agent context, when needed
├── .github/                 # This project's workflows and GitHub config
├── Dockerfile               # Runtime and test targets for this application
├── compose.yml              # Isolated development/test contract
└── README.md, package.json, lockfile
```

There is no generated API client merely because server and browser code exist.
Direct server calls, server functions, route handlers, RPC, or another mechanism
may be the right internal boundary. Add an explicit generated contract when it
solves a real integration or sharing problem.

### Example B — separate API and web applications

```text
<project>/
├── apps/
│   ├── api/                 # Example: FastAPI + uv; any backend is valid
│   │   ├── app/             # Domain and interface code, idiomatic to the stack
│   │   ├── migrations/      # Only when this app owns a database schema
│   │   ├── tests/
│   │   ├── .agents/skills/  # Context specific to this component
│   │   ├── Dockerfile
│   │   └── lockfile
│   └── web/                 # Example: React, with the build tool it actually uses
│       ├── src/             # Features, routes, components, and client code
│       ├── e2e/
│       ├── Dockerfile
│       └── lockfile
├── packages/                # Only code that is actually shared or generated
│   └── api-client/          # Example: generated from the API's schema
├── infra/                   # Environment bootstrap and cloud config, if needed
├── scripts/                 # Cross-component orchestration, if needed
├── docs/                    # spec/, decisions/, deployment/
├── .github/
├── compose.yml
└── CONTRIBUTING.md, README.md
```

This layout also works with different internals: Rails instead of FastAPI,
another frontend instead of React, or no generated client when a different API
contract is more appropriate. Do not copy unused FastAPI, Alembic, OpenAPI,
Playwright, Vite, pnpm, or uv conventions into a project that does not use them.

## 2. Cross-project defaults and conditional choices

These principles apply across repository shapes. The implementation remains
specific to the project.

1. **Make work discoverable.** Document the real install, development, test,
   lint, build, and generation commands. Keep one obvious task interface where
   that reduces complexity. A root `justfile` may provide consistent shortcuts,
   but it is optional and must not hide or replace the repo's declared commands.

2. **Make boundaries explicit.** When a separately maintained frontend consumes
   a backend API, define that contract deliberately. OpenAPI plus a committed,
   generated typed client is one good approach; CI should detect drift. If no
   such boundary exists, no schema export, generator service, or
   `packages/api-client` is required.

3. **Organise around domains and framework conventions.** A layered backend and
   feature-based frontend are useful patterns, not mandatory taxonomies. Keep
   business rules out of thin transport/UI layers and use the nesting and module
   boundaries appropriate to the language and framework.

4. **Match ownership to deployment.** Each independently built application owns
   its dependency lockfile and runtime image. In a single-app repository these
   normally live at the root. Do not split a lockfile or Dockerfile merely to
   imitate a multi-app layout.

5. **Keep docs next to the code.** Product specs live in `docs/spec/`, significant
   decisions in `docs/decisions/`, and deployment/rollback guidance in
   `docs/deployment/`.

6. **Wire security in early.** Ignore real secrets, provide safe example env
   files, scan for leaked credentials and workflow issues, pin GitHub Actions to
   commit SHAs, and avoid default credentials. Add dependency and image scanning
   where those artifacts exist.

7. **Record repo facts, not imagined ones.** Map logical components, stacks,
   commands, generated paths, and test paths in `AGENTS.md`. These names do not
   have to correspond to an `apps/` directory.

## 3. Environment and secrets

- Provide a committed `.env.example` containing non-secret bootstrap values or
  clearly marked dummies.
- Keep real secrets in an ignored local file or the project's secrets manager;
  never commit or print them.
- Make fresh clones and worktrees usable without manually copying undocumented
  files. The exact helper and env filenames should follow the project's stack.

## 4. Testing strategy — use the tiers that apply

Every project needs fast, deterministic verification appropriate to its risks.
Not every project has a browser, database, generated client, or several runtime
images, so do not invent tests or services for absent tiers.

| Tier                      | Applies when                             | What it proves                                             |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Unit + integration        | Always, at the appropriate levels        | Code behaviour, including real infrastructure where useful |
| Contract/generation drift | A generated or published contract exists | Checked-in artifacts match their source                    |
| E2E/browser               | A browser user flow exists               | Critical flows work in a real browser                      |
| Runtime smoke             | A deployable runtime artifact exists     | Startup, health, migrations if present, and enforced auth  |
| Whole-system              | Multiple runtime components exist        | The built components work together                         |

Host-native tests can be a fast human inner loop. The isolated Docker path must
run the same applicable suites without a host language toolchain or real secrets.
Build test containers from test targets rather than shipping development tools
and tests in runtime images. When a database is used, tests must target a
throwaway database and refuse names that do not end in `_test`.

The detailed agent test contract is defined by the delivery flow, not by this
architecture guide. Compose profiles and services describe the components the
repository actually has.

## 5. CI/CD pipeline

Use `.github/workflows/` with actions pinned to commit SHAs. A typical PR gate
checks formatting/linting, types, applicable tests, generated drift, dependency
and workflow security, runtime image build/smoke, and browser E2E where relevant.
Remove or replace checks whose subject does not exist — for example Alembic drift
in a non-Python project or client generation in a self-contained full-stack app.

A final `ci-ok` job can aggregate required checks so branch protection remains
stable as jobs change. Build, deployment, promotion, and release workflows match
the repository's actual deployables; a single-app repo does not need a matrix of
imaginary services.

## 6. New or existing project checklist

- [ ] One Git repository, with the simplest single-app or multi-app layout that
      fits the actual boundaries
- [ ] Existing framework-native structure preserved unless a change is justified
- [ ] No empty `apps/` or `packages/` zones and no unused stack conventions
- [ ] Real commands documented; optional `justfile` shortcuts agree with them
- [ ] Each actual deployable has an appropriate lockfile, Dockerfile, and smoke path
- [ ] API schema export, generated client, and drift checks **if that contract exists**
- [ ] `compose.yml` models the actual system and its applicable isolated tests
- [ ] Safe env examples and secrets handling; no committed credentials
- [ ] Unit/integration tests plus only the applicable contract, E2E, and smoke tiers
- [ ] CI and deployment jobs match the real components; `ci-ok` aggregates them
- [ ] `docs/spec/`, `docs/decisions/`, and `docs/deployment/` established as needed
- [ ] Repo-wide or component-scoped `.agents/skills/` placed where they apply
