# 04 — /spec and /plan commands with oc-github

**What to build:** Following blueprint §4.1, §6, §8 and §9.3 and `commands.md`: the `/spec` and `/plan` templates, `oc-github`, the issue templates and labels. Against the fixture on a throwaway GitHub repo, `/spec` interviews and writes `docs/spec/<slug>.md` plus a PRD issue. After approval, `/plan` proposes vertical slices, waits for approval, then creates the slice sub-issues.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] The transcript shows `@`-loaded interview-me and spec-driven-development for `/spec`, and planning-and-task-breakdown and oc-github for `/plan`
- [ ] No issues are created before an unambiguous approval
- [ ] A feature that touches API and web comes out as one vertical slice labelled `area:api` + `area:web` with contract change = yes, not as two slices
- [ ] Slices are sub-issues of the PRD with blocking relationships, and each has acceptance criteria and a flag/removal plan where needed
- [ ] A schema change produces expand/contract slices
