# Implementation Plan: code-index

Status: planning only, awaiting Robin's approval. Spec: `spec-code-index.md` (approved 2026-11-27).

## Overview

Replace the dead Milvus / `claude-context` stack in `opencode-server` with a
`code-index` sidecar that runs `codebase-memory-mcp` (graph and local semantic
search), wired into the server's OpenCode as a remote MCP. Then teach agents to use
it when it is present, without breaking the Mac-only config.

Task list target: this document's ordered local checklist. No GitHub issues are
opened until Robin approves this breakdown. Each task is one focused session.
Tasks 2–4 and 5–8 each land as one `opencode-server` PR. Task 9 lands as one
`opencode-config-v2` PR together with this plan, the spec and the spike ADR.

## Architecture Decisions

1. **Spike first, but removal does not wait for it.** Milvus removal (Tasks 2–4) is
   independent of the chosen indexer and can run in parallel with the spike.
2. **Sidecar plus a pinned stdio → Streamable HTTP bridge.** The bridge is chosen by
   the spike. The in-image `type: local` setup is the documented fallback (spec,
   Design).
3. **The MCP entry lives only in the server override.** The config repo never
   declares `code-index`, so the Mac stays clean (spec, Decision 2).
4. **Index on request, then maintained.** `auto_index` stays off unless the spike's
   first-index time exceeds 60 s (spec, SC 5a).
5. **Worktrees indexed separately, with pruning.** Upstream pruning is used if it
   exists; otherwise a small prune loop runs in the sidecar.
6. **Semantic search on by default**, behind the `CODE_INDEX_SEMANTIC` knob.

## Task List

### Phase 1: Spike (de-risk)

- [x] **Task 1: Spike codebase-memory-mcp in a throwaway container** — done, see ADR 0017 (go: sidecar + mcp-proxy 0.15.0)
  - **Description:** Build a scratch image with the pinned `codebase-memory-mcp`
    (≥ v0.12.1, linux/arm64 and amd64, checksum-verified) and two bridge candidates
    (`supergateway`, `sparfenyuk/mcp-proxy`). Run it against one real app repo and one
    slice worktree, bind-mounted read-only at the same path. Record the results as an
    ADR.
  - **Acceptance:**
    - The ADR records:
      - the chosen bridge, and that it keeps a single stateful child;
      - the transport and flag names at the pinned version;
      - first-index time, RAM and disk with semantic on and off;
      - semantic top-5 hits on 5 queries;
      - whether the watcher sees Mac-host edits through the bind mount;
      - whether the binary ever writes into the repo (it must not; a read-only mount
        proves it);
      - whether removed worktrees are pruned upstream.
    - It ends with a go/no-go on the sidecar versus the in-image fallback.
  - **Verification:** Robin reviews the ADR. No repo code changes except the ADR.
  - **Dependencies:** None.
  - **Files likely touched:** `docs/adr/0017-code-index-spike.md` (config repo).
    Scratch Dockerfile in the scratchpad only.
  - **Estimated scope:** S (1 file, plus experiments).

### Checkpoint: Spike go/no-go
- [x] Robin accepts the ADR (2026-11-27). Tasks 5–8 are adjusted if the spike changes the design.

### Phase 2: Remove Milvus + claude-context (`opencode-server`, PR A) — can run alongside Task 1

- [x] **Task 2: Remove the Milvus services and env wiring** — done (uncommitted in opencode-server worktree)
  - **Description:** Delete `etcd`, `minio` and `milvus-standalone`, the
    `depends_on: milvus-standalone` on `opencode`, `MILVUS_*` / `EMBEDDING_PROVIDER` /
    `OPENAI_API_KEY` from the `opencode` environment, `MILVUS_ADDRESS` from the
    entrypoint, and the `claude-context` block from the override.
  - **Acceptance:**
    - `docker compose config` has no `milvus|etcd|minio|claude-context|EMBEDDING_PROVIDER`.
    - `.env.example` has no Milvus/Minio ports, no `COMPOSE_PROFILES=milvus`, and no
      `DOCKER_VOLUME_DIRECTORY`.
    - The stack starts with `opencode` and `twingate-connector` healthy.
  - **Verification:** `./tests/image-preflight.sh`;
    `./scripts/compose.sh up -d --build` and both services report healthy.
  - **Dependencies:** None.
  - **Files likely touched:** `docker-compose.yml`, `.env.example`,
    `docker/entrypoint.sh`, `overrides/opencode.server.json`,
    `tests/fixtures/preflight-compose/*`.
  - **Estimated scope:** M (5 files).

- [x] **Task 3: Remove the Milvus and claude-context checks from scripts and tests** — done (uncommitted; adds a retirement guard to `tests/image-preflight.sh`)
  - **Description:** Drop `check_milvus` and `check_claude_context` from preflight,
    the `claude-context` sections of `doctor-perf.sh`, and any test assertions that
    expect them.
  - **Acceptance:**
    - Preflight runs clean with no Milvus or claude-context records.
    - `doctor-perf.sh` runs without referring to either.
  - **Verification:** `./tests/setup-regression.sh`;
    `./tests/container-preflight-assertions.sh`; `./scripts/doctor-perf.sh`.
  - **Dependencies:** Task 2.
  - **Files likely touched:** `scripts/lib/preflight.sh`, `scripts/doctor-perf.sh`,
    `tests/setup-regression.sh`, `tests/container-preflight-assertions.sh`.
  - **Estimated scope:** M (4 files).

- [x] **Task 4: Remove Milvus and claude-context from the docs** — done (uncommitted)
  - **Description:** Rewrite the title and stack table, remove the Milvus run and
    health sections, and replace the indexing sections with a short "code-index:
    coming" pointer to the spec.
  - **Acceptance:** `grep -ri 'milvus\|claude-context'` in `opencode-server` returns
    nothing, apart from one changelog line in `docs/opencode-server-audit.md`
    recording the removal.
  - **Verification:** the grep above, and markdown links still resolve.
  - **Dependencies:** Task 2.
  - **Files likely touched:** `README.md`, `AGENTS.md`, `docs/README.md`,
    `docs/integrations.md`, `docs/environment.md`, `docs/access.md`,
    `docs/troubleshooting.md`, `docs/setup.md`, `docs/opencode-server-audit.md`.
  - **Estimated scope:** M by effort (docs-only, mechanical deletions across 9 files).
    Split at `docs/` if it runs long.

### Checkpoint: Milvus gone (PR A)
- [ ] All server tests pass, and the stack runs lighter (record RAM before and after).
- [ ] Robin reviews and merges PR A. Robin deletes the host `../milvus` data
      directory when ready.

### Phase 3: Add `code-index` (`opencode-server`, PR B) — after the spike checkpoint and PR A

- [x] **Task 5: Build the code-index image** — done (uncommitted). arm64 native and amd64 under emulation both pass. Notes: mcp-proxy's `/healthz` also requires the token (the healthcheck sends it) and returns 204; `ignore_worktrees` is not a real setting and `CBM_ALLOWED_ROOT` is left unset; the bridge is installed from a hash-locked `requirements.txt`
  - **Description:** Add `docker/code-index/Dockerfile`. It pins
    `codebase-memory-mcp` with a SHA-256 check, adds the chosen bridge (pinned), runs
    as a non-root user, and uses a small entrypoint that enforces the bearer token,
    sets `CBM_CACHE_DIR`, `CBM_ALLOWED_ROOT`, semantic mode and
    `ignore_worktrees=false`, and exposes `/mcp` and `/healthz`.
  - **Acceptance:**
    - The image builds for linux/arm64 and amd64.
    - A request without the token returns 401.
    - `tools/list` returns the expected tool names, including `search_code` and
      `search_graph`.
  - **Verification:** `./tests/image-preflight.sh` (new assertions for the pinned
    version, the checksum and the non-root user); a local curl against `/mcp`.
  - **Dependencies:** Task 1 checkpoint.
  - **Files likely touched:** `docker/code-index/Dockerfile`,
    `docker/code-index/entrypoint.sh`, `tests/image-preflight.sh`.
  - **Estimated scope:** M (3 files).

- [x] **Task 6: Wire code-index into Compose and the server's OpenCode** — done (uncommitted), except the real-stack `compose.sh up` (SC 2 and the SC 5 down/up check run on the server once PR B is up). Verified in isolation: OpenCode 2.3.0 lists `code-index` as `connected` with 17 tools, and as `failed: Unauthorized (HTTP 401)` with a wrong token; code-index has no internet route. `compose.sh` generates `CODE_INDEX_TOKEN` (setup.sh needs no change). OpenCode v2 connects MCPs lazily: `/api/mcp` is empty until a session exists for the directory, which Task 7's preflight check must allow for
  - **Description:** Add the `code-index` service. It has a `mem_limit`, a
    healthcheck, no published port, read-only same-path mounts of the apps and
    worktrees dirs, and the `code-index-cache` volume. Add the `code-index` remote MCP
    entry to the override. Add `CODE_INDEX_TOKEN`, `CODE_INDEX_MEMORY_LIMIT`,
    `CODE_INDEX_SEMANTIC` and `CBM_VERSION` to `.env.example`. Setup generates the
    token if it is missing (it is never printed).
  - **Acceptance:**
    - SC 2: three healthy services.
    - SC 3: a server session lists `code-index_*` tools and indexes a fixture repo
      with no API key.
    - SC 5: the index survives `down`/`up`.
  - **Verification:** `./scripts/compose.sh up -d --build`;
    `./tests/container-preflight-assertions.sh` (new: `opencode mcp list` shows
    `code-index` connected; indexing `tests/fixtures/code-index-repo` and running
    `search_graph` finds a known symbol).
  - **Dependencies:** Task 5.
  - **Files likely touched:** `docker-compose.yml`, `overrides/opencode.server.json`,
    `.env.example`, `scripts/setup.sh`, `tests/container-preflight-assertions.sh`.
  - **Estimated scope:** M (5 files, plus a tiny fixture repo).

- [x] **Task 7: Add code-index preflight and doctor checks** — done (uncommitted). `check_code_index` fails when the service is down or unhealthy, when `CODE_INDEX_TOKEN` is missing or short, when the two containers hold different tokens (compared in-process, never printed) and when the MCP reports `failed`. It allows for v2's lazy MCP start: if the root `/api/mcp` listing has no `code-index`, it asks again for a directory that already has a session, and warns (never fails) when no session exists yet. The generic `check_mcps` leaves code-index to it. `doctor-perf.sh` shows code-index memory against its limit and the cache size. 10 new regression tests (33/33). Not yet run against the real stack
  - **Description:** Add `check_code_index` to preflight: service healthy, token set,
    MCP connected. Report code-index RSS and cache size in `doctor-perf.sh`.
  - **Acceptance:**
    - Preflight fails clearly when the service is down or the token is missing.
    - Doctor shows memory and cache size.
  - **Verification:** `./tests/setup-regression.sh`, with a negative case (service
    stopped).
  - **Dependencies:** Task 6.
  - **Files likely touched:** `scripts/lib/preflight.sh`, `scripts/doctor-perf.sh`,
    `tests/setup-regression.sh`.
  - **Estimated scope:** S (3 files).

- [x] **Task 8: Keep the index fresh and prune removed worktrees** — done in roborew/opencode-server#11. `docker/code-index/refresh.py` runs beside mcp-proxy and talks to it over HTTP (one stdio child owns the store). Every `CODE_INDEX_REFRESH_SECONDS` (30) it re-indexes projects whose HEAD, porcelain status or dirty-file mtimes changed, and deletes projects whose root is gone while its parent still exists (a lost mount deletes nothing). Image test: an edit was searchable after about 3 s and a removed worktree pruned after about 3 s, at a 3 s interval
  - **Description:** Make sure the watcher picks up edits and commits in repos and
    slice worktrees. The spike showed upstream watches only the session's working-dir project and never
    prunes, so add a refresh-and-prune loop (git HEAD + porcelain digest → incremental
    `index_repository`; missing root → `delete_project`). `auto_index` stays off (first
    index was 4.6 s on 2.8k files).
  - **Acceptance:**
    - SC 4: a change is visible within 60 s.
    - SC 5c: a removed worktree's project disappears within one prune cycle.
  - **Verification:** container-preflight scenario: edit the fixture, query, remove
    the fixture worktree, then query `list_projects`.
  - **Dependencies:** Task 6.
  - **Files likely touched:** `docker/code-index/entrypoint.sh` (or `prune.sh`),
    `docker-compose.yml`, `tests/container-preflight-assertions.sh`.
  - **Estimated scope:** S–M (2–3 files).

### Checkpoint: code-index live (PR B)
- [ ] SC 2–5c pass on the real server, and all server tests pass.
- [ ] Robin reviews and merges PR B.

### Phase 4: Agent guidance and proof (`opencode-config-v2` PR, plus a docs follow-up in `opencode-server`)

- [x] **Task 9: Add conditional agent guidance in the config repo** — done. `AGENTS.md` "Code index (when available)"; `tests/code-index-guidance.test.ts` checks the rule, that it names no Matt skill, stays out of the lifecycle policy and `oc` skills, and that `opencode.jsonc` declares no `code-index`. Written before PR B merged, using the verified v0.12.1 tool names
  - **Description:** Add a short rule to `AGENTS.md` (global half): if `code-index_*`
    tools are present, call `index_status` / `index_repository` once per repo and
    prefer `search_graph`, `trace_path` and `search_code` for structural and "where
    is…" lookups, using `grep` for literal text. Without the tools, carry on as
    today. Add a config-verification test that the rule exists and that
    `opencode.jsonc` declares no `code-index` server.
  - **Acceptance:**
    - SC 5d: the Mac config has no code-index entry and starts clean.
    - `npm test` is green.
    - The rule names no Matt skill and touches no lifecycle policy.
  - **Verification:** `npm test`; `npm run typecheck`; start OpenCode locally on the
    Mac with no server and see no MCP errors.
  - **Dependencies:** PR B merged, so the tool names are final.
  - **Files likely touched:** `AGENTS.md`, `tests/<config-verification>.test.ts`.
  - **Estimated scope:** S (2 files).

- [ ] **Task 10: Document code-index and run the token benchmark** — docs done in roborew/opencode-server#11 (`docs/integrations.md`, README, `docs/code-index-benchmark.md` with the protocol). **The benchmark itself (SC 6, SC 5b) is still to run on the deployed server**
  - **Description:** Write the `opencode-server` docs section (what it is, knobs,
    troubleshooting, how to reset the cache). Run the five structural questions and
    five natural-language questions on one real app repo, once with code-index
    disabled and once enabled, and record tokens and tool calls.
  - **Acceptance:**
    - SC 6: ≥ 40% fewer tokens with no loss in quality, or the shortfall reported
      honestly with a recommendation.
    - SC 5b: semantic top-5 hits on ≥ 4 of 5 queries.
  - **Verification:** Robin reviews the benchmark table.
  - **Dependencies:** Task 9.
  - **Files likely touched:** `docs/integrations.md`, `README.md`,
    `docs/code-index-benchmark.md` (all in `opencode-server`).
  - **Estimated scope:** S (3 files).

### Checkpoint: Complete
- [ ] SC 1–7 met, both repos green, and the benchmark is recorded.

## Parallelization

- Task 1 runs in parallel with Tasks 2–4. They touch different repos and different
  files.
- Tasks 3 and 4 can run in parallel after Task 2.
- Tasks 7 and 8 can run in parallel after Task 6.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The stdio bridge is flaky, or opens one child per client and trips upstream's version lock | High | The spike tests both bridges under concurrent sessions; the in-image `type: local` fallback is ready |
| The watcher misses Mac-host edits through the Docker Desktop bind mount | High | The spike verifies this. Upstream polls git HEAD and dirty state rather than relying on inotify alone; a periodic re-index is the fallback |
| There is no linux/arm64 release binary | Med | The spike checks; otherwise build from source in a multi-stage image (C toolchain only, no Node) |
| Semantic embedding is too slow or too memory-hungry on large repos | Med | Measured in the spike; `mem_limit` caps it; `CODE_INDEX_SEMANTIC=off` |
| The binary tries to write into the repo (`.codebase-memory/`) | Med | Read-only mounts surface this in the spike; point the cache elsewhere or disable artifact export |
| Fast upstream churn (index-format rebuilds, CVEs) | Med | Pin the version and checksum; bump deliberately; a rebuild is one re-index |
| The token savings don't materialise | Med | SC 6 benchmark gate; report honestly before investing further |

## Open Questions

None. The spike checkpoint is the next human decision.
