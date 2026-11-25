import { Plugin } from "@opencode/plugin"
import { execSync, spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  type Backend,
  type CommitInfo,
  type EnsureReason,
  type EvidenceRecord,
  type Sidecar,
  assessContract,
  bootstrapEvidence,
  buildDownArgv,
  buildTestArgv,
  buildWarmArgv,
  envSecrets,
  isBootstrapReason,
  parseTestContract,
  planGateSteps,
  prepareMountpoints,
  readFrontMatter,
  redactTail,
  redgreenCheck,
  sandboxId,
  selectBackend,
} from "./lib"

/**
 * oc-sandbox — namespace "sandbox": sandbox_up, sandbox_test, sandbox_check,
 * sandbox_gate, redgreen_check, sandbox_down (blueprint §7.2). Every run is
 * fully isolated in Docker, built from the repo's own Dockerfiles and its single
 * compose.yml, with a per-slice project name and no published ports. Test
 * evidence is recorded against the commit SHA and read back by redgreen_check;
 * static checks never create evidence.
 *
 * Worktree sessions share the canonical checkout's plugin registry, and
 * ctx.location is the plugin instance's location — NOT the session's — so
 * every tool call resolves the session's own working directory (the slice
 * worktree) from its sessionID before doing anything.
 */

type SandboxState = {
  id: string
  backend: Backend
  sidecar?: Sidecar
  createdAt: number
}

/** Runs argv: through the sidecar on sysbox, as a local child process on docker. */
async function runArgv(
  state: Pick<SandboxState, "backend" | "id" | "sidecar">,
  argv: string[],
  cwd: string,
  timeoutMs = 15 * 60_000,
): Promise<{ exitCode: number; output: string }> {
  if (state.backend === "sysbox" && state.sidecar) {
    const res = await fetch(`${state.sidecar.url.replace(/\/$/, "")}/v1/sandboxes/${state.id}/exec`, {
      method: "POST",
      headers: { authorization: `Bearer ${state.sidecar.token}`, "content-type": "application/json" },
      body: JSON.stringify({ argv, timeoutMs }),
    })
    if (!res.ok) throw new Error(`sidecar exec failed (${res.status}): ${await res.text()}`)
    const json = (await res.json()) as { exit_code: number; stdout_tail: string; stderr_tail: string }
    return { exitCode: json.exit_code, output: `${json.stdout_tail}\n${json.stderr_tail}` }
  }
  return await new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs)
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (out += d))
    child.on("error", (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ exitCode: code ?? 1, output: out })
    })
  })
}

export default Plugin.define({
  id: "oc-sandbox",
  async setup(ctx) {
    console.log(
      `[oc-sandbox] active (registry location: ${ctx.location.directory}; tools: sandbox_up, sandbox_test, sandbox_check, sandbox_gate, redgreen_check, sandbox_down)`,
    )

    /** The session's own working directory — a slice worktree for slice sessions. */
    const sessionDir = async (sessionID?: string): Promise<string> => {
      if (sessionID) {
        try {
          const session: any = await ctx.session.get({ sessionID })
          if (session?.location?.directory) return session.location.directory
        } catch { }
      }
      return ctx.location.directory
    }

    const gitIn = (worktree: string, args: string): string => {
      try {
        return execSync(`git ${args}`, {
          cwd: worktree,
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 10_000,
        })
          .toString()
          .trim()
      } catch {
        return ""
      }
    }

    /** The slice key: the issue number when in a slice worktree, else a stable local key. */
    const sliceKeyOf = (worktree: string): string => {
      const gitDir = gitIn(worktree, "rev-parse --git-dir")
      if (!gitDir) return "local"
      const recordPath = gitDir.startsWith("/")
        ? join(gitDir, "oc-slice.json")
        : join(worktree, gitDir, "oc-slice.json")
      try {
        if (existsSync(recordPath)) {
          const record = JSON.parse(readFileSync(recordPath, "utf8")) as { issue?: number }
          return String(record.issue ?? "0")
        }
      } catch { }
      return "local"
    }

    const recordEvidence = async (record: EvidenceRecord) => {
      await ctx.storage.set(`evidence/${record.sha}/${Date.now()}`, record)
    }

    const evidenceBySha = async (): Promise<Map<string, EvidenceRecord[]>> => {
      const map = new Map<string, EvidenceRecord[]>()
      let after: string | undefined
      do {
        const page = await ctx.storage.scan({ prefix: "evidence/", after, limit: 500 })
        for (const entry of page.entries) {
          const rec = entry.value as unknown as EvidenceRecord
          if (!rec?.sha) continue
          const list = map.get(rec.sha) ?? []
          list.push(rec)
          map.set(rec.sha, list)
        }
        after = page.next
      } while (after)
      return map
    }

    /**
     * The mountpoint preflight: materializes every host path the Docker daemon
     * would otherwise create as root (bind sources and nested volume
     * mountpoints inside the worktree) as the invoking user, and verifies
     * existing ones. Runs on the host for both backends — the worktree paths
     * are host paths no matter where Compose runs. Rendered with the sandbox
     * project name and the contract's flow profiles; on sysbox the model is
     * cross-checked against a clean environment because the box receives no
     * process env. Fails closed. sandbox_down deliberately bypasses it, so
     * teardown stays available when new starts are blocked.
     */
    const mountpointPreflight = async (
      worktree: string,
      contract: ReturnType<typeof parseTestContract>,
      id: string,
      backend: Backend,
    ): Promise<string | null> => {
      const pre = await prepareMountpoints(worktree, contract.composeFile, {
        secrets: envSecrets(worktree),
        id,
        profiles: contract.profiles.length ? contract.profiles : undefined,
        crossCheckEnv: backend === "sysbox",
      })
      return pre.ok ? null : pre.blocked
    }

    const ensureUp = async (
      worktree: string,
    ): Promise<{ ok: true; state: SandboxState } | { ok: false; blocked: string; reason: EnsureReason }> => {
      const sliceKey = sliceKeyOf(worktree)
      const id = sandboxId(sliceKey, worktree)
      const stateKey = `sandboxes/${sliceKey}`
      const existing = (await ctx.storage.get(stateKey)) as SandboxState | undefined

      // Cold and warm paths agree: the current contract is assessed before
      // cached sandbox state is reused, so a contract emptied or removed after
      // warm-up is BLOCKED here too — and a sandbox warmed against a real
      // contract never turns a later-missing one into bootstrap RED (ADR 0013:
      // bootstrap applies only to the initial contract).
      const frontMatter = readFrontMatter(worktree)
      const assessment = assessContract(worktree, frontMatter)
      if (assessment === "missing-compose" || assessment === "missing-front-matter") {
        if (existing) {
          return {
            ok: false,
            blocked:
              `the test contract is missing in ${worktree} but this slice's sandbox was already created — ` +
              "restore compose.yml and the AGENTS.md test front matter (git checkout) instead of re-onboarding",
            reason: "contract-removed-mid-slice",
          }
        }
        return {
          ok: false,
          blocked:
            assessment === "missing-compose"
              ? `no compose.yml in ${worktree} — the repo's test contract is missing`
              : `no AGENTS.md test front matter in ${worktree} — the repo's test contract is missing`,
          reason: assessment,
        }
      }
      if (assessment === "declared-empty") {
        return {
          ok: false,
          blocked:
            `the AGENTS.md test contract in ${worktree} declares no dynamic verification steps ` +
            "(no test services, no generator, no smoke) — static checks supplement these and cannot replace them; fix the contract",
          reason: "declared-empty-contract",
        }
      }
      if (assessment === "overlapping-check-service") {
        return {
          ok: false,
          blocked:
            `the AGENTS.md test contract in ${worktree} reuses a Compose service in both test.services and test.checks — ` +
            "a service must be either a dynamic test or a static check, never both; fix the contract",
          reason: "overlapping-check-service",
        }
      }
      if (assessment === "malformed-front-matter") {
        return {
          ok: false,
          blocked: `AGENTS.md in ${worktree} starts a front-matter block that is never closed — fix the test contract`,
          reason: "malformed-front-matter",
        }
      }
      if (existing) return { ok: true, state: existing }
      const contract = parseTestContract(frontMatter)
      const choice = await selectBackend(ctx.options as Record<string, string | undefined>, process.env)
      if ("blocked" in choice) return { ok: false, blocked: choice.blocked, reason: "backend-unavailable" }
      const mountpoints = await mountpointPreflight(worktree, contract, id, choice.backend)
      if (mountpoints) return { ok: false, blocked: mountpoints, reason: "mountpoint-preflight" }
      const state: SandboxState = { id, backend: choice.backend, sidecar: choice.sidecar, createdAt: Date.now() }

      if (choice.backend === "sysbox" && choice.sidecar) {
        const res = await fetch(`${choice.sidecar.url.replace(/\/$/, "")}/v1/sandboxes`, {
          method: "POST",
          headers: { authorization: `Bearer ${choice.sidecar.token}`, "content-type": "application/json" },
          body: JSON.stringify({ id, worktree }),
        })
        if (!res.ok)
          return { ok: false, blocked: `sidecar refused to create sandbox ${id} (${res.status})`, reason: "sidecar-failed" }
      }

      const warm = buildWarmArgv(contract, id)
      const secrets = envSecrets(worktree)
      const build = await runArgv(state, warm.build, worktree, 30 * 60_000)
      if (build.exitCode !== 0)
        return { ok: false, blocked: `compose build failed:\n${redactTail(build.output, 50, secrets)}`, reason: "compose-build-failed" }
      const up = await runArgv(state, warm.up, worktree, 10 * 60_000)
      if (up.exitCode !== 0)
        return { ok: false, blocked: `sandbox warm-up failed:\n${redactTail(up.output, 50, secrets)}`, reason: "warmup-failed" }
      await ctx.storage.set(stateKey, state)
      return { ok: true, state }
    }

    const tearDown = async (worktree: string): Promise<string> => {
      const sliceKey = sliceKeyOf(worktree)
      const stateKey = `sandboxes/${sliceKey}`
      const state = (await ctx.storage.get(stateKey)) as SandboxState | undefined
      if (!state) return "sandbox down: nothing to tear down"
      try {
        await runArgv(state, buildDownArgv(parseTestContract(readFrontMatter(worktree)), state.id), worktree, 5 * 60_000)
      } finally {
        if (state.backend === "sysbox" && state.sidecar) {
          await fetch(`${state.sidecar.url.replace(/\/$/, "")}/v1/sandboxes/${state.id}`, {
            method: "DELETE",
            headers: { authorization: `Bearer ${state.sidecar.token}` },
          }).catch(() => { })
        }
        await ctx.storage.remove(stateKey)
      }
      return `sandbox down: ${state.id} (volumes removed)`
    }

    await ctx.tool.transform((editor) => {
      editor.namespace({ name: "sandbox", description: "Isolated test runs for the current slice (blueprint §7.2)" })

      const tool = (
        name: string,
        description: string,
        properties: Record<string, unknown>,
        execute: (input: any, context: any) => Promise<{ content: string }>,
      ) => {
        editor.add({
          name,
          description,
          input: { type: "object", properties, additionalProperties: false },
          options: { namespace: "sandbox", codemode: true },
          execute,
        } as any)
      }

      tool(
        "up",
        "Create and warm the slice's isolated sandbox: build the contract's images and bring dependencies up healthy.",
        { slice: { type: "string", description: "slice identifier (issue number)" } },
        async (_input, context) => {
          const wt = await sessionDir(context.sessionID)
          const up = await ensureUp(wt)
          if (!up.ok) return { content: `BLOCKED: ${up.blocked}` }
          return { content: `sandbox up: backend=${up.state.backend} id=${up.state.id} (images built, dependencies warm)` }
        },
      )

      tool(
        "test",
        "Run one test service from the contract in the isolated sandbox, with optional focused args. Records red/green evidence against the commit SHA. RED (failing) on a test-only commit, GREEN (passing) on the code commit.",
        {
          slice: { type: "string" },
          service: { type: "string", description: "test service from AGENTS.md test.services (default: the full suite)" },
          args: { type: "array", items: { type: "string" }, description: "focused args, e.g. one test file" },
        },
        async (input: { slice: string; service?: string; args?: string[] }, context) => {
          const wt = await sessionDir(context.sessionID)
          const up = await ensureUp(wt)
          if (!up.ok) {
            // Only the missing *initial* contract converts into recorded RED
            // evidence (ADR 0013); every other blocked condition records nothing.
            if (isBootstrapReason(up.reason)) {
              const service = input.service ?? "bootstrap"
              const args = input.args ?? []
              const sha = gitIn(wt, "rev-parse HEAD")
              await recordEvidence(bootstrapEvidence({ sha, service, args, at: Date.now() }))
              return {
                content:
                  `RED (bootstrap): no test contract in ${wt} — the missing initial contract is the failure. ` +
                  `Evidence recorded against sha=${sha.slice(0, 12)}. ` +
                  "Add the contract (compose.yml + AGENTS.md test front matter) in the implementation commit, then re-run for GREEN.",
              }
            }
            return { content: `BLOCKED: ${up.blocked}` }
          }
          const contract = parseTestContract(readFrontMatter(wt))
          const service = input.service ?? contract.services.all ?? "test"
          const declared = new Set(Object.values(contract.services))
          if (contract.generatorService) declared.add(contract.generatorService)
          if (!declared.has(service)) {
            return {
              content:
                `BLOCKED: service '${service}' is not declared in the AGENTS.md test contract — ` +
                "a caller error is not a test failure; nothing was recorded.",
            }
          }
          const mountpoints = await mountpointPreflight(wt, contract, up.state.id, up.state.backend)
          if (mountpoints) return { content: `BLOCKED: ${mountpoints}` }
          const argv = buildTestArgv(contract, up.state.id, service, input.args ?? [])
          const run = await runArgv(up.state, argv, wt)
          const sha = gitIn(wt, "rev-parse HEAD")
          const passed = run.exitCode === 0
          await recordEvidence({ sha, service, args: input.args ?? [], passed, exitCode: run.exitCode, at: Date.now() })
          return {
            content:
              `${passed ? "GREEN" : "RED"}: ${service} exit_code=${run.exitCode} sha=${sha.slice(0, 12)}\n` +
              redactTail(run.output, 200, envSecrets(wt)),
          }
        },
      )

      tool(
        "check",
        "Run the repo's declared static checks (lint, typecheck) in the isolated sandbox. One named check with focused args, or every declared check when omitted. Never records red/green evidence.",
        {
          slice: { type: "string" },
          check: { type: "string", description: "static-check name from AGENTS.md test.checks (default: all declared checks)" },
          args: { type: "array", items: { type: "string" }, description: "focused args; requires a named check" },
        },
        async (input: { slice: string; check?: string; args?: string[] }, context) => {
          const wt = await sessionDir(context.sessionID)
          const up = await ensureUp(wt)
          if (!up.ok) return { content: `BLOCKED: ${up.blocked}` }
          const contract = parseTestContract(readFrontMatter(wt))
          const entries = input.check
            ? Object.entries(contract.checks).filter(([key]) => key === input.check)
            : Object.entries(contract.checks)
          if (input.check && entries.length === 0) {
            return {
              content:
                `BLOCKED: check '${input.check}' is not declared in the AGENTS.md test contract — ` +
                "a caller error is not a check failure; nothing was recorded.",
            }
          }
          if (!input.check && input.args?.length) {
            return { content: "BLOCKED: focused args require a named check — run one declared check at a time." }
          }
          if (entries.length === 0) {
            return {
              content:
                "BLOCKED: the AGENTS.md test contract declares no static checks — " +
                "add test.checks for the repo's real lint/typecheck services.",
            }
          }
          const args = input.check ? input.args ?? [] : []
          const steps: { step: string; passed: boolean; detail?: string }[] = []
          const secrets = envSecrets(wt)
          for (const [key, service] of entries) {
            const checkBlocked = await mountpointPreflight(wt, contract, up.state.id, up.state.backend)
            if (checkBlocked) return { content: `BLOCKED: ${checkBlocked}` }
            const argv = buildTestArgv(contract, up.state.id, service, args)
            const run = await runArgv(up.state, argv, wt)
            steps.push({
              step: `static check ${key} (${service})`,
              passed: run.exitCode === 0,
              detail: redactTail(run.output, 200, secrets),
            })
          }
          const passed = steps.every((s) => s.passed)
          const report = steps
            .map((s) => `  ${s.passed ? "✓" : "✗"} ${s.step}${s.detail ? ` — ${s.detail}` : ""}`)
            .join("\n")
          return { content: `sandbox_check ${passed ? "PASSED" : "FAILED"}:\n${report}` }
        },
      )

      tool(
        "gate",
        "The full pre-PR run: every declared static check, every test service in the contract, any declared generation drift check and the production-image smoke check, all isolated.",
        { slice: { type: "string" } },
        async (_input, context) => {
          const wt = await sessionDir(context.sessionID)
          const up = await ensureUp(wt)
          if (!up.ok) return { content: `BLOCKED: ${up.blocked}` }
          const contract = parseTestContract(readFrontMatter(wt))
          const plan = planGateSteps(contract)
          if ("refusal" in plan) return { content: `sandbox_gate REFUSED: ${plan.refusal}` }
          const steps: { step: string; passed: boolean; detail?: string }[] = []
          const secrets = envSecrets(wt)
          // the model is re-validated before each container-creating step:
          // compose.yml may have changed since the last one
          const preflight = async () => {
            const blocked = await mountpointPreflight(wt, contract, up.state.id, up.state.backend)
            return blocked ? { content: `BLOCKED: ${blocked}` } : null
          }

          // static checks run first and never become red/green evidence:
          // a lint/typecheck pass is not a test pass
          for (const [key, service] of Object.entries(contract.checks)) {
            const checkBlocked = await preflight()
            if (checkBlocked) return checkBlocked
            const run = await runArgv(up.state, buildTestArgv(contract, up.state.id, service, []), wt)
            steps.push({
              step: `static check ${key} (${service})`,
              passed: run.exitCode === 0,
              detail: redactTail(run.output, 20, secrets),
            })
          }

          for (const [key, service] of Object.entries(contract.services)) {
            if (key === "e2e" || key === "smoke") continue
            const gateBlocked = await preflight()
            if (gateBlocked) return gateBlocked
            const run = await runArgv(up.state, buildTestArgv(contract, up.state.id, service, []), wt)
            await recordEvidence({
              sha: gitIn(wt, "rev-parse HEAD"),
              service,
              args: [],
              passed: run.exitCode === 0,
              exitCode: run.exitCode,
              at: Date.now(),
            })
            steps.push({ step: `test service ${service}`, passed: run.exitCode === 0, detail: redactTail(run.output, 20, secrets) })
          }

          if (contract.generatorService) {
            const genBlocked = await preflight()
            if (genBlocked) return genBlocked
            const gen = await runArgv(
              up.state,
              buildTestArgv(contract, up.state.id, contract.generatorService, []),
              wt,
              20 * 60_000,
            )
            if (gen.exitCode !== 0) {
              steps.push({ step: "client regeneration", passed: false, detail: redactTail(gen.output, 20) })
            } else {
              const globs = contract.generatedGlobs.map((g) => g.replace(/^\.\//, "")).filter(Boolean)
              const drift = await runArgv(
                up.state,
                ["git", "diff", "--exit-code", "--", ...(globs.length ? globs : ["."])],
                wt,
                60_000,
              )
              steps.push({
                step: "generation drift check",
                passed: drift.exitCode === 0,
                detail: drift.exitCode === 0 ? undefined : "generated artifacts differ from the committed ones — regenerate and commit them",
              })
            }
          }

          const smokeService = contract.services.smoke
          if (smokeService) {
            const full = contract.fullCommand
              .replace("docker compose", `docker compose -p ${up.state.id}`)
              .split(/\s+/)
              .filter(Boolean)
            const fullBlocked = await preflight()
            if (fullBlocked) return fullBlocked
            const fullRun = await runArgv(up.state, full, wt, 10 * 60_000)
            steps.push({ step: "full profile up (production images)", passed: fullRun.exitCode === 0, detail: redactTail(fullRun.output, 10) })
            if (fullRun.exitCode === 0) {
              const smokeBlocked = await preflight()
              if (smokeBlocked) return smokeBlocked
              const run = await runArgv(up.state, buildTestArgv(contract, up.state.id, smokeService, []), wt, 10 * 60_000)
              steps.push({ step: `smoke check (${smokeService})`, passed: run.exitCode === 0, detail: redactTail(run.output, 20) })
            }
          }

          const passed = steps.every((s) => s.passed)
          const report = steps.map((s) => `  ${s.passed ? "✓" : "✗"} ${s.step}${s.detail ? ` — ${s.detail}` : ""}`).join("\n")
          return { content: `sandbox_gate ${passed ? "PASSED" : "FAILED"}:\n${report}` }
        },
      )

      tool(
        "redgreen_check",
        "Verify the red/green discipline: every test-only commit has a failing evidence record, and the following code commit a passing one. Generated client files count as neither.",
        { slice: { type: "string" } },
        async (_input, context) => {
          const wt = await sessionDir(context.sessionID)
          const contract = parseTestContract(readFrontMatter(wt))
          const log = gitIn(wt, 'log --no-merges --format="%H%x1f%s" main..HEAD')
          if (!log) return { content: "no commits on this slice yet" }
          const commits: CommitInfo[] = log
            .split("\n")
            .filter(Boolean)
            .reverse()
            .map((line) => {
              const [sha, subject] = line.split("\x1f")
              const files = gitIn(wt, `diff-tree --no-commit-id --name-only -r ${sha}`).split("\n").filter(Boolean)
              return { sha, subject, files }
            })
          const result = redgreenCheck(commits, contract, await evidenceBySha())
          if (result.ok) return { content: `redgreen_check OK (${commits.length} commits checked)` }
          return {
            content:
              "redgreen_check VIOLATIONS:\n" +
              result.violations.map((v) => `  ${v.sha.slice(0, 12)} [${v.kind}] ${v.detail}`).join("\n"),
          }
        },
      )

      tool(
        "down",
        "Tear down the slice's sandbox: the Compose project with its volumes, and the sysbox box if any.",
        { slice: { type: "string" } },
        async (_input, context) => {
          const wt = await sessionDir(context.sessionID)
          return { content: await tearDown(wt) }
        },
      )
    })

    return () => { }
  },
})
