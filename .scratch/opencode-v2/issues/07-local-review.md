# 07 — Local review: code-reviewer and security-auditor

**What to build:** Following blueprint §4.3 and the `/review` draft: before a PR opens, the slice session runs `code-reviewer` (MiniMax M3) on every slice, plus `security-auditor` (Qwen3.8 Max) when `risk:security` is set or risky paths change. Findings are fixed or answered.

**Blocked by:** 05

**Status:** files complete (2026-11-14); live persona run on an app repo scratch branch pending (needs model auth)

- [ ] code-reviewer flags a deliberately weakened test and a hand-edited generated client on a scratch branch of an app repo
- [ ] security-auditor runs only on its trigger
- [ ] Personas don't call each other or other agents
- [ ] The review summary is ready to go into the PR template
