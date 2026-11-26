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
4. **The spec file must exist before approval.** After the interview, commit the spec on `spec/<slug>` and open its PR; the spec PR is the review surface and may be opened before approval. Show its path and a faithful summary, plus open questions, in chat as the review invitation. A chat-only draft is not a written spec.
5. Post the labelled `SPEC-APPROVAL-REQUEST` comment naming the spec path and full commit SHA, then start the read-only watcher. The single owner-authored `SPEC-APPROVED` comment on that PR is the approval; there is no chat approval round-trip. Read it back with read-only GitHub access before acting.
6. After the read-back, create the PRD immediately through oc-github; the PRD is not a gate. Planning then continues to the separate numbered-slice-breakdown gate before issues are created. Request required shell approval rather than handing this work to Build.
