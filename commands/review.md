---
description: Review — local persona review before the PR
agent: build
---

@code-review-and-quality @code-simplification

Run the code-reviewer subagent on `git diff origin/main...HEAD`. If the slice has `risk:security`, or the diff touches auth, secrets, migrations, dependency manifests or infra, also run security-auditor in parallel. Fix every Critical/Required finding or answer it with a reason, re-run sandbox_gate, then run redgreen_check. Summarise the findings for the PR.
