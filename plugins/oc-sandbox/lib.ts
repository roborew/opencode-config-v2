import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * oc-sandbox — isolated test runs for slices (blueprint §7.2).
 *
 * Pure helpers, unit-tested in tests/plugins/oc-sandbox.test.ts. index.ts
 * registers the tools and wires these in.
 *
 * Every run happens in a fully isolated Docker setup built from the repo's own
 * Dockerfiles and its single compose.yml (D29) — nothing is taken from the
 * machine running OpenCode. Backends: sysbox (server, through the sidecar API
 * of blueprint §10) and docker (Mac, direct docker compose with a per-slice
 * project name). OC_SANDBOX_BACKEND overrides the automatic choice.
 */

// ---------------------------------------------------------------- backends

export type Backend = "sysbox" | "docker"
export type BackendChoice = { backend: Backend; sidecar?: Sidecar } | { blocked: string }

export type Sidecar = {
  url: string
  token: string
}

export async function selectBackend(
  opts: { backend?: string; sidecarUrl?: string; sidecarToken?: string },
  env: Record<string, string | undefined>,
  deps: {
    fetchImpl?: typeof fetch
    dockerInfo?: () => boolean
  } = {},
): Promise<BackendChoice> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const dockerInfo =
    deps.dockerInfo ??
    (() => {
      try {
        execSync("docker info --format {{.ServerVersion}}", {
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 10_000,
        })
        return true
      } catch {
        return false
      }
    })

  const override = (opts.backend || env.OC_SANDBOX_BACKEND || "auto").trim()
  const url = opts.sidecarUrl || env.OC_SANDBOX_URL
  const token = opts.sidecarToken || env.OC_SANDBOX_TOKEN
  const sidecar: Sidecar | undefined = url && token ? { url, token } : undefined

  if (override === "sysbox") {
    if (!sidecar) return { blocked: "OC_SANDBOX_BACKEND=sysbox but OC_SANDBOX_URL/OC_SANDBOX_TOKEN are not set" }
    return { backend: "sysbox", sidecar }
  }
  if (override === "docker") return { backend: "docker" }
  if (override !== "auto" && override !== "") {
    return { blocked: `OC_SANDBOX_BACKEND must be auto, sysbox or docker (got '${override}')` }
  }
  // auto: sidecar answers /v1/health → sysbox; local docker works → docker; else blocked
  if (sidecar) {
    try {
      const res = await fetchImpl(`${sidecar.url.replace(/\/$/, "")}/v1/health`, {
        headers: { authorization: `Bearer ${sidecar.token}` },
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) return { backend: "sysbox", sidecar }
    } catch {
      // sidecar unreachable — fall through to docker
    }
  }
  if (dockerInfo()) return { backend: "docker" }
  return { blocked: "no sandbox backend: the sidecar is unreachable and there is no local Docker daemon" }
}

// ---------------------------------------------------------------- identity

/**
 * Short sandbox id: s<N>-<6 hex>, kept under Docker's 64-byte hostname limit.
 * Stable per (slice, worktree) so re-running up/test reuse the same project.
 */
export function sandboxId(slice: string, worktree: string): string {
  const n = slice.replace(/[^0-9]/g, "") || "0"
  let hash = 0x811c9dc5
  for (let i = 0; i < worktree.length; i++) {
    hash ^= worktree.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `s${n}-${hash.toString(16).padStart(8, "0").slice(0, 6)}`
}

// ---------------------------------------------------------------- contract

export interface TestContract {
  /** service name mapping from AGENTS.md test.services (all, per-app, e2e, smoke) */
  services: Record<string, string>
  /** the argv template from test.commands.test with {service}/{args} placeholders */
  testCommand: string
  /** the argv for the full profile (production images) from test.commands.full */
  fullCommand: string
  testGlobs: string[]
  generatedGlobs: string[]
  generatorService?: string
  /** the compose file, always compose.yml at the repo root (D29) */
  composeFile: string
}

export function readFrontMatter(directory: string): string {
  const agents = join(directory, "AGENTS.md")
  if (!existsSync(agents)) return ""
  const text = readFileSync(agents, "utf8")
  if (!text.startsWith("---")) return ""
  const end = text.indexOf("\n---", 3)
  return end === -1 ? "" : text.slice(3, end)
}

/** Parses the test contract from a repo's AGENTS.md front matter (§9.3). */
export function parseTestContract(frontMatter: string): TestContract {
  const services: Record<string, string> = {}
  const servicesMatch = frontMatter.match(/^  services:\s*\{(.*)\}\s*$/m)
  if (servicesMatch) {
    for (const pair of servicesMatch[1].split(",")) {
      const m = pair.match(/([a-z0-9-]+)\s*:\s*"([^"]+)"/)
      if (m) services[m[1]] = m[2]
    }
  }
  const testCommand =
    frontMatter.match(/^    test:\s*"(.*)"\s*$/m)?.[1] ??
    "docker compose -f compose.yml --profile test run --rm {service} {args}"
  const fullCommand =
    frontMatter.match(/^    full:\s*"(.*)"\s*$/m)?.[1] ??
    "docker compose -f compose.yml --profile full up -d --wait"
  const generatorService =
    frontMatter.match(/generator_service:\s*"([^"]+)"/)?.[1] ?? undefined
  const testGlobs = matchList(frontMatter, /^test_globs:\s*\[([^\]]*)\]/m)
  const generatedGlobs = matchList(frontMatter, /generated:\s*\[([^\]]*)\]/)
  return { services, testCommand, fullCommand, testGlobs, generatedGlobs, generatorService, composeFile: "compose.yml" }
}

function matchList(text: string, re: RegExp): string[] {
  const m = text.match(re)
  if (!m) return []
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
}

/**
 * The argv for one isolated test run: the contract's test command with the
 * per-slice project name injected and {service}/{args} substituted. No host
 * ports are published and the project name makes the run isolated.
 */
export function buildTestArgv(
  contract: TestContract,
  id: string,
  service: string,
  args: string[] = [],
): string[] {
  const template = contract.testCommand.replace("docker compose", `docker compose -p ${id}`)
  const argv: string[] = []
  for (const part of template.split(/\s+/)) {
    if (part === "{service}") argv.push(service)
    else if (part === "{args}") continue
    else if (part) argv.push(part)
  }
  return [...argv, ...args]
}

/** The argv to build the contract's images and warm dependencies (dev profile = dependencies only). */
export function buildWarmArgv(contract: TestContract, id: string): { build: string[]; up: string[] } {
  return {
    build: ["docker", "compose", "-p", id, "-f", contract.composeFile, "build"],
    up: ["docker", "compose", "-p", id, "-f", contract.composeFile, "up", "-d", "--wait"],
  }
}

/** The argv to tear the slice's Compose project down with its volumes. */
export function buildDownArgv(contract: TestContract, id: string): string[] {
  return ["docker", "compose", "-p", id, "-f", contract.composeFile, "down", "-v", "--remove-orphans"]
}

// ---------------------------------------------------------------- evidence

export type EvidenceRecord = {
  sha: string
  service: string
  args: string[]
  passed: boolean
  exitCode: number
  at: number
}

// ---------------------------------------------------------------- red / green

export type CommitClass = "test" | "generated" | "code" | "empty"

export interface CommitInfo {
  sha: string
  subject: string
  files: string[]
}

/** A commit is test-only when every file matches a test glob; generated when every file matches a generated glob. */
export function classifyCommit(commit: CommitInfo, contract: TestContract): CommitClass {
  const files = commit.files
  if (files.length === 0) return "empty"
  if (files.every((f) => matchesAny(f, contract.testGlobs))) return "test"
  if (files.every((f) => matchesAny(f, contract.generatedGlobs))) return "generated"
  return "code"
}

function matchesAny(path: string, globs: string[]): boolean {
  return globs.some((g) => globMatch(g, path))
}

/** Minimal glob: ** matches across separators, * within one segment, exact otherwise. */
export function globMatch(glob: string, path: string): boolean {
  const g = glob.replace(/^\.\//, "")
  if (g === "**") return true
  const re = new RegExp(
    "^" +
    g
      .split("**")
      .map((part) =>
        part
          .split("*")
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join("[^/]*"),
      )
      .join(".*") +
    "$",
  )
  return re.test(path)
}

export interface RedgreenViolation {
  sha: string
  kind: "missing-red" | "missing-green" | "no-evidence" | "test-only-then-generated"
  detail: string
}

/**
 * For each commit main..HEAD: a test-only commit must have a failing evidence
 * record, and the next code commit must have a passing one. Generated client
 * commits count as neither (they follow the generator service, never a RED).
 */
export function redgreenCheck(
  commits: CommitInfo[],
  contract: TestContract,
  evidenceBySha: Map<string, EvidenceRecord[]>,
): { ok: boolean; violations: RedgreenViolation[] } {
  const violations: RedgreenViolation[] = []
  const classes = commits.map((c) => ({ commit: c, cls: classifyCommit(c, contract) }))
  let pendingRed: { sha: string } | undefined

  for (const { commit, cls } of classes) {
    const evidence = evidenceBySha.get(commit.sha) ?? []
    if (cls === "empty" || cls === "generated") continue
    if (cls === "test") {
      const failed = evidence.some((e) => !e.passed)
      if (!failed) {
        violations.push({
          sha: commit.sha,
          kind: "missing-red",
          detail: `test-only commit '${commit.subject}' has no failing sandbox_test record`,
        })
      }
      pendingRed = { sha: commit.sha }
      continue
    }
    // code commit
    const passed = evidence.some((e) => e.passed)
    if (pendingRed && !passed) {
      violations.push({
        sha: commit.sha,
        kind: "missing-green",
        detail: `code commit '${commit.subject}' follows test-only ${pendingRed.sha.slice(0, 7)} but has no passing sandbox_test record`,
      })
    } else if (!pendingRed) {
      violations.push({
        sha: commit.sha,
        kind: "no-evidence",
        detail: `behaviour-changing commit '${commit.subject}' has no preceding failing test-only commit`,
      })
    }
    pendingRed = undefined
  }
  return { ok: violations.length === 0, violations }
}

// ---------------------------------------------------------------- output

/** The last `lines` lines with obvious secrets redacted (never print .env values). */
export function redactTail(text: string, lines = 200, secrets: string[] = []): string {
  const out = text.trimEnd().split("\n").slice(-lines).join("\n")
  let redacted = out
  for (const secret of secrets) {
    if (secret && secret.length > 3) redacted = redacted.split(secret).join("[redacted]")
  }
  return redacted.replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{12,})\b/g, "[redacted]")
}

/** Env values found in the worktree's .env files, for redaction (values are never logged elsewhere). */
export function envSecrets(worktree: string): string[] {
  const values: string[] = []
  for (const name of [".env", ".env.local", ".env.staging", ".env.production"]) {
    const p = join(worktree, name)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^[A-Za-z_][A-Za-z0-9_]*=(.+)$/)
      if (m && !m[1].startsWith('"$')) values.push(m[1].trim().replace(/^["']|["']$/g, ""))
    }
  }
  return values
}
