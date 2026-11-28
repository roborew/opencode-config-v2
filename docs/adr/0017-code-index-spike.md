# 0017 — code-index spike: codebase-memory-mcp sidecar behind mcp-proxy

Status: accepted (2026-11-27). Go/no-go for `plan-code-index.md` Tasks 5–8.

## Decision

**Go: run the sidecar.** Run `codebase-memory-mcp` v0.12.1 in its own `code-index`
container, bridged to Streamable HTTP by `mcp-proxy` 0.15.0. The in-image fallback
is not needed.

The spike changes four things relative to the spec:

1. **Base image is Debian trixie-slim, not bookworm.** The release binary needs
   glibc 2.38 and GLIBCXX 3.4.32. The image also needs `git`, because file
   discovery and change detection go through it.
2. **We run our own refresh-and-prune loop.** Upstream's watcher only follows the
   one project in the MCP session's working directory. It ignores other indexed
   projects and MCP `roots`, and it never removes deleted worktrees. A small loop in
   the container re-indexes changed projects (incremental, about 1 s) and deletes
   projects whose root is gone.
3. **Natural-language lookup uses `search_graph --query`, not
   `--semantic-query`.** The ranked full-text query found the right symbol in the
   top 5 for 5/5 questions. Vector semantic search found it for 2–3/5 with keyword
   arrays and 0/5 with sentences.
4. **`mode: full` stays the default.** It is cheap enough (4.6 s on 2.8k files) and
   enriches both search paths. Agent guidance leads with `query` and graph tools,
   and uses semantic search only as a supplement.

## Evidence

Run on Docker Desktop for Mac (linux/arm64, virtiofs bind mounts), with code mounted
read-only and no network (`--network none`) for the indexer.

| Check | Result |
|---|---|
| Release assets | linux arm64 and amd64 tarballs (+ `-portable`), `checksums.txt` and Sigstore bundles. SHA-256 verified: arm64 `8575f126…19cd`, amd64 `84530151…38c7` |
| Transport | stdio only (`codebase-memory-mcp` with no args). It exposes 17 tools |
| Index time, MCPJungle (267 files) | fast 1.0 s, full 1.3 s |
| Index time, zenml (2,821 files) | fast 2.8 s, full 4.6 s. Unchanged re-index 1.0–1.3 s |
| Peak RAM (all four indexes) | 702 MB. Idle sidecar (proxy + child + daemon) 48 MB |
| Disk | zenml full 86 MB, fast 48 MB. 151 MB total for four indexes |
| Writes into repo | none (read-only mount, `artifact_present: false`) |
| Natural-language `query` | 5/5 top-5 hits (retry config, cache key, secrets store, local server/dashboard, pandas materializer) |
| `semantic-query` | sentences: 0/5 (scores ≈ 0). Keyword arrays: about 2–3/5 |
| Watcher, host edit via bind mount | detected within 10 s, for the session's working-dir project only |
| Watcher, other indexed projects / worktrees | not watched, even with MCP roots offered (the server never requested `roots/list`) |
| Removed worktree | still listed and `ready`. Needs `delete_project` |
| Bridge | `mcp-proxy` 0.15.0 (Python, MIT). Streamable HTTP `/mcp`; `MCP_PROXY_AUTH_TOKEN` gives 401 on a missing or wrong token; `--allowed-host code-index:8080` is required (421 otherwise, DNS-rebinding guard). Three concurrent sessions share **one** stdio child + one daemon |
| Listening ports | 8080 only, once `ui_enabled=false`. The default opens a UI on `127.0.0.1:9749` |
| Sensitive-path guard | refuses to watch or index `/tmp`, `/`, home and similar roots. The working dir must be neutral (for example `/home/cbm`) |

## Consequences

- Task 5 image: `debian:trixie-slim` + `git` + `python3-venv`; `mcp-proxy==0.15.0`
  pinned in a venv; the binary downloaded by tag and SHA-256 checked;
  `ui_enabled=false`; a neutral working dir; non-root.
- There is no Node in the sidecar, so the spec's "no second Node toolchain" rule
  holds.
- Task 8 owns the refresh-and-prune loop. It polls each project's git HEAD and
  `status --porcelain` digest, re-indexes on change, and deletes projects whose
  root path is gone. Target cycle ≤ 30 s.
- Task 9 guidance: `index_status` → `index_repository` once per repo;
  `search_graph` with `query` for "where is…"; `name_pattern`/`trace_path` for
  structure; `grep` for literal text.
- SC 5b is met through `query`, which needs no API key, rather than vector search.
  The spec's description of semantic search should be updated to match.
- Spike note: zsh treats `$VAR:r…` as a path modifier, so test scripts must quote
  mount specs as `${VAR}:${VAR}:ro`.

## Not yet verified

(The amd64 image was verified in Task 5 under emulation: build, health, auth, indexing and search all pass. In Task 6, OpenCode 2.3.0 connected to the proxy as `type: remote` with 17 tools, and reported a wrong token as a 401 failure.)

- Index size and time on a repo larger than about 10k files.
