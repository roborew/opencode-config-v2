# 01 — Spike: prove the OpenCode 2.3.0 mechanisms the flow depends on

**What to build:** A throwaway project on OpenCode 2.3.0 that tests every item in the spec's "To be confirmed by the spike" list, plus glob support in `skills` paths (`./apps/*/.agents/skills`), and records the results. Every [spike] marker in the blueprint is replaced by a confirmed approach or by its fallback.

**Blocked by:** 00

**Status:** ready-for-agent

- [ ] Each item has evidence in `docs/adr/0009-spike-results.md`
- [ ] The blueprint and spec are amended wherever a mechanism failed
- [ ] The local plugin runtime and package layout are confirmed and `package.json` is updated
- [ ] The throwaway project is deleted; only the ADR and doc changes are committed
