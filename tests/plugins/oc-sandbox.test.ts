import { execSync, spawn } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import {
  buildDownArgv,
  buildTestArgv,
  buildWarmArgv,
  classifyCommit,
  envSecrets,
  globMatch,
  parseTestContract,
  redactTail,
  redgreenCheck,
  sandboxId,
  selectBackend,
} from "../../plugins/oc-sandbox/lib"

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

  it("parses services, commands, globs and the generator", () => {
    expect(contract.services).toEqual({ all: "test", api: "api-test", web: "web-test", e2e: "e2e", smoke: "smoke" })
    expect(contract.generatorService).toBe("api-client-gen")
    expect(contract.generatedGlobs).toEqual(["packages/api-client/**"])
    expect(contract.testGlobs).toContain("apps/*/tests/**")
    expect(contract.fullCommand).toContain("--profile full")
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
    execSync("git add -A && git -c user.name=t -c user.email=t@t commit -qm init", { cwd: dir })

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
