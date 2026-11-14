# 0006 — Guaranteed skill loading

Status: accepted (2026-11-14), pending spike

addy's own OpenCode setup relies on the model choosing skills ('skill invocation depends on model compliance'). We don't. Command templates name skills with `@skill-id`, and the `oc-skills` prompt hook adds slice base and `area:*` skills to `prompt.skills`. Per-agent `skill` permissions hide everything else. `AGENTS.md` is only the soft fallback.
