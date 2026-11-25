# Capability Map: local quality feedback

Approved: 2026-11-25
Implemented: 2026-11-25
Scope: `opencode-config-v2` only. No app repository is changed by this initiative.

| Module id               | Responsibility                                                                                                                                                                                       | Depends on              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `sandbox-static-checks` | Make app lint/typecheck failures surface during Build and in the pre-PR sandbox gate, using each repo’s real Compose services                                                                        | —                       |
| `plan-project-health`   | Start every Define/spec phase with a read-only project health check that validates the app repo’s `AGENTS.md` and tooling declarations, then routes gaps through the normal spec/approval/slice flow | `sandbox-static-checks` |

Build order: `sandbox-static-checks` → `plan-project-health`

## Notes

- The health check is **read-only**. It reports missing or stale instructions and required remediation; it never edits an app repo directly.
- Remediation is planned and approved like any other slice. Plan never silently modifies `AGENTS.md`, Compose files, CI, or app code.
- Static checks use the project’s real framework tooling. Repositories are not required to invent lint/typecheck commands their stack does not have.
