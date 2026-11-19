import { execFileSync, execSync, spawn } from "node:child_process"
import { type Stats, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync } from "node:fs"
import { basename, dirname, join, relative, resolve, sep } from "node:path"

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
  /** the flow profiles from AGENTS.md test.profiles (values); other declared profiles (dev) are never the flow's */
  profiles: string[]
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
  const profiles: string[] = []
  const profilesMatch = frontMatter.match(/^  profiles:\s*\{(.*)\}\s*$/m)
  if (profilesMatch) {
    for (const pair of profilesMatch[1].split(",")) {
      const m = pair.match(/([a-z0-9-]+)\s*:\s*['\"]?([a-z0-9-]+)['\"]?/)
      if (m && m[2] && !profiles.includes(m[2])) profiles.push(m[2])
    }
  }
  const testGlobs = matchList(frontMatter, /^test_globs:\s*\[([^\]]*)\]/m)
  const generatedGlobs = matchList(frontMatter, /generated:\s*\[([^\]]*)\]/)
  return { services, profiles, testCommand, fullCommand, testGlobs, generatedGlobs, generatorService, composeFile: "compose.yml" }
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

// ------------------------------------------------- mountpoint preflight

/**
 * Docker materializes missing host mountpoints as root: bind sources that do
 * not exist yet, and — through the bind — the host-side mountpoints of
 * volumes nested under a bind target (anonymous or named alike). In an
 * unprivileged server those root-owned directories can never be removed by
 * `slice_finish` (Rekalled #41, and the same failure for any bind-mounted
 * worktree). The preflight renders the effective Compose model, plans every
 * host path the daemon would otherwise create, and materializes it as the
 * invoking user before any Compose operation that starts containers.
 */

export type ComposeMountEntry = {
  type?: string
  source?: string | null
  target?: string
  read_only?: boolean
  bind?: { create_host_path?: boolean } & Record<string, unknown>
}

export type ComposeServiceModel = { volumes?: ComposeMountEntry[] }

/** The effective model from `docker compose config --format json` (either the map or the array shape). */
export type ComposeModel = {
  services: Record<string, ComposeServiceModel> | Array<{ name: string } & ComposeServiceModel>
}

export type PlannedMountpoint = {
  /** absolute, normalized; symlink resolution happens in the executor */
  hostPath: string
  service: string
  kind: "bind" | "nested-volume"
  /** whether hostPath is inside the worktree (only worktree paths are ever created) */
  inside: boolean
  /** binds only: whether Compose permits creating the missing host source (short syntax implies true) */
  createHostPath?: boolean
}

/** Git's verdict on a missing bind source: a tracked file, a confirmed untracked path, or an unknown lookup. */
export type FileLookup = (worktree: string, rel: string) => "tracked" | "untracked" | "unknown"

export type MountpointOutcome = { ok: true; created: string[] } | { ok: false; blocked: string }

export type ComposeRunResult = { exitCode: number; stdout: string; stderr: string }

function isInside(worktree: string, p: string): boolean {
  const w = resolve(worktree)
  return p === w || p.startsWith(w + sep)
}

/**
 * Pure planning from the effective model: bind sources inside the worktree,
 * plus the host mountpoints of volumes nested under a bind target — the
 * daemon creates those through the bind, as root, whether the volume is
 * anonymous or named. Volumes not nested under a bind mount into the image
 * filesystem and need no host path. Nesting resolves against the deepest
 * covering bind target, per service. `bind.create_host_path: false` is
 * carried so a missing source can block instead of being created.
 */
export function planMountpoints(model: ComposeModel, worktree: string): PlannedMountpoint[] {
  const services: Array<[string, ComposeServiceModel]> = Array.isArray(model?.services)
    ? model.services.map((s) => [s.name, s])
    : Object.entries(model?.services ?? {})
  const planned: PlannedMountpoint[] = []
  for (const [name, svc] of services) {
    const binds: { source: string; target: string; inside: boolean }[] = []
    for (const m of svc?.volumes ?? []) {
      if ((m?.type ?? "bind") !== "bind" || !m?.source || !m?.target) continue
      const hostPath = resolve(worktree, m.source)
      const inside = isInside(worktree, hostPath)
      binds.push({ source: hostPath, target: m.target, inside })
      planned.push({
        hostPath,
        service: name,
        kind: "bind",
        inside,
        createHostPath: m.bind?.create_host_path !== false,
      })
    }
    for (const m of svc?.volumes ?? []) {
      if (m?.type !== "volume" || !m?.target) continue
      const target = m.target
      const cover = binds
        .filter((b) => target.startsWith(b.target + "/"))
        .sort((a, b) => b.target.length - a.target.length)[0]
      if (!cover) continue
      planned.push({
        hostPath: join(cover.source, target.slice(cover.target.length + 1)),
        service: name,
        kind: "nested-volume",
        inside: cover.inside,
      })
    }
  }
  return planned
}

/** Git's verdict on a missing bind source; a failed lookup must not read as "not tracked". */
function gitFileLookup(worktree: string, rel: string): "tracked" | "untracked" | "unknown" {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--", rel], {
      cwd: worktree,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    }).toString()
    return out.split("\0").some((entry) => entry === rel) ? "tracked" : "untracked"
  } catch {
    return "unknown"
  }
}

/** Resolve everything that exists of `target`, following symlinks; the missing tail stays literal. */
function resolveExisting(target: string): string {
  try {
    return realpathSync(target)
  } catch {
    return join(realpathSync(dirname(target)), basename(target))
  }
}

const foreignOwned = (
  path: string,
  services: string,
  kind: string,
  uid: number,
  gid: number,
  wantUid: number,
  wantGid: number,
) =>
  `mountpoint ${path} (service '${services}', ${kind}) is owned by uid ${uid}:gid ${gid}, ` +
  `expected uid ${wantUid}:gid ${wantGid} — probably created by the Docker daemon as root. ` +
  `Remove the empty directory yourself and re-run; oc-sandbox never chowns or removes paths it does not own.`

type MountRequirement = {
  lexical: string
  services: string[]
  kind: "bind" | "nested-volume"
  /** a volume mountpoint must be a directory, even when another service binds the same path as a file */
  needsDir: boolean
  /** some bind on this path disables host-path creation (create_host_path: false) */
  noCreate: boolean
  inside: boolean
}

/**
 * Materializes every planned host path as the invoking user: missing paths are
 * created as directories (what the daemon would create as root), existing ones
 * are verified to be owned by the invoking uid/gid. File binds are preserved,
 * never mkdir'd over. Fails closed on foreign ownership, a missing bind whose
 * place git tracks as a file or whose lookup failed, a bind that disables
 * host-path creation, a file blocking a directory chain or mountpoint, a
 * missing path outside the worktree, symlinks escaping the worktree (directly
 * or chained), and a parent whose group would give new directories a foreign
 * gid. Requirements from different services for the same host path are merged
 * before checking, so the strictest requirement wins in any service order.
 */
export function materializeMountpoints(
  worktree: string,
  planned: PlannedMountpoint[],
  deps: { uid?: number; gid?: number; trackedFile?: FileLookup } = {},
): MountpointOutcome {
  const uid = deps.uid ?? process.getuid?.() ?? -1
  const gid = deps.gid ?? process.getgid?.() ?? -1
  if (uid < 0 || gid < 0) return { ok: false, blocked: "cannot determine the invoking uid/gid — refusing to prepare mountpoints" }
  const fileLookup = deps.trackedFile ?? gitFileLookup
  const root = resolve(worktree)
  let rootReal: string
  try {
    rootReal = realpathSync(root)
  } catch (e) {
    return { ok: false, blocked: `cannot resolve the worktree ${root}: ${(e as Error).message}` }
  }

  const groups = new Map<string, MountRequirement>()
  for (const plan of planned) {
    const lexical = resolve(worktree, plan.hostPath)
    const g = groups.get(lexical)
    if (!g) {
      groups.set(lexical, {
        lexical,
        services: [plan.service],
        kind: plan.kind,
        needsDir: plan.kind === "nested-volume",
        noCreate: plan.kind === "bind" && plan.createHostPath === false,
        inside: isInside(root, lexical),
      })
      continue
    }
    if (!g.services.includes(plan.service)) g.services.push(plan.service)
    g.needsDir ||= plan.kind === "nested-volume"
    g.noCreate ||= plan.kind === "bind" && plan.createHostPath === false
  }

  const created: string[] = []
  for (const req of groups.values()) {
    const services = req.services.join(",")
    if (!req.inside) {
      // Outside the worktree: never created. An existing path is the host's
      // business; a missing one Docker would create as root — fail closed.
      if (existsSync(req.lexical)) continue
      return {
        ok: false,
        blocked:
          `mount source ${req.lexical} (service '${services}') is outside the worktree and does not exist — ` +
          `Docker would create it as root. Create it yourself or change the mount; ` +
          `oc-sandbox only creates directories inside the worktree.`,
      }
    }

    const rel = relative(root, req.lexical)
    const segments = rel.split(sep).filter(Boolean)
    let cur = rootReal
    let curLex = root
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const next = join(cur, seg)
      const nextLex = join(curLex, seg)
      const final = i === segments.length - 1
      let st: Stats | undefined
      try {
        st = lstatSync(next)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
          return { ok: false, blocked: `cannot inspect mountpoint ${nextLex} (service '${services}'): ${(e as Error).message}` }
        }
      }
      if (!st) {
        if (final && req.noCreate) {
          return {
            ok: false,
            blocked:
              `bind source ${nextLex} (service '${services}') is missing and its mount disables host-path ` +
              `creation (create_host_path: false) — create it yourself; oc-sandbox will not create it either.`,
          }
        }
        if (final && !req.needsDir) {
          const lookup = fileLookup(root, rel)
          if (lookup === "tracked") {
            return {
              ok: false,
              blocked:
                `bind source ${nextLex} (service '${services}') is missing but git tracks a file there — ` +
                `restore it (git checkout -- ${rel}) instead of letting Docker create a root-owned directory in its place.`,
            }
          }
          if (lookup === "unknown") {
            return {
              ok: false,
              blocked:
                `cannot verify whether ${nextLex} (service '${services}') should be a file (git ls-files failed) — ` +
                `fix git in the worktree and retry; oc-sandbox will not create a directory over a possible tracked file.`,
            }
          }
        }
        // re-verify the parent immediately before creating below it, then
        // re-check what was created: this closes the check-then-write window
        // as far as Node's stdlib allows (there is no openat-style handle API)
        let parent: Stats
        try {
          parent = lstatSync(cur)
        } catch (e) {
          return { ok: false, blocked: `mountpoint parent ${curLex} disappeared during preflight: ${(e as Error).message}` }
        }
        if (!parent.isDirectory() || parent.uid !== uid || parent.gid !== gid) {
          return {
            ok: false,
            blocked:
              `mountpoint parent ${curLex} changed during preflight — it is no longer a directory owned by ` +
              `uid ${uid}:gid ${gid}. Fix the parent's ownership or setgid bit and retry.`,
          }
        }
        try {
          mkdirSync(next)
        } catch (e) {
          return {
            ok: false,
            blocked:
              `cannot create mountpoint directory ${nextLex} (service '${services}'): ${(e as Error).message} — ` +
              `if this path should be a file, create it yourself; Docker would otherwise create a root-owned directory here.`,
          }
        }
        let made: Stats
        try {
          made = lstatSync(next)
        } catch (e) {
          return { ok: false, blocked: `the mountpoint created at ${nextLex} vanished immediately: ${(e as Error).message}` }
        }
        if (!made.isDirectory()) {
          return {
            ok: false,
            blocked:
              `the path created for ${nextLex} (service '${services}') is not a directory — the path changed during ` +
              `preflight (possible symlink race). Re-run once the worktree is stable.`,
          }
        }
        if (made.uid !== uid || made.gid !== gid) {
          return {
            ok: false,
            blocked:
              `newly created mountpoint ${nextLex} has uid ${made.uid}:gid ${made.gid}, expected uid ${uid}:gid ${gid} — ` +
              `its parent directory probably carries a setgid bit or a foreign group; fix the parent's group or ` +
              `setgid bit and retry.`,
          }
        }
        created.push(nextLex)
        cur = next
        curLex = nextLex
        continue
      }
      if (st.isSymbolicLink()) {
        // resolve the link TARGET through everything that exists of it, so a
        // chain of links or an outside component inside the target is caught
        const target = resolve(dirname(next), readlinkSync(next))
        let realTarget: string
        try {
          realTarget = resolveExisting(target)
        } catch (e) {
          return { ok: false, blocked: `cannot resolve the symlink ${nextLex} (service '${services}'): ${(e as Error).message}` }
        }
        if (!isInside(rootReal, realTarget)) {
          return {
            ok: false,
            blocked:
              `mountpoint path ${nextLex} (service '${services}') is a symlink resolving to ${realTarget}, ` +
              `outside the worktree — symlinks must not escape the worktree.`,
          }
        }
        let tst: Stats | undefined
        try {
          tst = lstatSync(realTarget)
        } catch {
          // dangling link inside the worktree: materialize its target
          try {
            mkdirSync(realTarget)
          } catch (e) {
            return { ok: false, blocked: `cannot materialize symlink target ${realTarget}: ${(e as Error).message}` }
          }
          created.push(nextLex)
          cur = realTarget
          curLex = nextLex
          continue
        }
        if (tst.uid !== uid || tst.gid !== gid) {
          return { ok: false, blocked: foreignOwned(nextLex, services, req.kind, tst.uid, tst.gid, uid, gid) }
        }
        if (tst.isFile() && !(final && !req.needsDir)) {
          return {
            ok: false,
            blocked:
              `mountpoint ${nextLex} (service '${services}') is a symlink to the file ${realTarget}, where ` +
              `${req.needsDir ? "a volume mountpoint" : "a directory chain"} needs a directory — move the file or fix the mounts.`,
          }
        }
        cur = realTarget
        curLex = nextLex
        continue
      }
      if (st.isFile()) {
        if (final && !req.needsDir) {
          if (st.uid !== uid || st.gid !== gid) {
            return { ok: false, blocked: foreignOwned(nextLex, services, req.kind, st.uid, st.gid, uid, gid) }
          }
          break // existing file bind, preserved
        }
        return {
          ok: false,
          blocked:
            `mountpoint ${nextLex} (service '${services}') exists as a file where ` +
            `${req.needsDir ? "a volume mountpoint" : "a directory chain"} needs a directory — move the file or fix the mounts.`,
        }
      }
      if (st.uid !== uid || st.gid !== gid) {
        return { ok: false, blocked: foreignOwned(nextLex, services, req.kind, st.uid, st.gid, uid, gid) }
      }
      cur = next
      curLex = nextLex
    }
  }
  return { ok: true, created }
}

/** `docker compose config --profiles` — the declared profiles, with the sandbox project name so interpolation matches the runs. */
export function buildProfileListArgv(composeFile: string, id?: string): string[] {
  return ["docker", "compose", ...(id ? ["-p", id] : []), "-f", composeFile, "config", "--profiles"]
}

/** The effective model, client-side (no daemon), with the sandbox project name and the flow's profiles forced on. */
export function buildComposeConfigArgv(composeFile: string, profiles: string[], id?: string): string[] {
  return [
    "docker",
    "compose",
    ...(id ? ["-p", id] : []),
    "-f",
    composeFile,
    ...profiles.flatMap((p) => ["--profile", p]),
    "config",
    "--format",
    "json",
  ]
}

function parseProfiles(output: string): string[] {
  return [...new Set(output.split("\n").map((l) => l.trim()).filter(Boolean))]
}

/**
 * Local Compose run with a hard deadline. At the timeout the whole process
 * group is killed — killing only the docker CLI would leave the compose
 * plugin holding the output streams, and the promise would hang past the
 * deadline waiting for them to close — and the call settles immediately with
 * a timeout result. Both streams keep draining on normal completion so the
 * rendered JSON model stays complete.
 */
export function runComposeLocal(
  argv: string[],
  cwd: string,
  opts: { timeoutMs?: number; env?: Record<string, string | undefined> } = {},
): Promise<ComposeRunResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    })
    let stdout = ""
    let stderr = ""
    let settled = false
    const finish = (r: ComposeRunResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }
    const timer = setTimeout(() => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL")
      } catch {
        try {
          child.kill("SIGKILL")
        } catch {
          // already gone
        }
      }
      stderr += `\n[docker compose timed out after ${timeoutMs}ms and the process group was killed]`
      finish({ exitCode: 124, stdout, stderr })
    }, timeoutMs)
    child.stdout?.on("data", (d) => (stdout += d))
    child.stderr?.on("data", (d) => (stderr += d))
    child.on("error", (e) => finish({ exitCode: 1, stdout, stderr: String(e) }))
    child.on("close", (code) => finish({ exitCode: code ?? 1, stdout, stderr }))
  })
}

/**
 * The full preflight: render the effective model with the contract's compose
 * file (client-side, no `.env` requirement — compose only warns when it is
 * absent; the rendered model is never logged), plan the daemon-created host
 * paths, and materialize them as the invoking user. Both backends run this on
 * the host: the worktree paths are host paths no matter where Compose runs.
 * The render uses the sandbox project name and the contract's flow profiles,
 * so services in other profiles (dev, which the flow never uses) cannot block
 * a run, and `${COMPOSE_PROJECT_NAME}` interpolation resolves as it will at
 * run time. On sysbox the box receives no process environment (the sidecar
 * exec API is argv-only), so the model is rendered a second time in a clean
 * environment and the preflight fails closed when that would change the mounts.
 */
export async function prepareMountpoints(
  worktree: string,
  composeFile: string,
  deps: {
    runCompose?: (argv: string[], cwd: string, env?: Record<string, string | undefined>) => Promise<ComposeRunResult>
    secrets?: string[]
    uid?: number
    gid?: number
    trackedFile?: FileLookup
    /** the sandbox project name, so ${COMPOSE_PROJECT_NAME} matches the real runs */
    id?: string
    /** the contract's flow profiles (test/full); other declared profiles such as dev are excluded. Default: all declared. */
    profiles?: string[]
    /** sysbox: render again in a clean environment and fail closed if the mounts would differ */
    crossCheckEnv?: boolean
  } = {},
): Promise<MountpointOutcome> {
  const runCompose = deps.runCompose ?? runComposeLocal
  const redact = (text: string) => redactTail(text, 20, deps.secrets ?? [])
  const cliHint =
    "(requires the docker CLI with the compose plugin in the OpenCode server environment, even when the daemon is remote; the rendered model is never logged)"

  const profilesRun = await runCompose(buildProfileListArgv(composeFile, deps.id), worktree)
  if (profilesRun.exitCode !== 0) {
    return {
      ok: false,
      blocked: `mountpoint preflight cannot read the compose profiles:\n${redact(profilesRun.stderr || profilesRun.stdout)}\n${cliHint}`,
    }
  }
  const declared = parseProfiles(profilesRun.stdout)
  const active = deps.profiles?.length ? deps.profiles.filter((p) => declared.includes(p)) : declared
  const configArgv = buildComposeConfigArgv(composeFile, active, deps.id)
  const configRun = await runCompose(configArgv, worktree)
  if (configRun.exitCode !== 0) {
    return {
      ok: false,
      blocked: `mountpoint preflight cannot render the effective compose model:\n${redact(configRun.stderr || configRun.stdout)}\n${cliHint}`,
    }
  }
  let model: ComposeModel
  try {
    model = JSON.parse(configRun.stdout) as ComposeModel
  } catch {
    return { ok: false, blocked: `mountpoint preflight got an unparsable compose model from 'docker compose config'\n${cliHint}` }
  }
  const planned = planMountpoints(model, worktree)
  if (deps.crossCheckEnv) {
    const crossRun = await runCompose(configArgv, worktree, { PATH: process.env.PATH })
    if (crossRun.exitCode !== 0) {
      return {
        ok: false,
        blocked:
          "mountpoint preflight: the compose model needs process-environment variables that the sandbox cannot " +
          "receive (docker compose config failed in a clean environment) — put the values in the worktree's .env " +
          "or inline them in the compose file.",
      }
    }
    let crossModel: ComposeModel
    try {
      crossModel = JSON.parse(crossRun.stdout) as ComposeModel
    } catch {
      return {
        ok: false,
        blocked: "mountpoint preflight got an unparsable compose model from the clean-environment render; the model is never logged",
      }
    }
    const shape = (list: PlannedMountpoint[]) =>
      list.map((p) => `${p.kind} ${p.hostPath} ${p.inside} ${p.createHostPath !== false}`).sort().join("\n")
    if (shape(planned) !== shape(planMountpoints(crossModel, worktree))) {
      return {
        ok: false,
        blocked:
          "mountpoint preflight: the mounts depend on process-environment variables that the sandbox cannot receive " +
          "(the sysbox exec API passes no environment) — put the values in the worktree's .env or inline them in the " +
          "compose file, so the sandbox mounts the same host paths the preflight prepared.",
      }
    }
  }
  return materializeMountpoints(worktree, planned, { uid: deps.uid, gid: deps.gid, trackedFile: deps.trackedFile })
}
