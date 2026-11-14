# 05 — oc-sandbox (docker backend), oc-skills hook and the /build #N loop in one checkout

**What to build:** Following blueprint §4.2, §6, §7.2, §7.4 and §9.3: `oc-sandbox` with the docker backend, evidence, `sandbox_gate` and `redgreen_check`; the `oc-skills` hook (including per-app `.agents/skills/`); the slice part of `/build`; and the `oc-sandbox` skill. On the Mac, `/build #N` on a slice that touches API and web, in one of Robin's real app repos (chosen at the time; nothing is committed to this config), runs in vertical order: API RED → GREEN → regenerate client → web RED → GREEN → E2E → `sandbox_gate`. Every run happens in the isolated Compose project.

**Blocked by:** 02

**Status:** implementation done (2026-11-14); live `/build #N` run on one of Robin's real app repos pending (needs model auth)

- [x] Backend auto-detects local Docker, and `OC_SANDBOX_BACKEND` overrides it — unit-tested (auto/override/blocked paths)
- [x] No test runs on the host: every run goes through Compose with a per-slice project and no published ports — integration-tested against a real Docker daemon, including two projects side by side
- [x] Red/green runs use focused test-service args and are recorded against each SHA — implemented (evidence keyed by commit SHA in plugin storage); live agent usage pending
- [x] `redgreen_check` flags a code commit with no preceding failing test-only commit, and ignores generated client files — unit-tested for all violation kinds
- [x] `area:api` and `area:web` load the mapped skills and each app's `.agents/skills/` — runtime-verified live on an isolated OpenCode 2.3.0 server (base + front-matter + per-app skills added to prompt.skills; per-app skills registered and permission-allowed dynamically)
- [x] `sandbox_gate` fails on client drift and on a failing image smoke check — implemented (generator run + `git diff --exit-code` on the generated globs; full-profile up + smoke service); live gate run on a real app repo pending
- [x] A slice that can't pass stops as BLOCKED with a reason comment — enforced by the build agent system prompt and the `/build` command steps; live run pending
- [x] Plugin tests for `oc-sandbox` and `oc-skills` run in CI — 27 tests (temp git repos at test time, real Docker integration) + the plugin-tests CI job
