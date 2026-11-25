---
description: Define — explicit entry to run the project health check, interview, write a spec, and open the PRD issue
agent: plan
---

@using-agent-skills @oc-plan-gateway @interview-me @spec-driven-development @oc-github

Idea: $ARGUMENTS

This is an explicit Define-only entry into `oc-plan-gateway`; it is not an extra gateway the user must invoke before `/plan`.

1. Follow the gateway's Define workflow, including the applicable Addy clarification and contextual skills. If the idea is vague, load @idea-refine; for contract changes, load @api-and-interface-design.
2. Run the quick read-only project health check on the repo's `AGENTS.md` front matter, test contract, and `test.checks` static-check declarations. Record any missing or stale instruction as an explicit remediation item in the spec; never edit the app repo directly from Plan.
3. Read the repo's AGENTS.md front matter and architecture, then write the spec to `docs/spec/<slug>.md` (delta specs remain separate). Use explore/general subagents for repo research.
4. **The spec file must exist before approval.** Show its path and contents or a faithful summary, plus open questions, then stop for explicit approval. A chat-only draft is not a written spec.
5. After approval, Plan commits the spec on `spec/<slug>`, opens its PR, and creates the PRD issue through oc-github. Request required shell approval rather than handing this work to Build.
6. Planning may resume only after that later-turn approval, following the gateway; the numbered slice breakdown gets its own approval gate before issues are created.
