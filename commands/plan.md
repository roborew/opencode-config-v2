---
description: Plan — enter Define for new work or split an approved spec into vertical-slice issues
agent: plan
---

@using-agent-skills @oc-plan-gateway @interview-me @spec-driven-development @planning-and-task-breakdown @oc-github

Work or PRD: $ARGUMENTS (an idea, change, spec path, or issue number; a PRD is not required)

Follow `oc-plan-gateway` as the canonical workflow.

- A new idea or significant change without an approved spec starts **Define** automatically. Do not ask the user to invoke `/spec` and do not jump straight to slicing.
- An approved spec/PRD without an approved breakdown resumes at **Plan slices**.
- The spec must be written under `docs/spec/**` before its approval gate. Plan owns the spec branch/PR and PRD after approval, then the numbered-breakdown gate and GitHub slice issues. Do not hand these writes or GitHub operations to Build.
- Before breakdown approval, research and drafting only: do not edit repo files or create issues. After approval, create the slice issues. The plan record is the spec + PRD + linked issues, not `tasks/plan.md` or `tasks/todo.md`.
