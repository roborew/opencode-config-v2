# 02 — Config skeleton: opencode.jsonc, plan/build, personas, vendored addy, addy-sync

**What to build:** Following blueprint §2–§5 and §8: `opencode.jsonc` with the provider policy, model roster and agent overrides; the two persona agents; all 25 addy skills plus `references/` vendored at the pinned commit with `UPSTREAM.md` and licence; `addy-sync`; the global `AGENTS.md` phase → skill table; and repo CI steps from blueprint §13.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] OpenCode 2.3.0 starts with this repo as the global config and no errors
- [ ] Only the `opencode` and `opencode-go` providers can be used
- [ ] `plan` can't edit outside `docs/spec/**` and `docs/decisions/**`; `build` can't run `docker`, `sandbox`, `just import-env`, deploy verbs, force-push or push to `main`
- [ ] Each agent sees only the skills on its allow-list
- [ ] CI fails if a referenced skill is missing, or if `skills/addy/` changes without an `Addy-Sync:` trailer
- [ ] `addy-sync` shows the upstream diff and changes nothing without approval
