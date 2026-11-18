/**
 * oc-pr-monitor — the zero-token PR wait loop (blueprint §7.3).
 *
 * Pure helpers, unit-tested in tests/plugins/oc-pr-monitor.test.ts. index.ts
 * registers prmon_watch/prmon_status and runs the timer loop.
 *
 * While a watch is active the plugin polls GitHub on a plain timer — no model
 * calls happen between wakes. A wake lists only the NEW unresolved threads and
 * the failed checks; the slice session answers each with a fix commit+push or
 * a "Won't fix, because…" reply. READY = every thread resolved and ci-ok (the
 * required check aggregate) passed. The round cap is 5.
 */

export interface ThreadSnapshot {
  id: string
  resolved: boolean
  lastBody: string
}

export interface CheckSnapshot {
  name: string
  state: string // pass | fail | pending | skipping | cancelled | neutral
}

export interface PRSnapshot {
  threads: ThreadSnapshot[]
  checks: CheckSnapshot[]
  state: string // OPEN | MERGED | CLOSED
  checkPage?: { hasNextPage: boolean; endCursor?: string }
}

export interface WakeSummary {
  newUnresolvedThreads: { id: string; body: string }[]
  failedChecks: { name: string; state: string }[]
  threadsOpen: number
}

/** Only the new unresolved threads (new or changed since the last snapshot) and the failed checks. */
export function diffSnapshot(prev: PRSnapshot | undefined, next: PRSnapshot): WakeSummary {
  const known = new Map((prev?.threads ?? []).map((t) => [t.id, t]))
  const newUnresolvedThreads = next.threads
    .filter((t) => !t.resolved)
    .filter((t) => {
      const before = known.get(t.id)
      return !before || before.lastBody !== t.lastBody || (before.resolved && !t.resolved)
    })
    .map((t) => ({ id: t.id, body: t.lastBody }))
  const failedChecks = next.checks
    .filter((c) => ["fail", "error", "cancelled"].includes(c.state.toLowerCase()))
    .filter((c) => !(prev?.checks ?? []).some((p) => p.name === c.name && p.state === c.state))
    .map((c) => ({ name: c.name, state: c.state }))
  return {
    newUnresolvedThreads,
    failedChecks,
    threadsOpen: next.threads.filter((t) => !t.resolved).length,
  }
}

/** READY requires every thread resolved and the required check aggregate (ci-ok) passed. */
export function isReady(snapshot: PRSnapshot): boolean {
  if (snapshot.threads.some((t) => !t.resolved)) return false
  const ciOk = snapshot.checks.find((c) => c.name.toLowerCase() === "ci-ok")
  if (!ciOk) return false
  return ciOk.state.toLowerCase() === "pass"
}

/** The compact wake text sent to the slice session. */
export function wakeText(slice: number, pr: number, summary: WakeSummary, round: number): string {
  const parts: string[] = [`PR #${pr} (slice #${slice}) changed — round ${round}.`]
  if (summary.newUnresolvedThreads.length > 0) {
    parts.push("New unresolved review threads:")
    for (const t of summary.newUnresolvedThreads) parts.push(`  - ${t.body.slice(0, 300)}`)
  }
  if (summary.failedChecks.length > 0) {
    parts.push("Failed checks:")
    for (const c of summary.failedChecks) parts.push(`  - ${c.name} (${c.state}) — fix it or report why it can't be fixed`)
  }
  if (summary.newUnresolvedThreads.length === 0 && summary.failedChecks.length === 0) {
    parts.push(`No new unresolved threads and no failed checks (${summary.threadsOpen} threads still open).`)
  }
  parts.push("Fix each item (commit, push) or reply \"Won't fix, because…\" and resolve it. Never merge; the user merges.")
  return parts.join("\n")
}

/**
 * Normalize GitHub CheckRun conclusions and StatusContext states at the API
 * boundary, so all monitor decisions use the same internal vocabulary.
 * Sources: https://docs.github.com/en/rest/checks/runs?apiVersion=2022-11-28#create-a-check-run
 * https://docs.github.com/en/rest/commits/statuses?apiVersion=2022-11-28#create-a-commit-status
 */
function normalizeCheckState(value: unknown): string {
  const state = String(value ?? "pending").toLowerCase()
  if (state === "success") return "pass"
  if (["failure", "error", "timed_out", "action_required", "stale"].includes(state)) return "fail"
  if (state === "skipped") return "skipping"
  return state
}

/** Extract the snapshot from a GitHub graphql response for a PR. */
export function parsePRGraphql(json: any): PRSnapshot {
  const pr = json?.data?.repository?.pullRequest
  const threads: ThreadSnapshot[] = (pr?.reviewThreads?.nodes ?? []).map((t: any, i: number) => ({
    id: String(t?.id ?? `thread-${i}`),
    resolved: t?.isResolved === true,
    lastBody: String(t?.comments?.nodes?.at(-1)?.body ?? "").trim(),
  }))
  const rawChecks: any[] = pr?.statusCheckRollup?.contexts?.nodes ?? []
  const checks: CheckSnapshot[] = rawChecks.map((c: any) => ({
    name: String(c?.name ?? c?.context ?? "check"),
    state: normalizeCheckState(c?.conclusion ?? c?.state),
  }))
  const page = pr?.statusCheckRollup?.contexts?.pageInfo
  return {
    threads,
    checks,
    state: String(pr?.state ?? "OPEN").toUpperCase(),
    checkPage: page ? { hasNextPage: page.hasNextPage === true, endCursor: page.endCursor ?? undefined } : undefined,
  }
}
