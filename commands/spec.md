---
description: Define — interview, then write a spec and open the PRD issue
agent: plan
---
@interview-me @spec-driven-development @oc-github

Idea: $ARGUMENTS

1. Interview me until objective, users, acceptance criteria, constraints and boundaries are clear. If the idea is still vague, also load @idea-refine. If interfaces or contracts change, also load @api-and-interface-design.
2. Read the repo's AGENTS.md front matter (apps, stacks, contract). Write the spec to docs/spec/<slug>.md (not SPEC.md). Use explore/general subagents for any repo research.
3. Show me the spec and wait for an unambiguous approval ("approve", "go", "yes"). Hedged answers are not approval.
4. After approval: commit the spec on a `spec/<slug>` branch, open a PR for it, and create the PRD issue (label `prd`) from the PRD template, linking the spec.
