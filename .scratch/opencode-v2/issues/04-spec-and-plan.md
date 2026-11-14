# 04 — /spec and /plan commands with oc-github

**What to build:** Following blueprint §4.1, §6, §8 and §9.3 and `commands.md`: the `/spec` and `/plan` templates, `oc-github` with its own templates and labels under `skills/oc/oc-github/templates/` (D33). Against one of Robin's real app repos (chosen at the time; nothing is committed to this config), `/spec` interviews and writes `docs/spec/<slug>.md` plus a PRD issue. After approval, `/plan` proposes vertical slices, waits for approval, then creates the slice sub-issues.

**Blocked by:** 02

**Status:** files complete (2026-11-14); live /spec → /plan verification pending (needs model auth + one of Robin's real app repos)

- [ ] The transcript shows `@`-loaded interview-me and spec-driven-development for `/spec`, and planning-and-task-breakdown and oc-github for `/plan`
- [ ] No issues are created before an unambiguous approval
- [ ] A feature that touches API and web comes out as one vertical slice labelled `area:api` + `area:web` with contract change = yes, not as two slices
- [ ] Slices are sub-issues of the PRD with blocking relationships, and each has acceptance criteria and a flag/removal plan where needed
- [ ] A schema change produces expand/contract slices
- [ ] On a fresh throwaway repo with no `.github/ISSUE_TEMPLATE` and no labels, the PRD and slices still get their full bodies, and missing labels are created on demand
