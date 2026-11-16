---
apps:
  app:
    {
      kind: fullstack,
      stack: nextjs,
      skills: [frontend-ui-engineering, browser-testing-with-devtools],
    }
test:
  compose: compose.yml # always this file
  profiles: { test: test, full: full }
  commands: # what oc-sandbox runs; an optional justfile wraps the same commands
    test: "docker compose -f compose.yml --profile test run --rm {service} {args}"
    full: "docker compose -f compose.yml --profile full up -d --wait"
  services: { all: "test", app: "app-test", e2e: "e2e", smoke: "smoke" }
test_globs: ["tests/**", "e2e/**", "src/**/*.test.*"]
---

<!-- Skeleton written by repo-setup (blueprint §9.3). The front matter above is
     a single full-stack Next.js example, not a required stack or layout. Replace
     apps:, test: and test_globs: with this repo's real facts and keep the shape:
     oc-sandbox, oc-skills and redgreen_check read them. apps: declares logical
     components; it does not require an apps/ directory. Declare several entries
     for a multi-app repo. Add contract: with generated paths and a generator
     service only when generated artifacts actually exist. This file holds facts
     about this repo only; no issue templates, PR template or labels live here
     (D33). Remove every TODO marker once filled in. -->

# AGENTS.md — TODO(repo): <repo name>

Instructions for this repo's agents. The front matter is the machine-readable
contract (components, any generated paths, test commands, test globs); this body is the
context they work in.

## Components

<!-- TODO(repo): one short section per logical component from the front matter
     apps: keys — what it does, its stack, where its code and tests live, and
     anything an agent must know before changing it. A single root-level app
     needs only one section. Mention generated files and their edit restrictions
     only if this repo has them. -->

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
