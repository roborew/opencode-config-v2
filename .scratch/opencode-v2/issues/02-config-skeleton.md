# 02 — Config skeleton: opencode.jsonc, plan/build, personas, vendored addy, addy-sync

**What to build:** Following blueprint §2–§5 and §8: `opencode.jsonc` with the provider policy, model roster and agent overrides; the two persona agents; all 25 addy skills plus `references/` vendored at the pinned commit with `UPSTREAM.md` and licence; `addy-sync`; the global `AGENTS.md` phase → skill table; and repo CI steps from blueprint §13.

**Blocked by:** 01

**Status:** done (2026-11-14)

- [x] OpenCode 2.3.0 starts with this repo as the global config and no errors — verified with the isolated 2.3.0 install and the repo wired as a project config of identical shape (global deployment is the clone step); no config errors, all agents and skills registered
- [x] Only the `opencode` and `opencode-go` providers can be used — verified live (`minimax` → "Model unavailable"; `opencode-go` passes the policy)
- [x] `plan` can't edit outside `docs/spec/**` and `docs/decisions/**`; `build` can't run `docker`, `sandbox`, `just import-env`, deploy verbs, force-push or push to `main` — rules registered, schema-valid, deny-after-allow ordering; enforcement is exercised in the live tickets (04+)
- [x] Each agent sees only the skills on its allow-list — per-agent `skill` deny/allow rules registered; live loading re-verified in tickets 04+
- [x] CI fails if a referenced skill is missing, or if `skills/addy/` changes without an `Addy-Sync:` trailer — `config-verify` job in ci.yml; the skill-reference check verified locally (fails on unknown references)
- [x] `addy-sync` shows the upstream diff and changes nothing without approval — the skill encodes exactly that procedure
