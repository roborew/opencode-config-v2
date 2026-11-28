# Spec: code-index

Module id: `code-index`
Depends on: —
Repos touched: `opencode-server` (most of the work), `opencode-config-v2` (agent guidance only)
Status: **approved 2026-11-27** — breakdown in `plan-code-index.md`

## Objective

Give every OpenCode session on the server a local, persistent, structural index of
the codebases under `OPENCODE_APPS_DIR`, so agents locate code by asking a graph
("who calls X", "where is Y defined", "what does this change affect") instead of
repeated `grep` + `read` round-trips. The goal is fewer tokens and fewer tool calls
per task, with no cloud service, no embedding API key and no second Node toolchain.

At the same time, remove the dead Milvus / `claude-context` stack, which is
disabled, costs RAM (etcd + minio + milvus), and only exists because
`@zilliz/claude-context-mcp` cannot build `tree-sitter@0.21.1` on Node 24.

### Research findings (why this design)

**OpenCode has no index of its own.** Its code-finding tools are `grep` (ripgrep,
100-match default), `glob`, and `read` (2,000 lines / 50 KiB per page). The `lsp`
config key only feeds diagnostics back to the agent; there are no
definition/reference/symbol tools and no embeddings or persistent index in the docs
([tools](https://opencode.ai/docs/tools/), [lsp](https://opencode.ai/docs/lsp/),
[config](https://opencode.ai/docs/config/)). So every structural question costs a
`grep` → read several files → `grep` again loop. An index does help here.

**Candidates compared**

| | codebase-memory-mcp | Graphify | Serena | claude-context (current) |
|---|---|---|---|---|
| Approach | tree-sitter graph (+ optional bundled local embeddings) | tree-sitter graph for code; LLM pass for docs/PDF/media | live language servers, no index | vector embeddings in Milvus |
| Runtime | single static C/C++ binary | Python 3.11+ | Python + one LSP per language | Node (broken on 24) |
| Storage | SQLite file | `graph.json` files per repo | none | Milvus + etcd + minio |
| External API | none | none for code; LLM needed for docs | none | OpenAI embeddings |
| MCP transport | stdio | stdio (OSS); HTTP only on their hosted SaaS | stdio / SSE | stdio |
| Incremental | built-in watcher daemon (git HEAD + dirty state) | `graphify update` / `watch` / git hooks | n/a | manual re-index |
| Multi-repo | yes, one store, cross-repo edges | `global` merge of graph files | per project | yes |
| License | MIT | Apache-2.0 / MIT | MIT or GPL-3.0 (sources disagree) | MIT |
| Claimed savings | ~10× fewer tokens, 2.1× fewer tool calls over 31 repos ([arXiv 2603.27277](https://arxiv.org/pdf/2603.27277)) | 82% vs 71% key-fact coverage on ERPNext, n=6, vendor-run | — | — |

All savings figures come from the projects themselves. Treat them as unverified
until our own benchmark (Success Criteria 6) reproduces them.

**Recommendation: codebase-memory-mcp.** It is the only candidate that is
dependency-free (one pinned binary, so the Node-version problem cannot come back),
keeps a self-updating store behind one long-running process, and handles many repos
at once. That matches a server holding many app repos plus slice worktrees.
Graphify's strengths are docs and media (which need an LLM pass) and its git-hook
workflow writes `graphify-out/` and `.gitattributes` changes into app repos, which
D33 forbids. Its networked mode is the hosted SaaS, which is excluded. Serena means
running a language server for every stack, which is heavier and gives no persistent
index.

## Design

```
opencode (container) ──Streamable HTTP + bearer──▶ code-index (container)
  mcp.servers.code-index                             supergateway/mcp-proxy
  type: remote                                       └─ stdio ─▶ codebase-memory-mcp (pinned)
                                                     volume: code-index-cache (SQLite)
                                                     bind: OPENCODE_APPS_DIR (read-only, same path)
                                                     bind: OPENCODE_WORKTREES_DIR (read-only, same path)
```

- **Own Compose service** `code-index`, on the internal `opencode-net` only, with no
  published port by default. It gets its own `mem_limit`, so a large index build
  can't take memory from `opencode-server`, and it can be upgraded or restarted on
  its own.
- **Bridge.** codebase-memory-mcp is stdio-only, so a small, pinned stdio →
  Streamable HTTP bridge runs one stateful child in the container. OpenCode remote
  MCP needs Streamable HTTP and an absolute URL
  ([mcp-servers](https://opencode.ai/docs/mcp-servers/)). The bridge is picked in
  task 1 (spike).
- **Same-path, read-only mounts** of the apps and worktrees dirs, so paths the agent
  passes (`/Users/…/projects/foo`) resolve the same in both containers.
  `CBM_ALLOWED_ROOT` is limited to those two roots.
- **Cache** on a named Docker volume (`code-index-cache` → `CBM_CACHE_DIR`). Upstream
  warns SQLite is unreliable on network/bind filesystems.
- **Auth.** `CODE_INDEX_TOKEN` bearer header, passed in by `compose.sh`/Infisical like
  the other secrets. It is never written to the repo.
- **Fallback.** If the spike shows the bridge is unreliable, run the binary inside the
  `opencode` image as a `type: local` MCP with the same cache volume. The config
  change is one block.
- **Server-only, Mac-safe.** The MCP entry lives only in
  `opencode-server/overrides/opencode.server.json`. The config repo's
  `opencode.jsonc` never declares `code-index`, so the Mac (no server) starts with no
  MCP error and no timeout. Agent guidance is conditional: use `code-index_*` tools
  when they are present, otherwise fall back to `grep`/`glob`/`read` exactly as today.
- **Indexing lifecycle (on request, then maintained; refresh loop per ADR 0017).**
  - `auto_index` is off. An agent's first structural lookup in a repo calls
    `index_status`, and calls `index_repository` only if the repo is missing.
  - After that, the watcher keeps the index fresh, and the index persists on the
    volume. Later sessions on the same repo pay nothing.
  - Indexing is tree-sitter work inside the service and costs no LLM tokens. The
    agent's only cost is one tool call plus the wall-clock wait.
  - The spike measures the first-index time on a typical app repo. If it is over
    60 s, the default switches to auto-indexing the repos under `OPENCODE_APPS_DIR`
    at service start (`auto_index`, bounded by `auto_index_limit`). Agents then never
    wait.
- **Slice worktrees indexed separately** (`ignore_worktrees: false`). A slice changes
  files, so its index has to reflect its own branch, not `main`. When a worktree
  directory disappears (slice merged and cleaned up), its project is pruned with
  `delete_project`. The spike checks whether upstream does this; if not, a small
  prune loop in the `code-index` container does it, so stale projects don't pile up.
- **Semantic search on (revised by ADR 0017).** `mode: full` builds the local
  embeddings (bundled model, CPU, no API key) alongside a ranked full-text index of
  the graph. The spike found that the ranked query (`search_graph` with `query`) answers
  natural-language "where is…" questions best (5/5 top-5 hits). Vector search
  (`semantic-query`) was weak (2–3/5 with keywords). So agent guidance leads with
  `query` and the graph tools, and uses `semantic-query` only as a supplement.
  `CODE_INDEX_SEMANTIC=off` drops to `mode: moderate` or `fast` if cost matters.
- **Connected directly**, not through MCPJungle. It is core server infrastructure,
  and code traffic stays on `opencode-net`.

## Tech Stack

- `codebase-memory-mcp` — pinned version (≥ v0.12.1, which carries the
  CVE-2026-114494…114499 fixes), downloaded by release tarball with SHA-256 check in
  the Dockerfile.
- Bridge: one of `supergateway` or `sparfenyuk/mcp-proxy`, pinned (decided by spike).
- Base image: `debian:bookworm-slim` (or whatever the bridge needs), non-root user.
- OpenCode 2.3.0 remote MCP config (`mcp.servers.<name>`, `type: remote`).

## Commands

```
# Server repo (opencode-server)
./scripts/compose.sh up -d --build                 # whole stack incl. code-index
./scripts/compose.sh logs -f code-index
./tests/image-preflight.sh                         # image/static assertions
./tests/container-preflight-assertions.sh          # running-stack assertions
./tests/setup-regression.sh

# Config repo (opencode-config-v2)
npm test                                           # vitest, incl. config verification
```

## Project Structure

```
opencode-server/
  docker/code-index/Dockerfile      → new: binary + bridge image
  docker-compose.yml                → add code-index; delete etcd, minio, milvus-standalone,
                                      MILVUS_*/EMBEDDING_PROVIDER/OPENAI_API_KEY wiring
  overrides/opencode.server.json    → replace claude-context block with code-index remote MCP
  .env.example                      → drop Milvus/Minio/COMPOSE_PROFILES=milvus/DOCKER_VOLUME_DIRECTORY;
                                      add CODE_INDEX_* knobs
  docker/entrypoint.sh              → drop MILVUS_ADDRESS export + claude-context comment
  scripts/doctor-perf.sh, scripts/lib/preflight.sh → claude-context/Milvus checks → code-index health
  tests/*                           → assertions for the new service, no Milvus
  README.md, AGENTS.md, docs/*      → rewrite indexing sections; delete Milvus sections
opencode-config-v2/
  AGENTS.md                         → one short rule: prefer code-index tools for structural lookups,
                                      fall back to grep for literal text
  docs/plan/spec-code-index.md      → this file
```

The config repo has no Milvus or claude-context references today (checked), so the
removal is entirely in `opencode-server`.

## Code Style

Follow the existing compose conventions: pinned images, healthchecks, comments that
say why, and `${VAR:-default}` knobs.

```yaml
  code-index:
    build: { context: ./docker/code-index, args: { CBM_VERSION: ${CBM_VERSION:-0.12.1} } }
    container_name: opencode-code-index
    restart: unless-stopped
    mem_limit: ${CODE_INDEX_MEMORY_LIMIT:-4g}
    environment:
      CBM_CACHE_DIR: /var/lib/code-index
      CBM_ALLOWED_ROOT: ${OPENCODE_APPS_DIR:-${HOME}/projects}
      CODE_INDEX_TOKEN: ${CODE_INDEX_TOKEN:?set CODE_INDEX_TOKEN}
    volumes:
      - code-index-cache:/var/lib/code-index
      - ${OPENCODE_APPS_DIR:-${HOME}/projects}:${OPENCODE_APPS_DIR:-${HOME}/projects}:ro
    networks: [opencode-net]
```

```jsonc
"code-index": {
  "type": "remote",
  "url": "http://code-index:8080/mcp",
  "oauth": false,
  "headers": { "Authorization": "Bearer {env:CODE_INDEX_TOKEN}" },
  "timeout": { "execution": 300000 }
}
```

## Testing Strategy

- **Static (image-preflight):** compose renders with no `milvus|etcd|minio|claude-context`
  anywhere; `code-index` has a pinned version, checksum, healthcheck, `mem_limit`, no
  published port, and read-only code mounts.
- **Runtime (container-preflight):** `code-index` is healthy; from inside `opencode`,
  an MCP `tools/list` over the bridge returns the expected tool names; a request
  without the bearer token gets 401; indexing a fixture repo under `tests/fixtures`
  and running `search_graph` for a known symbol returns it.
- **OpenCode wiring:** `opencode mcp list` in the container shows `code-index`
  connected.
- **Token benchmark (manual, recorded in docs):** the same five structural questions
  on one real app repo, asked once with code-index disabled and once enabled. Record
  total tokens and tool calls for each run.
- Config repo: `npm test` stays green; add an assertion that AGENTS.md names the
  code-index MCP.

## Boundaries

- **Always:** pin every image and binary with a checksum; keep the service
  internal-only; mount code read-only; keep tokens in env/Infisical; update docs in
  the same PR as the change.
- **Ask first:** publishing the code-index port to the host or Twingate; enabling
  the CBM Lens UI; any embedding model that has to be downloaded at runtime (the
  bundled one is fine); adding code-index to the Mac host config; deleting the host
  `../milvus` data directory (it's outside the repo, so the user does it).
- **Never:** call a cloud or hosted index (Graphify SaaS, Zilliz Cloud); write index
  artifacts (`graph.db.zst`, `graphify-out/`, git hooks) into app repos; keep a
  second Node toolchain for indexing; let agents run raw `docker` to manage the
  service.

## Success Criteria

1. `docker compose config` for opencode-server has no `milvus`, `etcd`, `minio`,
   `claude-context`, `MILVUS_*`, `EMBEDDING_PROVIDER` or `COMPOSE_PROFILES=milvus`.
   `grep -ri 'milvus\|claude-context'` over both repos only finds this spec and the
   changelog/ADR that records the removal.
2. `./scripts/compose.sh up -d --build` starts `opencode`, `twingate-connector` and
   `code-index`, and all three report healthy.
3. A server OpenCode session lists `code-index_*` tools, and indexing an app repo
   under `OPENCODE_APPS_DIR` succeeds without any API key.
4. After a commit or edit in an indexed repo or slice worktree, a query reflects the
   change within one watcher cycle (target ≤ 60 s) with no manual re-index.
5. The index survives `compose down && up`, because the cache is on a volume. A
   second session on an already-indexed repo makes no `index_repository` call.
5a. The first index of a typical app repo, semantic embeddings included, finishes
    in ≤ 60 s, or auto-indexing at startup is turned on (see Design).
5b. A natural-language `search_graph` `query` finds the right file in the top 5 for at
    least 4 of 5 benchmark queries, with no API key configured.
5c. A slice worktree is indexed as its own project, and its project is gone within
    one prune cycle after the worktree is removed.
5d. With the same config-repo checkout and no server (Mac), OpenCode starts with no
    MCP errors, and `npm test` passes.
6. On the benchmark, the five structural questions use **≥ 40% fewer total tokens**
   with code-index than with grep-only, and answer quality is no worse. If they
   don't, we report that and reconsider before rolling out further.
7. All preflight/regression scripts and config-repo `npm test` pass.

## Plan of action (proposed slices — detailed breakdown after approval)

1. **Spike (time-boxed):** confirm codebase-memory-mcp's transport and flags at the
   pinned version, pick the bridge, and check it in a throwaway container against
   one repo, including that the watcher sees bind-mount changes from the Mac host
   (polling, not inotify). Record the result as an ADR. Go/no-go for the sidecar
   design vs. the in-image fallback.
2. **Remove Milvus + claude-context** from opencode-server (compose, env, entrypoint,
   override, scripts, tests, docs). This is independently shippable.
3. **Add the `code-index` service** and the override MCP entry, plus tests.
4. **Agent guidance** in opencode-config-v2 AGENTS.md, plus the benchmark run and
   its results recorded in opencode-server docs.

## Decisions (answered 2026-11-27)

1. **Sidecar container**, not in-image. The in-image setup is the fallback only if
   the spike rejects the bridge.
2. **Server-only.** The config must still work unchanged on a Mac with no server: no
   `code-index` entry in the config repo, and guidance that degrades to grep.
3. **On request, then maintained** by the watcher and the persistent volume. If the
   spike's first-index time is too slow (over 60 s), switch to auto-indexing at
   startup so agents never wait.
4. **Worktrees indexed separately**, with stale ones pruned.
5. **Semantic search on**, using the bundled local embedding model. The spike checks
   its cost and quality, and a knob can turn it off.
6. **Direct connection**, not through MCPJungle.

## Open Questions

None blocking. The spike (slice 1) reports back on bridge choice, first-index time,
semantic cost and quality, and worktree pruning before slices 3–4 start.
