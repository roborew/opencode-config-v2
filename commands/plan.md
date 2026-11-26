---
description: Plan — enter Define (with its project health check) for new work or split an approved spec into vertical-slice issues
agent: plan
---

@using-agent-skills @oc-plan-gateway @interview-me @spec-driven-development @planning-and-task-breakdown @oc-github

Work or PRD: $ARGUMENTS (an idea, change, spec path, or issue number; a PRD is not required)

Follow `oc-plan-gateway` as the canonical workflow.

- A new idea or significant change without an approved spec starts **Define** automatically. Do not ask the user to invoke `/spec` and do not jump straight to slicing. At the start of Define, run the quick read-only project health check on the repo's `AGENTS.md` front matter, test contract, and `test.checks` static-check declarations, and record any gap as an explicit remediation item in the spec.
- An approved spec, or a PRD with verified linked-spec approval, resumes at **Plan slices**. An existing PRD without verified spec approval stays in Define.
- The spec must be written under `docs/spec/**` after the interview and before its approval gate. Plan commits it on `spec/<slug>` and opens the spec PR as the review surface; that PR may be opened before approval and is never merged by an agent. After the spec read-back, Plan creates the PRD through `oc-github` (the PRD is not a gate), then owns the numbered-breakdown gate and GitHub slice issues. Do not hand these writes or GitHub operations to Build.
- The plan record is the spec + PRD + linked issues, not `tasks/plan.md` or `tasks/todo.md`. Only **slice drafting** is read-only: do not edit app implementation or create slice issues before the numbered breakdown is approved. This does not prohibit Define's required spec writes or the spec branch/PR and PRD that Plan owns.
