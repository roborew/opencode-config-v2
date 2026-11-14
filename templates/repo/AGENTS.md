---
apps:
  api: { kind: backend, stack: fastapi, skills: [api-and-interface-design] }
  web: { kind: frontend, stack: tanstack-start, skills: [frontend-ui-engineering, browser-testing-with-devtools] }
contract: { generated: ["packages/api-client/**"], generator_service: "api-client-gen" }
test:
  compose: compose.yml # always this file
  profiles: { test: test, full: full }
  commands: # what oc-sandbox runs; an optional justfile wraps the same commands
    test: "docker compose -f compose.yml --profile test run --rm {service} {args}"
    full: "docker compose -f compose.yml --profile full up -d --wait"
  services: { all: "test", api: "api-test", web: "web-test", e2e: "e2e", smoke: "smoke" }
test_globs: ["apps/*/tests/**", "apps/web/e2e/**", "apps/*/**/*.test.*", "apps/*/**/*_spec.rb"]
---

<!-- Skeleton written by repo-setup (blueprint §9.3). The front matter above is
     the api/web example — replace apps:, contract:, test: and test_globs: with
     this repo's real facts and keep the shape: oc-sandbox, oc-skills and
     redgreen_check read them. This file holds facts about this repo only; no
     issue templates, PR template or labels live here (D33). Remove every TODO
     marker once filled in. -->

# AGENTS.md — TODO(repo): <repo name>

Instructions for this repo's agents. The front matter is the machine-readable
contract (apps, generated client, test commands, test globs); this body is the
context they work in.

## Apps

<!-- TODO(repo): one short section per app from the front matter apps: keys —
     what it does, its stack, where its code and tests live, and anything an
     agent must know before changing it (for example: the client in
     packages/api-client is generated and never hand-edited). -->

## Flag convention

<!-- TODO(repo): this repo's flag convention — flag naming, where flags are
     defined, their default state, and that incomplete behaviour stays behind
     a flag until its flag-removal slice lands. -->

## Docs

- Product specs live in `docs/spec/` — the source of truth for what is being
  built.
- Decisions live in `docs/decisions/` — record every non-trivial decision as an
  ADR.
- Deployment docs live in `docs/deployment/`.
