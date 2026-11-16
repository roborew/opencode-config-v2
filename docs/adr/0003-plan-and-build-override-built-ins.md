# 0003 — plan and build override the built-in agents

Status: accepted (2026-11-14)

OpenCode 2.x allows overriding built-in agents by ID (model, system, permissions). We use `plan` (Claude Opus 5.5) and `build` (DeepSeek V4.1 Flash) instead of custom primaries. The only subagents are addy's `code-reviewer` and `security-auditor`, plus the built-ins `explore` and `general`. There's no separate RED/test-writer agent, matching addy's `/build`. Personas never call personas; commands orchestrate.

Amended 2026-11-16 by [0010](0010-model-roster-reassessment.md): `plan` now runs on Kimi K3.1 Pro (Go).
