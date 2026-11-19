---
description: Plan — enter Define for new work or split an approved spec into vertical-slice issues
agent: plan
---

@using-agent-skills @oc-plan-gateway @interview-me @spec-driven-development @planning-and-task-breakdown @oc-github

Work or PRD: $ARGUMENTS (an idea, change, spec path, or issue number; a PRD is not required)

Follow `oc-plan-gateway` as the canonical workflow.

- A new idea or significant change without an approved spec starts **Define** automatically. Do not ask the user to invoke `/spec` and do not jump straight to slicing.
- An approved spec, or a PRD with verified linked-spec approval, resumes at **Plan slices**. An existing PRD without verified spec approval stays in Define.
- The spec must be written under `docs/spec/**` before its approval gate. Plan owns the spec branch/PR and PRD after approval, then the numbered-breakdown gate and GitHub slice issues. Do not hand these writes or GitHub operations to Build.
- The plan record is the spec + PRD + linked issues, not `tasks/plan.md` or `tasks/todo.md`. Only **slice drafting** is read-only: do not edit app implementation or create slice issues before the numbered breakdown is approved. This does not prohibit Define's required spec writes or, after spec approval, the spec branch/PR and PRD.
