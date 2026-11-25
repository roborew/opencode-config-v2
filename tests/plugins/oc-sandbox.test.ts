import { execSync, spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { afterAll, describe, expect, it, vi } from "vitest"
import {
  type ComposeModel,
  type EnsureReason,
  type PlannedMountpoint,
  assessContract,
  bootstrapEvidence,
  buildComposeConfigArgv,
  buildDownArgv,
  buildProfileListArgv,
  buildTestArgv,
  buildWarmArgv,
  classifyCommit,
  envSecrets,
  globMatch,
  isBootstrapReason,
  materializeMountpoints,
  parseTestContract,
  planGateSteps,
  planMountpoints,
  prepareMountpoints,
  readFrontMatter,
  redactTail,
  redgreenCheck,
  runComposeLocal,
  sandboxId,
  selectBackend,
} from "../../plugins/oc-sandbox/lib"
import sandboxPlugin from "../../plugins/oc-sandbox/index"

const FRONT_MATTER = `
apps:
  api: { kind: backend, stack: fastapi, skills: [api-and-interface-design] }
contract: { generated: ["packages/api-client/**"], generator_service: "api-client-gen" }
test:
  compose: compose.yml
  profiles: { test: test, full: full }
  commands:
    test: "docker compose -f compose.yml --profile test run --rm {service} {args}"
    full: "docker compose -f compose.yml --profile full up -d --wait"
  services: { all: "test", api: "api-test", web: "web-test", e2e: "e2e", smoke: "smoke" }
  checks: { lint: "app-lint", typecheck: "app-typecheck" }
test_globs: ["apps/*/tests/**", "apps/web/e2e/**", "apps/*/**/*.test.*"]
`

const tmpDirs: string[] = []
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
})

describe("selectBackend", () => {
  it("honours explicit overrides", async () => {
    expect(await selectBackend({ backend: "docker" }, {})).toEqual({ backend: "docker" })
    const sysbox = await selectBackend({ backend: "sysbox", sidecarUrl: "http://x", sidecarToken: "t" }, {})
    expect(sysbox).toEqual({ backend: "sysbox", sidecar: { url: "http://x", token: "t" } })
    const blocked = await selectBackend({ backend: "sysbox" }, {})
    expect("blocked" in blocked).toBe(true)
  })

  it("auto: a healthy sidecar wins", async () => {
    const fetchImpl = (async (_url: string) => ({ ok: true })) as unknown as typeof fetch
    const choice = await selectBackend(
      { sidecarUrl: "http://sidecar", sidecarToken: "t" },
      {},
      { fetchImpl, dockerInfo: () => true },
    )
    expect(choice).toEqual({ backend: "sysbox", sidecar: { url: "http://sidecar", token: "t" } })
  })

  it("auto: falls back to local docker when the sidecar is unreachable", async () => {
    const fetchImpl = (async () => {
      throw new Error("unreachable")
    }) as unknown as typeof fetch
    const choice = await selectBackend({ sidecarUrl: "http://sidecar", sidecarToken: "t" }, {}, { fetchImpl, dockerInfo: () => true })
    expect(choice).toEqual({ backend: "docker" })
    const blocked = await selectBackend({}, {}, { fetchImpl, dockerInfo: () => false })
    expect("blocked" in blocked).toBe(true)
  })

  it("env vars back the options", async () => {
    expect(await selectBackend({}, { OC_SANDBOX_BACKEND: "docker" })).toEqual({ backend: "docker" })
  })
})

describe("sandboxId", () => {
  it("is short, stable and per-worktree", () => {
    const a = sandboxId("7", "/some/worktree")
    expect(a).toMatch(/^s7-[0-9a-f]{6}$/)
    expect(a.length).toBeLessThan(64)
    expect(sandboxId("7", "/some/worktree")).toBe(a)
    expect(sandboxId("8", "/some/worktree")).not.toBe(a)
    expect(sandboxId("7", "/other/worktree")).not.toBe(a)
  })
})

describe("parseTestContract + argv building", () => {
  const contract = parseTestContract(FRONT_MATTER)

  it("parses services, checks, commands, globs and the generator", () => {
    expect(contract.services).toEqual({ all: "test", api: "api-test", web: "web-test", e2e: "e2e", smoke: "smoke" })
    expect(contract.checks).toEqual({ lint: "app-lint", typecheck: "app-typecheck" })
    expect(contract.generatorService).toBe("api-client-gen")
    expect(contract.generatedGlobs).toEqual(["packages/api-client/**"])
    expect(contract.testGlobs).toContain("apps/*/tests/**")
    expect(contract.profiles).toEqual(["test", "full"])
    expect(contract.fullCommand).toContain("--profile full")
  })

  it("builds an isolated per-slice static-check argv with no published ports", () => {
    const argv = buildTestArgv(contract, "s7-abc123", "app-lint", [])
    expect(argv).toEqual([
      "docker",
      "compose",
      "-p",
      "s7-abc123",
      "-f",
      "compose.yml",
      "--profile",
      "test",
      "run",
      "--rm",
      "app-lint",
    ])
    expect(argv.join(" ")).not.toContain("-p app")
  })

  it("builds an isolated per-slice test argv with no published ports", () => {
    const argv = buildTestArgv(contract, "s7-abc123", "api-test", ["tests/test_health.py"])
    expect(argv).toEqual([
      "docker",
      "compose",
      "-p",
      "s7-abc123",
      "-f",
      "compose.yml",
      "--profile",
      "test",
      "run",
      "--rm",
      "api-test",
      "tests/test_health.py",
    ])
    expect(argv.join(" ")).not.toContain("-p app")
  })

  it("builds warm and down argvs", () => {
    expect(buildWarmArgv(contract, "s7-abc123").build).toEqual([
      "docker",
      "compose",
      "-p",
      "s7-abc123",
      "-f",
      "compose.yml",
      "build",
    ])
    expect(buildWarmArgv(contract, "s7-abc123").up.at(-1)).toBe("--wait")
    expect(buildDownArgv(contract, "s7-abc123")).toContain("-v")
    expect(buildDownArgv(contract, "s7-abc123")).toContain("--remove-orphans")
  })
})

describe("glob matching", () => {
  it("handles **, single-segment * and exact paths", () => {
    expect(globMatch("apps/*/tests/**", "apps/api/tests/test_x.py")).toBe(true)
    expect(globMatch("apps/*/tests/**", "apps/api/app/main.py")).toBe(false)
    expect(globMatch("apps/*/**/*.test.*", "apps/web/src/button.test.tsx")).toBe(true)
    expect(globMatch("packages/api-client/**", "packages/api-client/src/index.ts")).toBe(true)
    expect(globMatch("compose.yml", "compose.yml")).toBe(true)
  })
})

describe("red/green classification and check", () => {
  const contract = parseTestContract(FRONT_MATTER)

  it("classifies test-only, generated and code commits", () => {
    expect(classifyCommit({ sha: "a", subject: "s", files: ["apps/api/tests/test_x.py"] }, contract)).toBe("test")
    expect(classifyCommit({ sha: "a", subject: "s", files: ["packages/api-client/src/i.ts"] }, contract)).toBe("generated")
    expect(classifyCommit({ sha: "a", subject: "s", files: ["apps/api/tests/test_x.py", "apps/api/app/main.py"] }, contract)).toBe("code")
    expect(classifyCommit({ sha: "a", subject: "s", files: [] }, contract)).toBe("empty")
  })

  const commit = (sha: string, subject: string, files: string[]) => ({ sha, subject, files })

  it("passes a proper RED then GREEN sequence and ignores generated commits", () => {
    const commits = [
      commit("red1", "RED test", ["apps/api/tests/test_x.py"]),
      commit("gen1", "regen", ["packages/api-client/src/i.ts"]),
      commit("grn1", "GREEN code", ["apps/api/tests/test_x.py", "apps/api/app/main.py"]),
    ]
    const evidence = new Map([
      ["red1", [{ sha: "red1", service: "api-test", args: [], passed: false, exitCode: 1, at: 1 }]],
      ["grn1", [{ sha: "grn1", service: "api-test", args: [], passed: true, exitCode: 0, at: 2 }]],
    ])
    expect(redgreenCheck(commits, contract, evidence).ok).toBe(true)
  })

  it("flags a code commit with no preceding failing test-only commit", () => {
    const commits = [commit("c1", "code", ["apps/api/app/main.py"])]
    const evidence = new Map([["c1", [{ sha: "c1", service: "api-test", args: [], passed: true, exitCode: 0, at: 1 }]]])
    const result = redgreenCheck(commits, contract, evidence)
    expect(result.ok).toBe(false)
    expect(result.violations[0].kind).toBe("no-evidence")
  })

  it("flags a test-only commit with no failing record", () => {
    const commits = [commit("t1", "RED test", ["apps/api/tests/test_x.py"])]
    const evidence = new Map([["t1", [{ sha: "t1", service: "api-test", args: [], passed: true, exitCode: 0, at: 1 }]]])
    const result = redgreenCheck(commits, contract, evidence)
    expect(result.violations[0].kind).toBe("missing-red")
  })

  it("flags a green code commit missing its passing record", () => {
    const commits = [
      commit("t1", "RED test", ["apps/api/tests/test_x.py"]),
      commit("c1", "code", ["apps/api/app/main.py"]),
    ]
    const evidence = new Map([["t1", [{ sha: "t1", service: "api-test", args: [], passed: false, exitCode: 1, at: 1 }]]])
    const result = redgreenCheck(commits, contract, evidence)
    expect(result.violations[0].kind).toBe("missing-green")
  })
})

describe("bootstrap: contract assessment", () => {
  it("missing root compose.yml -> missing-compose", () => {
    const dir = mkdtempSync(join(tmpdir(), "boot-"))
    tmpDirs.push(dir)
    expect(assessContract(dir, readFrontMatter(dir))).toBe("missing-compose")
  })

  it("compose.yml present but AGENTS.md absent -> missing-front-matter", () => {
    const dir = mkdtempSync(join(tmpdir(), "boot-"))
    tmpDirs.push(dir)
    writeFileSync(join(dir, "compose.yml"), "services: {}\n")
    expect(assessContract(dir, readFrontMatter(dir))).toBe("missing-front-matter")
  })

  it("AGENTS.md present without a front-matter block -> missing-front-matter", () => {
    const dir = mkdtempSync(join(tmpdir(), "boot-"))
    tmpDirs.push(dir)
    writeFileSync(join(dir, "compose.yml"), "services: {}\n")
    writeFileSync(join(dir, "AGENTS.md"), "# AGENTS.md\n\nInstructions only, no front matter.\n")
    expect(assessContract(dir, readFrontMatter(dir))).toBe("missing-front-matter")
  })

  it("declared-but-empty front matter (services: {}, no generator, no smoke) -> declared-empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "boot-"))
    tmpDirs.push(dir)
    writeFileSync(join(dir, "compose.yml"), "services: {}\n")
    writeFileSync(join(dir, "AGENTS.md"), "---\n  services: {}\n---\n")
    expect(assessContract(dir, readFrontMatter(dir))).toBe("declared-empty")
  })

  it("an unterminated front-matter block is malformed, not missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "boot-"))
    tmpDirs.push(dir)
    writeFileSync(join(dir, "compose.yml"), "services: {}\n")
    writeFileSync(join(dir, "AGENTS.md"), '---\n  services: { all: "test" }\n')
    expect(assessContract(dir, readFrontMatter(dir))).toBe("malformed-front-matter")
  })

  it("an unterminated block is malformed even when compose.yml is missing too", () => {
    const dir = mkdtempSync(join(tmpdir(), "boot-"))
    tmpDirs.push(dir)
    writeFileSync(join(dir, "AGENTS.md"), '---\n  services: { all: "test" }\n')
    expect(assessContract(dir, readFrontMatter(dir))).toBe("malformed-front-matter")
  })

  it("declared-empty takes precedence over a missing compose.yml", () => {
    const dir = mkdtempSync(join(tmpdir(), "boot-"))
    tmpDirs.push(dir)
    writeFileSync(join(dir, "AGENTS.md"), "---\n  services: {}\n---\n")
    expect(assessContract(dir, readFrontMatter(dir))).toBe("declared-empty")
  })

  it("a valid contract -> ok", () => {
    const dir = mkdtempSync(join(tmpdir(), "boot-"))
    tmpDirs.push(dir)
    writeFileSync(join(dir, "compose.yml"), "services: {}\n")
    writeFileSync(join(dir, "AGENTS.md"), `---\n${FRONT_MATTER.trim()}\n---\n`)
    expect(assessContract(dir, readFrontMatter(dir))).toBe("ok")
  })
})

describe("bootstrap: eligible reasons", () => {
  it("isBootstrapReason is true only for the two missing-initial-contract reasons", () => {
    expect(isBootstrapReason("missing-compose")).toBe(true)
    expect(isBootstrapReason("missing-front-matter")).toBe(true)
    const others: EnsureReason[] = [
      "declared-empty-contract",
      "malformed-front-matter",
      "contract-removed-mid-slice",
      "backend-unavailable",
      "mountpoint-preflight",
      "sidecar-failed",
      "compose-build-failed",
      "warmup-failed",
    ]
    for (const reason of others) expect(isBootstrapReason(reason), reason).toBe(false)
  })
})

describe("bootstrap: evidence record", () => {
  it("bootstrapEvidence is failing evidence with the bootstrap marker, sha/service/args/at round-trip", () => {
    const rec = bootstrapEvidence({ sha: "0123456789abcdef", service: "bootstrap", args: ["-k", "focus"], at: 123 })
    expect(rec).toEqual({
      sha: "0123456789abcdef",
      service: "bootstrap",
      args: ["-k", "focus"],
      passed: false,
      exitCode: 1,
      at: 123,
      bootstrap: true,
    })
  })
})

describe("bootstrap: gate planning", () => {
  it("plans static checks before dynamic steps for a full contract", () => {
    const plan = planGateSteps(parseTestContract(FRONT_MATTER))
    expect(plan).toEqual({
      steps: [
        "static check lint (app-lint)",
        "static check typecheck (app-typecheck)",
        "test service test",
        "test service api-test",
        "test service web-test",
        "generation drift check",
        "full profile up (production images)",
        "smoke check (smoke)",
      ],
    })
  })

  it("refuses an empty contract — the default fallback is never a valid gate contract", () => {
    const plan = planGateSteps(parseTestContract(""))
    expect("refusal" in plan).toBe(true)
  })

  it("refuses an e2e-only contract (no test services, no generator, no smoke)", () => {
    const plan = planGateSteps(parseTestContract('  services: { e2e: "e2e" }\n'))
    expect("refusal" in plan).toBe(true)
  })

  it("refuses a checks-only contract — static checks supplement, never replace, dynamic verification", () => {
    const plan = planGateSteps(parseTestContract('  checks: { lint: "app-lint", typecheck: "app-typecheck" }\n'))
    if (!("refusal" in plan)) throw new Error("expected a refusal for a checks-only contract")
    expect(plan.refusal).toContain("static checks supplement")
  })

  it("a declared smoke still plans the full-profile up and smoke steps", () => {
    const plan = planGateSteps(parseTestContract('  services: { smoke: "smoke" }\n'))
    expect(plan).toEqual({ steps: ["full profile up (production images)", "smoke check (smoke)"] })
  })
})

describe("bootstrap: red/green regression", () => {
  const contract = parseTestContract(FRONT_MATTER)
  const commit = (sha: string, subject: string, files: string[]) => ({ sha, subject, files })

  it("a test-only commit whose only record is a bootstrap record satisfies the RED requirement", () => {
    const commits = [
      commit("red1", "onboarding tests", ["apps/api/tests/test_x.py"]),
      commit("grn1", "onboarding contract + code", ["compose.yml", "AGENTS.md", "apps/api/app/main.py"]),
    ]
    const evidence = new Map([
      ["red1", [bootstrapEvidence({ sha: "red1", service: "bootstrap", args: [], at: 1 })]],
      ["grn1", [{ sha: "grn1", service: "api-test", args: [], passed: true, exitCode: 0, at: 2 }]],
    ])
    expect(redgreenCheck(commits, contract, evidence).ok).toBe(true)
  })

  it("the code commit after a bootstrap RED still needs a passing record", () => {
    const commits = [
      commit("red1", "onboarding tests", ["apps/api/tests/test_x.py"]),
      commit("grn1", "onboarding contract + code", ["compose.yml", "AGENTS.md", "apps/api/app/main.py"]),
    ]
    const evidence = new Map([
      ["red1", [bootstrapEvidence({ sha: "red1", service: "bootstrap", args: [], at: 1 })]],
    ])
    const result = redgreenCheck(commits, contract, evidence)
    expect(result.ok).toBe(false)
    expect(result.violations[0].kind).toBe("missing-green")
  })

  it("a bootstrap record never satisfies the GREEN requirement", () => {
    const commits = [
      commit("red1", "onboarding tests", ["apps/api/tests/test_x.py"]),
      commit("grn1", "onboarding contract + code", ["compose.yml", "AGENTS.md", "apps/api/app/main.py"]),
    ]
    const evidence = new Map([
      ["red1", [bootstrapEvidence({ sha: "red1", service: "bootstrap", args: [], at: 1 })]],
      ["grn1", [bootstrapEvidence({ sha: "grn1", service: "bootstrap", args: [], at: 2 })]],
    ])
    const result = redgreenCheck(commits, contract, evidence)
    expect(result.ok).toBe(false)
    expect(result.violations[0].kind).toBe("missing-green")
  })
})

describe("redaction", () => {
  it("redacts .env values and token shapes, keeps the tail bounded", () => {
    const long = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n")
    const out = redactTail(`${long}\nsecretvalue\nsk-abcdefghijklmnop123456`, 200, ["secretvalue"])
    expect(out).not.toContain("secretvalue")
    expect(out).not.toContain("sk-abcdefghijklmnop123456")
    expect(out.split("\n")).toHaveLength(200)
    expect(out.startsWith("line 302")).toBe(true)
  })

  it("collects env values from the worktree's .env files (values never logged)", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-"))
    tmpDirs.push(dir)
    writeFileSync(join(dir, ".env"), 'A_TOKEN="supersecret123"\nPLAIN=abc123\nEMPTY=\n')
    expect(envSecrets(dir)).toContain("supersecret123")
    expect(envSecrets(dir)).toContain("abc123")
  })
})

describe("bootstrap wiring through the plugin (no Docker)", () => {
  const gitWorktree = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "boot-wt-"))
    tmpDirs.push(dir)
    execSync("git init -q -b main", { cwd: dir })
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true })
      writeFileSync(join(dir, name), content)
    }
    execSync("git add -A && git -c commit.gpgsign=false -c user.name=t -c user.email=t@t commit -qm init", { cwd: dir })
    return dir
  }

  const setupSandbox = async (worktree: string) => {
    const tools = new Map<string, any>()
    const values = new Map<string, any>()
    const storage = {
      get: vi.fn(async (key: string) => structuredClone(values.get(key))),
      set: vi.fn(async (key: string, value: any) => void values.set(key, structuredClone(value))),
      remove: vi.fn(async (key: string) => void values.delete(key)),
      scan: vi.fn(async ({ prefix }: { prefix: string }) => ({
        entries: [...values.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => ({ key, value: structuredClone(value) })),
        next: undefined,
      })),
    }
    const ctx = {
      options: {},
      location: { directory: worktree },
      storage,
      tool: {
        transform: async (callback: any) =>
          callback({ namespace: vi.fn(), add: (tool: any) => tools.set(tool.name, tool) }),
      },
      session: { get: vi.fn(async () => ({ location: { directory: worktree } })) },
    }
    await sandboxPlugin.setup(ctx as any)
    return { tools, values }
  }

  const evidenceFor = (values: Map<string, any>, sha: string) =>
    [...values.entries()].filter(([key]) => key.startsWith(`evidence/${sha}/`)).map(([, value]) => value)

  it("sandbox_test records bootstrap RED against HEAD when compose.yml is missing, without a backend", async () => {
    const wt = gitWorktree({ "apps/api/tests/test_x.py": "def test_x(): pass\n" })
    const { tools, values } = await setupSandbox(wt)
    const res = await tools.get("test").execute({ slice: "11" }, { sessionID: "s1" })
    expect(res.content.startsWith("RED (bootstrap)")).toBe(true)
    expect(res.content).toContain("the missing initial contract is the failure")
    const sha = execSync("git rev-parse HEAD", { cwd: wt }).toString().trim()
    const records = evidenceFor(values, sha)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      sha,
      service: "bootstrap",
      args: [],
      passed: false,
      exitCode: 1,
      bootstrap: true,
    })
    expect(typeof records[0].at).toBe("number")
  })

  it("same bootstrap RED when AGENTS.md has no front-matter block but compose.yml exists", async () => {
    const wt = gitWorktree({
      "compose.yml": "services: {}\n",
      "AGENTS.md": "# AGENTS.md\n\nInstructions only, no front matter.\n",
    })
    const { tools, values } = await setupSandbox(wt)
    const res = await tools.get("test").execute({ slice: "11", service: "test" }, { sessionID: "s1" })
    expect(res.content.startsWith("RED (bootstrap)")).toBe(true)
    const sha = execSync("git rev-parse HEAD", { cwd: wt }).toString().trim()
    const records = evidenceFor(values, sha)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ sha, service: "test", passed: false, exitCode: 1, bootstrap: true })
  })

  it("a declared-but-empty contract stays BLOCKED for sandbox_test and records nothing", async () => {
    const wt = gitWorktree({ "compose.yml": "services: {}\n", "AGENTS.md": "---\n  services: {}\n---\n" })
    const { tools, values } = await setupSandbox(wt)
    const res = await tools.get("test").execute({ slice: "11" }, { sessionID: "s1" })
    expect(res.content.startsWith("BLOCKED")).toBe(true)
    expect(res.content).not.toContain("RED (bootstrap)")
    expect([...values.keys()].some((key) => key.startsWith("evidence/"))).toBe(false)
  })

  it("sandbox_up stays BLOCKED for a missing contract (only sandbox_test converts)", async () => {
    const wt = gitWorktree({ "apps/api/tests/test_x.py": "def test_x(): pass\n" })
    const { tools, values } = await setupSandbox(wt)
    const res = await tools.get("up").execute({ slice: "11" }, { sessionID: "s1" })
    expect(res.content.startsWith("BLOCKED")).toBe(true)
    expect([...values.keys()].some((key) => key.startsWith("evidence/"))).toBe(false)
  })

  it("sandbox_test on an unknown service is an actionable BLOCKED, recording nothing", async () => {
    const wt = gitWorktree({ "compose.yml": "services: {}\n", "AGENTS.md": `---\n${FRONT_MATTER.trim()}\n---\n` })
    const { tools, values } = await setupSandbox(wt)
    values.set("sandboxes/local", { id: sandboxId("local", wt), backend: "docker", createdAt: Date.now() })
    const res = await tools.get("test").execute({ slice: "11", service: "nope-svc" }, { sessionID: "s1" })
    expect(res.content.startsWith("BLOCKED")).toBe(true)
    expect(res.content).toContain("not declared in the AGENTS.md test contract")
    expect([...values.keys()].some((key) => key.startsWith("evidence/"))).toBe(false)
  })

  it("sandbox_test never accepts a static-check service, so lint can never become RED/GREEN evidence", async () => {
    const wt = gitWorktree({ "compose.yml": "services: {}\n", "AGENTS.md": `---\n${FRONT_MATTER.trim()}\n---\n` })
    const { tools, values } = await setupSandbox(wt)
    values.set("sandboxes/local", { id: sandboxId("local", wt), backend: "docker", createdAt: Date.now() })
    const res = await tools.get("test").execute({ slice: "11", service: "app-lint" }, { sessionID: "s1" })
    expect(res.content.startsWith("BLOCKED")).toBe(true)
    expect(res.content).toContain("not declared in the AGENTS.md test contract")
    expect([...values.keys()].some((key) => key.startsWith("evidence/"))).toBe(false)
  })

  it("sandbox_check on an unknown check is an actionable BLOCKED, recording nothing", async () => {
    const wt = gitWorktree({ "compose.yml": "services: {}\n", "AGENTS.md": `---\n${FRONT_MATTER.trim()}\n---\n` })
    const { tools, values } = await setupSandbox(wt)
    values.set("sandboxes/local", { id: sandboxId("local", wt), backend: "docker", createdAt: Date.now() })
    const res = await tools.get("check").execute({ slice: "11", check: "nope" }, { sessionID: "s1" })
    expect(res.content.startsWith("BLOCKED")).toBe(true)
    expect(res.content).toContain("not declared in the AGENTS.md test contract")
    expect([...values.keys()].some((key) => key.startsWith("evidence/"))).toBe(false)
  })

  it("sandbox_check with no declared checks is an actionable BLOCKED, recording nothing", async () => {
    const wt = gitWorktree({ "compose.yml": "services: {}\n", "AGENTS.md": '---\n  services: { all: "test" }\n---\n' })
    const { tools, values } = await setupSandbox(wt)
    values.set("sandboxes/local", { id: sandboxId("local", wt), backend: "docker", createdAt: Date.now() })
    const res = await tools.get("check").execute({ slice: "11" }, { sessionID: "s1" })
    expect(res.content.startsWith("BLOCKED")).toBe(true)
    expect(res.content).toContain("declares no static checks")
    expect([...values.keys()].some((key) => key.startsWith("evidence/"))).toBe(false)
  })

  it("a declared-but-empty contract stays BLOCKED even when compose.yml is missing too", async () => {
    const wt = gitWorktree({ "AGENTS.md": "---\n  services: {}\n---\n" })
    const { tools, values } = await setupSandbox(wt)
    const res = await tools.get("test").execute({ slice: "11" }, { sessionID: "s1" })
    expect(res.content.startsWith("BLOCKED")).toBe(true)
    expect(res.content).not.toContain("RED (bootstrap)")
    expect([...values.keys()].some((key) => key.startsWith("evidence/"))).toBe(false)
  })

  it("an unterminated front-matter block stays BLOCKED, never bootstrap RED", async () => {
    const wt = gitWorktree({
      "compose.yml": "services: {}\n",
      "AGENTS.md": '---\n  services: { all: "test" }\n',
    })
    const { tools, values } = await setupSandbox(wt)
    const res = await tools.get("test").execute({ slice: "11" }, { sessionID: "s1" })
    expect(res.content.startsWith("BLOCKED")).toBe(true)
    expect(res.content).toContain("never closed")
    expect(res.content).not.toContain("RED (bootstrap)")
    expect([...values.keys()].some((key) => key.startsWith("evidence/"))).toBe(false)
  })

  it("a contract emptied after warm-up is BLOCKED on the cached path too — no evidence from an invalid contract", async () => {
    const wt = gitWorktree({ "compose.yml": "services: {}\n", "AGENTS.md": '---\n  services: { e2e: "test" }\n---\n' })
    const { tools, values } = await setupSandbox(wt)
    values.set("sandboxes/local", { id: sandboxId("local", wt), backend: "docker", createdAt: Date.now() })
    const res = await tools.get("test").execute({ slice: "11", service: "test" }, { sessionID: "s1" })
    expect(res.content.startsWith("BLOCKED")).toBe(true)
    expect(res.content).toContain("declares no dynamic verification steps")
    expect([...values.keys()].some((key) => key.startsWith("evidence/"))).toBe(false)
  })

  it("a contract removed after warm-up is BLOCKED, never bootstrap RED", async () => {
    const wt = gitWorktree({ "compose.yml": "services: {}\n", "AGENTS.md": `---\n${FRONT_MATTER.trim()}\n---\n` })
    const { tools, values } = await setupSandbox(wt)
    values.set("sandboxes/local", { id: sandboxId("local", wt), backend: "docker", createdAt: Date.now() })
    rmSync(join(wt, "compose.yml"))
    rmSync(join(wt, "AGENTS.md"))
    const res = await tools.get("test").execute({ slice: "11" }, { sessionID: "s1" })
    expect(res.content.startsWith("BLOCKED")).toBe(true)
    expect(res.content).toContain("sandbox was already created")
    expect(res.content).not.toContain("RED (bootstrap)")
    expect([...values.keys()].some((key) => key.startsWith("evidence/"))).toBe(false)
  })

  it("sandbox_gate never passes vacuously — an emptied contract BLOCKs even with a seeded sandbox", async () => {
    const wt = gitWorktree({ "compose.yml": "services: {}\n", "AGENTS.md": '---\n  services: { e2e: "e2e" }\n---\n' })
    const { tools, values } = await setupSandbox(wt)
    values.set("sandboxes/local", { id: sandboxId("local", wt), backend: "docker", createdAt: Date.now() })
    const res = await tools.get("gate").execute({ slice: "11" }, { sessionID: "s1" })
    expect(res.content.startsWith("BLOCKED")).toBe(true)
    expect(res.content).not.toContain("PASSED")
    expect([...values.keys()].some((key) => key.startsWith("evidence/"))).toBe(false)
  })
})

describe("integration with a real Docker daemon (docker backend)", () => {
  const dockerAvailable = (() => {
    try {
      execSync("docker info --format x", { stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 })
      return true
    } catch {
      return false
    }
  })()

  it.skipIf(!dockerAvailable)("up, focused test (RED and GREEN), down on a temporary compose project", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sandbox-int-"))
    tmpDirs.push(dir)
    execSync("git init -q -b main", { cwd: dir })
    writeFileSync(
      join(dir, "compose.yml"),
      [
        "services:",
        "  db:",
        "    image: alpine:3.20",
        "    command: [sleep, infinity]",
        "  test:",
        "    image: alpine:3.20",
        "    profiles: [test]",
        '    command: ["echo", "suite-ok"]',
        "    depends_on: [db]",
        "",
      ].join("\n"),
    )
    writeFileSync(join(dir, "AGENTS.md"), `---\n${FRONT_MATTER.trim()}\n---\n`)
    execSync("git add -A && git -c commit.gpgsign=false -c user.name=t -c user.email=t@t commit -qm init", { cwd: dir })

    const contract = parseTestContract(FRONT_MATTER.trim())
    const id = sandboxId("99", dir)
    const run = (argv: string[]) =>
      new Promise<{ code: number; out: string }>((resolve) => {
        const p = spawn(argv[0], argv.slice(1), { cwd: dir })
        let out = ""
        p.stdout?.on("data", (d) => (out += d))
        p.stderr?.on("data", (d) => (out += d))
        p.on("error", (e) => resolve({ code: 1, out: String(e) }))
        p.on("close", (code) => resolve({ code: code ?? 1, out }))
      })

    try {
      const warm = buildWarmArgv(contract, id)
      const build = await run(warm.build)
      expect(build.code).toBe(0)
      const up = await run(warm.up)
      expect(up.code).toBe(0)

      const green = await run(buildTestArgv(contract, id, "test", []))
      expect(green.code).toBe(0)
      expect(green.out).toContain("suite-ok")

      const red = await run(buildTestArgv(contract, id, "test", ["sh", "-c", "exit 3"]))
      expect(red.code).toBe(3)

      // side-by-side isolation: a second project with the same compose file works simultaneously
      const id2 = sandboxId("98", dir)
      const up2 = await run(buildWarmArgv(contract, id2).up)
      expect(up2.code).toBe(0)

      const down1 = await run(buildDownArgv(contract, id))
      const down2 = await run(buildDownArgv(contract, id2))
      expect(down1.code).toBe(0)
      expect(down2.code).toBe(0)
    } finally {
      execSync(
        `docker compose -p ${id} -f compose.yml down -v --remove-orphans >/dev/null 2>&1; ` +
        `docker compose -p ${sandboxId("98", dir)} -f compose.yml down -v --remove-orphans >/dev/null 2>&1 || true`,
        { cwd: dir },
      )
    }
  }, 240_000)
})

// ------------------------------------------------------------ mountpoint preflight
//
// Docker materializes missing host mountpoints as root: bind sources that do
// not exist, and — through the bind — the host-side mountpoints of volumes
// (anonymous or named) nested under a bind target (Rekalled #41). oc-sandbox
// must create every such path as the invoking user before any Compose
// operation that starts containers.

const UID = process.getuid?.() ?? 0
const GID = process.getgid?.() ?? 0

const mountFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "sandbox-mnt-"))
  tmpDirs.push(dir)
  return dir
}

const ownedByInvokingUser = (p: string) => {
  const st = statSync(p)
  expect(st.uid).toBe(UID)
  expect(st.gid).toBe(GID)
}

const byPath = (a: PlannedMountpoint, b: PlannedMountpoint) => (a.hostPath < b.hostPath ? -1 : 1)

/** The Rekalled #41 effective mount shape, as `docker compose config` renders it. */
const nestedModel = (wt: string): ComposeModel => ({
  services: {
    "api-client-gen": {
      volumes: [
        { type: "bind", source: join(wt, "apps/api"), target: "/repo/apps/api" },
        { type: "volume", target: "/repo/apps/api/.venv" },
        { type: "bind", source: "./packages/api-client", target: "/repo/packages/api-client" },
        { type: "volume", target: "/repo/packages/api-client/node_modules" },
      ],
    },
  },
})

describe("planMountpoints", () => {
  it("plans bind sources and nested anonymous-volume mountpoints (the Rekalled #41 shape)", () => {
    const wt = mountFixture()
    expect(planMountpoints(nestedModel(wt), wt).sort(byPath)).toEqual([
      { hostPath: join(wt, "apps/api"), service: "api-client-gen", kind: "bind", inside: true, createHostPath: true },
      { hostPath: join(wt, "apps/api/.venv"), service: "api-client-gen", kind: "nested-volume", inside: true },
      { hostPath: join(wt, "packages/api-client"), service: "api-client-gen", kind: "bind", inside: true, createHostPath: true },
      {
        hostPath: join(wt, "packages/api-client/node_modules"),
        service: "api-client-gen",
        kind: "nested-volume",
        inside: true,
      },
    ])
  })

  it("flags binds that resolve outside the worktree", () => {
    const wt = mountFixture()
    const model: ComposeModel = {
      services: {
        svc: {
          volumes: [
            { type: "bind", source: "../../shared-cache", target: "/repo/shared" },
            { type: "volume", target: "/repo/shared/.build" },
          ],
        },
      },
    }
    expect(planMountpoints(model, wt).sort(byPath)).toEqual([
      { hostPath: resolve(wt, "../../shared-cache"), service: "svc", kind: "bind", inside: false, createHostPath: true },
      {
        hostPath: resolve(wt, "../../shared-cache/.build"),
        service: "svc",
        kind: "nested-volume",
        inside: false,
      },
    ])
  })

  it("ignores named volumes, tmpfs and volumes not nested under a bind", () => {
    const wt = mountFixture()
    const model: ComposeModel = {
      services: {
        svc: {
          volumes: [
            { type: "volume", source: "cache", target: "/repo/cache" },
            { type: "tmpfs", target: "/repo/tmp" },
            { type: "volume", target: "/repo/plain" },
          ],
        },
      },
    }
    expect(planMountpoints(model, wt)).toEqual([])
  })

  it("plans nested named volumes too — the daemon creates those mountpoints through the bind as root", () => {
    const wt = mountFixture()
    const model: ComposeModel = {
      services: {
        svc: {
          volumes: [
            { type: "bind", source: join(wt, "app"), target: "/app" },
            { type: "volume", source: "cache", target: "/app/cache" },
            { type: "volume", source: "cache", target: "/standalone" },
          ],
        },
      },
    }
    expect(planMountpoints(model, wt).sort(byPath)).toEqual([
      { hostPath: join(wt, "app"), service: "svc", kind: "bind", inside: true, createHostPath: true },
      { hostPath: join(wt, "app/cache"), service: "svc", kind: "nested-volume", inside: true },
    ])
  })

  it("carries bind.create_host_path: false so a missing source blocks instead of being created", () => {
    const wt = mountFixture()
    const model: ComposeModel = {
      services: {
        svc: {
          volumes: [
            { type: "bind", source: join(wt, "config"), target: "/config", bind: { create_host_path: false } },
            { type: "bind", source: join(wt, "plain"), target: "/plain" },
          ],
        },
      },
    }
    expect(planMountpoints(model, wt).sort(byPath)).toEqual([
      { hostPath: join(wt, "config"), service: "svc", kind: "bind", inside: true, createHostPath: false },
      { hostPath: join(wt, "plain"), service: "svc", kind: "bind", inside: true, createHostPath: true },
    ])
  })

  it("nests volumes under the deepest covering bind", () => {
    const wt = mountFixture()
    const model: ComposeModel = {
      services: {
        svc: {
          volumes: [
            { type: "bind", source: join(wt, "repo"), target: "/repo" },
            { type: "bind", source: join(wt, "apps/api"), target: "/repo/apps/api" },
            { type: "volume", target: "/repo/apps/api/.venv" },
          ],
        },
      },
    }
    expect(planMountpoints(model, wt).sort(byPath)).toContainEqual({
      hostPath: join(wt, "apps/api/.venv"),
      service: "svc",
      kind: "nested-volume",
      inside: true,
    })
  })
})

describe("materializeMountpoints", () => {
  it("creates nested volume mountpoints as the invoking uid/gid and verifies existing binds", () => {
    const wt = mountFixture()
    mkdirSync(join(wt, "apps/api"), { recursive: true })
    mkdirSync(join(wt, "packages/api-client"), { recursive: true })

    const result = materializeMountpoints(wt, planMountpoints(nestedModel(wt), wt))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.created.sort()).toEqual([join(wt, "apps/api/.venv"), join(wt, "packages/api-client/node_modules")])

    ownedByInvokingUser(join(wt, "apps/api/.venv"))
    ownedByInvokingUser(join(wt, "packages/api-client/node_modules"))
    ownedByInvokingUser(join(wt, "apps/api"))
    ownedByInvokingUser(join(wt, "packages/api-client"))
  })

  it("creates missing bind sources recursively as directories, as the daemon would (but owned)", () => {
    const wt = mountFixture()
    const model: ComposeModel = {
      services: { svc: { volumes: [{ type: "bind", source: join(wt, "outputs/dist"), target: "/dist" }] } },
    }
    const result = materializeMountpoints(wt, planMountpoints(model, wt), { trackedFile: () => "untracked" })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.created).toEqual([join(wt, "outputs"), join(wt, "outputs/dist")])
    expect(statSync(join(wt, "outputs/dist")).isDirectory()).toBe(true)
    ownedByInvokingUser(join(wt, "outputs/dist"))
  })

  it("is idempotent — a second run verifies the same paths and creates nothing", () => {
    const wt = mountFixture()
    mkdirSync(join(wt, "apps/api"), { recursive: true })
    mkdirSync(join(wt, "packages/api-client"), { recursive: true })
    const planned = planMountpoints(nestedModel(wt), wt)
    const first = materializeMountpoints(wt, planned)
    expect(first.ok).toBe(true)
    const second = materializeMountpoints(wt, planned)
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.created).toEqual([])
  })

  it("plans across multiple services with long-form (config-normalized) mounts and dedups paths", () => {
    const wt = mountFixture()
    const longFormMounts = (read_only?: boolean): { volumes: unknown[] } => ({
      volumes: [
        { type: "bind", source: join(wt, "shared"), target: "/repo/shared", read_only },
        { type: "volume", target: "/repo/shared/cache" },
      ],
    })
    const model = {
      services: { alpha: longFormMounts(true), beta: longFormMounts() },
    } as unknown as ComposeModel
    const result = materializeMountpoints(wt, planMountpoints(model, wt), { trackedFile: () => "untracked" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(new Set(result.created).size).toBe(result.created.length)
      expect(result.created).toEqual([join(wt, "shared"), join(wt, "shared/cache")].sort())
    }
    ownedByInvokingUser(join(wt, "shared/cache"))
  })

  it("fails closed on a foreign-owned existing mountpoint and never removes it", () => {
    const wt = mountFixture()
    mkdirSync(join(wt, ".venv"))
    const planned: PlannedMountpoint[] = [
      { hostPath: join(wt, ".venv"), service: "api-client-gen", kind: "nested-volume", inside: true },
    ]
    const result = materializeMountpoints(wt, planned, { uid: UID + 1, gid: GID })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.blocked).toContain(join(wt, ".venv"))
      expect(result.blocked).toContain(`uid ${UID}:gid ${GID}`)
      expect(result.blocked).toContain(`expected uid ${UID + 1}:gid ${GID}`)
      expect(result.blocked).toContain("api-client-gen")
      expect(result.blocked).toContain("never chowns or removes")
    }
    expect(existsSync(join(wt, ".venv"))).toBe(true) // never removed
  })

  it("fails closed when git cannot verify a missing bind source", () => {
    const wt = mountFixture()
    const model: ComposeModel = {
      services: { svc: { volumes: [{ type: "bind", source: join(wt, "maybe-tracked"), target: "/mt" }] } },
    }
    const result = materializeMountpoints(wt, planMountpoints(model, wt), { trackedFile: () => "unknown" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.blocked).toContain(join(wt, "maybe-tracked"))
      expect(result.blocked).toContain("cannot verify")
    }
    expect(existsSync(join(wt, "maybe-tracked"))).toBe(false) // nothing materialized on an unknown lookup
  })

  it("fails closed on a missing bind source that git tracks as a file", () => {
    const wt = mountFixture()
    mkdirSync(join(wt, "apps/api"), { recursive: true })
    const model: ComposeModel = {
      services: { svc: { volumes: [{ type: "bind", source: join(wt, "apps/api/requirements.txt"), target: "/req.txt" }] } },
    }
    const result = materializeMountpoints(wt, planMountpoints(model, wt), { trackedFile: () => "tracked" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.blocked).toContain("git tracks a file")
    expect(existsSync(join(wt, "apps/api/requirements.txt"))).toBe(false) // no rogue directory either
  })

  it("honours bind.create_host_path: false — blocks instead of creating the source", () => {
    const wt = mountFixture()
    const model: ComposeModel = {
      services: {
        svc: {
          volumes: [
            { type: "bind", source: join(wt, "config"), target: "/config", bind: { create_host_path: false } },
            { type: "bind", source: join(wt, "plain"), target: "/plain" },
          ],
        },
      },
    }
    const result = materializeMountpoints(wt, planMountpoints(model, wt), { trackedFile: () => "untracked" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.blocked).toContain(join(wt, "config"))
      expect(result.blocked).toContain("create_host_path")
    }
    expect(existsSync(join(wt, "config"))).toBe(false) // oc-sandbox did not create it either

    // with the no-create source present, the permitted bind is still prepared
    mkdirSync(join(wt, "config"))
    const ok = materializeMountpoints(wt, planMountpoints(model, wt), { trackedFile: () => "untracked" })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.created).toEqual([join(wt, "plain")])
    ownedByInvokingUser(join(wt, "plain"))
  })

  it("merges requirements per path — a file bind cannot suppress a directory requirement from another service", () => {
    const wt = mountFixture()
    mkdirSync(join(wt, "data"), { recursive: true })
    writeFileSync(join(wt, "data/cache"), "a file")
    const fileBind: PlannedMountpoint = { hostPath: join(wt, "data/cache"), service: "svc-a", kind: "bind", inside: true }
    const dirMount: PlannedMountpoint = { hostPath: join(wt, "data/cache"), service: "svc-b", kind: "nested-volume", inside: true }
    for (const planned of [
      [fileBind, dirMount],
      [dirMount, fileBind],
    ]) {
      const result = materializeMountpoints(wt, planned)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.blocked).toContain(join(wt, "data/cache"))
        expect(result.blocked).toContain("svc-a")
        expect(result.blocked).toContain("svc-b")
      }
    }
    expect(statSync(join(wt, "data/cache")).isFile()).toBe(true) // untouched
  })

  it("fails closed when an existing file blocks a nested volume mountpoint", () => {
    const wt = mountFixture()
    mkdirSync(join(wt, "apps/api"), { recursive: true })
    mkdirSync(join(wt, "packages/api-client"), { recursive: true })
    writeFileSync(join(wt, "apps/api/.venv"), "not a mountpoint")
    const result = materializeMountpoints(wt, planMountpoints(nestedModel(wt), wt))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.blocked).toContain(join(wt, "apps/api/.venv"))
    expect(statSync(join(wt, "apps/api/.venv")).isFile()).toBe(true)
  })

  it("fails closed when a file sits in the directory chain of a missing bind", () => {
    const wt = mountFixture()
    writeFileSync(join(wt, "cfg"), "a file")
    const model: ComposeModel = {
      services: { svc: { volumes: [{ type: "bind", source: join(wt, "cfg/app.yaml"), target: "/app.yaml" }] } },
    }
    const result = materializeMountpoints(wt, planMountpoints(model, wt), { trackedFile: () => "untracked" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.blocked).toContain(join(wt, "cfg"))
  })

  it("preserves existing file binds — verifies them, never mkdirs over them", () => {
    const wt = mountFixture()
    mkdirSync(join(wt, "apps/api"), { recursive: true })
    writeFileSync(join(wt, "apps/api/requirements.txt"), "fastapi")
    const model: ComposeModel = {
      services: { svc: { volumes: [{ type: "bind", source: join(wt, "apps/api/requirements.txt"), target: "/req.txt" }] } },
    }
    const result = materializeMountpoints(wt, planMountpoints(model, wt))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.created).toEqual([])
    expect(statSync(join(wt, "apps/api/requirements.txt")).isFile()).toBe(true)
    ownedByInvokingUser(join(wt, "apps/api/requirements.txt"))
  })

  it("fails closed on symlink escape and chained symlinks, allows in-worktree symlinks", () => {
    const wt = mountFixture()

    // direct escape
    symlinkSync(tmpdir(), join(wt, "out-link"))
    const direct = materializeMountpoints(wt, [
      { hostPath: join(wt, "out-link"), service: "svc", kind: "bind", inside: true },
    ])
    expect(direct.ok).toBe(false)
    if (!direct.ok) {
      expect(direct.blocked).toContain("outside the worktree")
      expect(direct.blocked).toContain(join(wt, "out-link"))
    }

    // chained link: a -> b, b -> outside
    symlinkSync(join(wt, "b"), join(wt, "a"))
    symlinkSync(tmpdir(), join(wt, "b"))
    const chained = materializeMountpoints(wt, [
      { hostPath: join(wt, "a"), service: "svc", kind: "bind", inside: true },
    ])
    expect(chained.ok).toBe(false)
    if (!chained.ok) expect(chained.blocked).toContain("outside the worktree")

    // dangling link whose target passes through an outside link component
    symlinkSync(tmpdir(), join(wt, "x"))
    symlinkSync(join(wt, "x/y"), join(wt, "d"))
    const dangling = materializeMountpoints(wt, [
      { hostPath: join(wt, "d"), service: "svc", kind: "bind", inside: true },
    ])
    expect(dangling.ok).toBe(false)
    if (!dangling.ok) expect(dangling.blocked).toContain("outside the worktree")

    // a symlink to a sibling directory inside the worktree is fine, and
    // nested mountpoints through it land on the real target
    symlinkSync("real", join(wt, "in-link"))
    const inside = materializeMountpoints(wt, [
      { hostPath: join(wt, "in-link"), service: "svc", kind: "bind", inside: true },
      { hostPath: join(wt, "in-link/.venv"), service: "svc", kind: "nested-volume", inside: true },
    ])
    expect(inside.ok).toBe(true)
    expect(existsSync(join(wt, "real/.venv"))).toBe(true)
    ownedByInvokingUser(join(wt, "real/.venv"))
  })

  it("fails closed on a missing bind outside the worktree, skips one that exists", () => {
    const wt = mountFixture()
    const missing = { hostPath: resolve(wt, "../../no-such-mount-source"), service: "svc", kind: "bind" as const, inside: false }
    const blocked = materializeMountpoints(wt, [missing])
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.blocked).toContain("outside the worktree")
      expect(blocked.blocked).toContain("no-such-mount-source")
    }

    const existing = { hostPath: tmpdir(), service: "svc", kind: "bind" as const, inside: false }
    expect(materializeMountpoints(wt, [existing]).ok).toBe(true)
  })

  it("returns BLOCKED, not an exception, when the worktree itself is gone", () => {
    const gone = join(tmpdir(), "sandbox-mnt-gone-xyz")
    const result = materializeMountpoints(gone, [
      { hostPath: join(gone, "venv"), service: "svc", kind: "nested-volume", inside: true },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.blocked).toContain(gone)
  })

  it("blocks when the mountpoint parent is not owned by the invoking uid/gid (setgid or foreign group)", () => {
    const wt = mountFixture()
    const result = materializeMountpoints(
      wt,
      [{ hostPath: join(wt, "venv"), service: "svc", kind: "nested-volume", inside: true }],
      { gid: GID + 1 },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.blocked).toContain(`uid ${UID}:gid ${GID + 1}`)
      expect(result.blocked).toContain("changed during preflight")
    }
    expect(existsSync(join(wt, "venv"))).toBe(false) // nothing created under a foreign-owned parent
  })

  it("is a no-op for projects without nested volumes", () => {
    const wt = mountFixture()
    mkdirSync(join(wt, "apps/api"), { recursive: true })
    const model: ComposeModel = {
      services: { test: { volumes: [{ type: "bind", source: join(wt, "apps/api"), target: "/repo/apps/api" }] } },
    }
    const before = readdirSync(wt)
    const result = materializeMountpoints(wt, planMountpoints(model, wt))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.created).toEqual([])
    expect(readdirSync(wt)).toEqual(before)
  })
})

describe("prepareMountpoints (compose config orchestration)", () => {
  it("renders with the sandbox project name and the contract profiles, excluding other declared profiles", async () => {
    const wt = mountFixture()
    mkdirSync(join(wt, "apps/api"), { recursive: true })
    mkdirSync(join(wt, "packages/api-client"), { recursive: true })
    const model = nestedModel(wt)
    const calls: string[][] = []
    const runCompose = async (argv: string[]) => {
      calls.push(argv)
      if (argv.at(-1) === "--profiles") return { exitCode: 0, stdout: "dev\ntest\nfull\n", stderr: "" }
      return { exitCode: 0, stdout: JSON.stringify(model), stderr: "" }
    }

    const result = await prepareMountpoints(wt, "compose.yml", { runCompose, id: "s7-abc123", profiles: ["test", "full"] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.created).toContain(join(wt, "apps/api/.venv"))
    expect(calls[0]).toEqual(buildProfileListArgv("compose.yml", "s7-abc123"))
    expect(calls[1]).toEqual(buildComposeConfigArgv("compose.yml", ["test", "full"], "s7-abc123"))
    expect(calls[1].join(" ")).not.toContain("--profile dev")
  })

  it("fails closed when the model cannot be rendered, with the output redacted and the CLI prerequisite named", async () => {
    const wt = mountFixture()
    const runCompose = async (argv: string[]) =>
      argv.at(-1) === "--profiles"
        ? { exitCode: 0, stdout: "test\n", stderr: "" }
        : { exitCode: 1, stdout: "", stderr: "interpolation failed: SECRETVALUE is undefined" }

    const result = await prepareMountpoints(wt, "compose.yml", { runCompose, secrets: ["SECRETVALUE"] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.blocked).toContain("mountpoint preflight")
      expect(result.blocked).not.toContain("SECRETVALUE")
      expect(result.blocked).toContain("[redacted]")
      expect(result.blocked).toContain("docker CLI with the compose plugin")
    }
  })

  it("names the CLI prerequisite when profile discovery itself fails (no docker binary)", async () => {
    const wt = mountFixture()
    const runCompose = async () => ({ exitCode: 1, stdout: "", stderr: "Error: spawn docker ENOENT" })
    const result = await prepareMountpoints(wt, "compose.yml", { runCompose })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.blocked).toContain("cannot read the compose profiles")
      expect(result.blocked).toContain("docker CLI with the compose plugin")
    }
  })

  it("sysbox cross-check: blocks when process env changes the mounts, passes when it does not", async () => {
    const wt = mountFixture()
    mkdirSync(join(wt, "apps/api"), { recursive: true })
    mkdirSync(join(wt, "packages/api-client"), { recursive: true })
    const model = nestedModel(wt)
    const otherModel: ComposeModel = {
      services: { gen: { volumes: [{ type: "bind", source: join(wt, "elsewhere"), target: "/repo/elsewhere" }] } },
    }
    const calls: Array<{ env?: Record<string, string | undefined> } | undefined> = []
    const runCompose = async (
      _argv: string[],
      _cwd: string,
      opts?: { env?: Record<string, string | undefined> },
    ) => {
      calls.push(opts)
      return { exitCode: 0, stdout: JSON.stringify(opts?.env === undefined ? model : otherModel), stderr: "" }
    }
    const blocked = await prepareMountpoints(wt, "compose.yml", {
      runCompose,
      profiles: ["test"],
      crossCheckEnv: true,
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.blocked).toContain("cannot receive")
    expect(calls[2]?.env && Object.keys(calls[2].env)).toEqual(["PATH"])

    const runComposeSame = async () => ({ exitCode: 0, stdout: JSON.stringify(model), stderr: "" })
    const ok = await prepareMountpoints(wt, "compose.yml", { runCompose: runComposeSame, profiles: ["test"], crossCheckEnv: true })
    expect(ok.ok).toBe(true)
  })
})

describe("runComposeLocal", () => {
  it("settles at the deadline with a timeout result instead of waiting for plugin streams", async () => {
    const start = Date.now()
    const res = await runComposeLocal(["sleep", "30"], tmpdir(), { timeoutMs: 500 })
    expect(res.exitCode).toBe(124)
    expect(res.stderr).toContain("timed out")
    expect(Date.now() - start).toBeLessThan(10_000)
  }, 20_000)
})

describe("integration with a real Docker daemon: mountpoint preflight", () => {
  const dockerAvailable = (() => {
    try {
      execSync("docker info --format x", { stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 })
      return true
    } catch {
      return false
    }
  })()

  const walkOwned = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      ownedByInvokingUser(p)
      if (entry.isDirectory()) walkOwned(p)
    }
  }

  it.skipIf(!dockerAvailable)(
    "preflight + compose up + run: every host mountpoint is owned by the invoking uid/gid, worktree removable without chmod",
    async () => {
      const wt = mkdtempSync(join(tmpdir(), "sandbox-mnt-int-"))
      tmpDirs.push(wt)
      execSync("git init -q -b main", { cwd: wt })
      mkdirSync(join(wt, "apps/api"), { recursive: true })
      writeFileSync(
        join(wt, "compose.yml"),
        [
          "services:",
          "  tester:",
          "    image: alpine:3.20",
          "    profiles: [test]",
          "    command: [sleep, infinity]",
          "    volumes:",
          "      - ./apps/api:/repo/apps/api",
          "      - /repo/apps/api/.venv",
          "  gen:",
          "    image: alpine:3.20",
          "    profiles: [test]",
          "    command: [sleep, infinity]",
          "    volumes:",
          "      - type: bind",
          "        source: ./packages/api-client",
          "        target: /repo/packages/api-client",
          "      - type: volume",
          "        target: /repo/packages/api-client/node_modules",
          "      - cache:/repo/cache",
          "volumes:",
          "  cache: {}",
          "",
        ].join("\n"),
      )
      execSync("git add -A", { cwd: wt }) // index is enough for the git ls-files preflight

      // the preflight materializes everything before any Compose operation,
      // rendered with the same project name the sandbox runs use
      const id = sandboxId("97", wt)
      const pre = await prepareMountpoints(wt, "compose.yml", { id, profiles: ["test"] })
      expect(pre.ok).toBe(true)
      if (!pre.ok) return
      expect(pre.created.sort()).toEqual(
        [
          join(wt, "apps/api/.venv"),
          join(wt, "packages"),
          join(wt, "packages/api-client"),
          join(wt, "packages/api-client/node_modules"),
        ].sort(),
      )
      ownedByInvokingUser(join(wt, "apps/api/.venv"))
      ownedByInvokingUser(join(wt, "packages/api-client/node_modules"))

      const run = (argv: string[]) =>
        new Promise<{ code: number; out: string }>((resolve) => {
          const p = spawn(argv[0], argv.slice(1), { cwd: wt })
          let out = ""
          p.stdout?.on("data", (d) => (out += d))
          p.stderr?.on("data", (d) => (out += d))
          p.on("error", (e) => resolve({ code: 1, out: String(e) }))
          p.on("close", (code) => resolve({ code: code ?? 1, out }))
        })

      try {
        // the daemon finds the mountpoints already there and creates nothing
        const up = await run(["docker", "compose", "-p", id, "-f", "compose.yml", "--profile", "test", "up", "-d", "--wait"])
        expect(up.code).toBe(0)
        ownedByInvokingUser(join(wt, "apps/api/.venv"))
        ownedByInvokingUser(join(wt, "packages/api-client/node_modules"))

        // a `compose run` (the sandbox_test shape) creates another container — same mounts
        const testRun = await run(["docker", "compose", "-p", id, "-f", "compose.yml", "--profile", "test", "run", "--rm", "tester", "echo", "mountpoint-ok"])
        expect(testRun.code).toBe(0)
        expect(testRun.out).toContain("mountpoint-ok")

        // no foreign-owned entries anywhere in the worktree
        walkOwned(wt)

        const down = await run(["docker", "compose", "-p", id, "-f", "compose.yml", "down", "-v", "--remove-orphans"])
        expect(down.code).toBe(0)
      } finally {
        // bounded, non-throwing cleanup: a stalled Compose teardown must not
        // block the worker past its deadline or mask the original failure
        spawnSync(
          "docker",
          ["compose", "-p", id, "-f", "compose.yml", "--profile", "test", "down", "-v", "--remove-orphans"],
          { cwd: wt, timeout: 60_000 },
        )
      }

      // slice_finish's shape: the worktree must be removable without chmod —
      // on a Linux host this is the proof that no root-owned entry was left
      rmSync(wt, { recursive: true, force: true })
      expect(existsSync(wt)).toBe(false)
    },
    240_000,
  )
})
