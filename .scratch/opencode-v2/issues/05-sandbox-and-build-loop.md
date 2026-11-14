# 05 — oc-sandbox (docker backend), oc-skills hook and the /build #N loop in one checkout

**What to build:** Following blueprint §4.2, §6, §7.2, §7.4 and §9.3: `oc-sandbox` with the docker backend, evidence, `sandbox_gate` and `redgreen_check`; the `oc-skills` hook (including per-app `.agents/skills/`); the slice part of `/build`; and the `oc-sandbox` skill. On the Mac, `/build #N` on a fixture slice that touches API and web runs in vertical order: API RED → GREEN → regenerate client → web RED → GREEN → E2E → `sandbox_gate`. Every run happens in the isolated Compose project.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] Backend auto-detects local Docker, and `OC_SANDBOX_BACKEND` overrides it
- [ ] No test runs on the host: every run goes through Compose with a per-slice project and no published ports
- [ ] Red/green runs use focused test-service args and are recorded against each SHA
- [ ] `redgreen_check` flags a code commit with no preceding failing test-only commit, and ignores generated client files
- [ ] `area:api` and `area:web` load the mapped skills and each app's `.agents/skills/`
- [ ] `sandbox_gate` fails on client drift and on a failing image smoke check
- [ ] A slice that can't pass stops as BLOCKED with a reason comment
- [ ] Plugin tests for `oc-sandbox` and `oc-skills` run in CI
