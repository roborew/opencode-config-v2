import { describe, expect, it } from "vitest"
import { diffSnapshot, isReady, parsePRGraphql, wakeText, type PRSnapshot } from "../../plugins/oc-pr-monitor/lib"

const snap = (threads: [string, boolean, string][], checks: [string, string][], state = "OPEN"): PRSnapshot => ({
  threads: threads.map(([id, resolved, lastBody]) => ({ id, resolved, lastBody })),
  checks: checks.map(([name, cstate]) => ({ name, state: cstate })),
  state,
})

describe("diffSnapshot", () => {
  it("lists only new or changed unresolved threads and new failed checks", () => {
    const prev = snap(
      [
        ["t1", true, "fixed"],
        ["t2", false, "old comment"],
      ],
      [
        ["lint", "pass"],
        ["ci-ok", "fail"],
      ],
    )
    const next = snap(
      [
        ["t1", true, "fixed"],
        ["t2", false, "new comment"], // changed body → new
        ["t3", false, "fresh thread"], // new thread → new
      ],
      [
        ["lint", "pass"],
        ["ci-ok", "fail"], // same failure as before → not new
        ["tests", "fail"], // new failure → new
      ],
    )
    const diff = diffSnapshot(prev, next)
    expect(diff.newUnresolvedThreads.map((t) => t.id)).toEqual(["t2", "t3"])
    expect(diff.failedChecks.map((c) => c.name)).toEqual(["tests"])
    expect(diff.threadsOpen).toBe(2)
  })

  it("reports a thread that reopens without a new comment", () => {
    const prev = snap([["t1", true, "fixed"]], [["ci-ok", "pass"]])
    const next = snap([["t1", false, "fixed"]], [["ci-ok", "pass"]])

    expect(diffSnapshot(prev, next).newUnresolvedThreads).toEqual([{ id: "t1", body: "fixed" }])
  })

  it("reports nothing when nothing changed", () => {
    const s = snap([["t1", false, "c"]], [["ci-ok", "pending"]])
    expect(diffSnapshot(s, s)).toMatchObject({ newUnresolvedThreads: [], failedChecks: [] })
  })
})

describe("isReady", () => {
  it("requires every thread resolved and ci-ok passed", () => {
    expect(isReady(snap([], [["ci-ok", "pass"]]))).toBe(true)
    expect(isReady(snap([["t1", false, "c"]], [["ci-ok", "pass"]]))).toBe(false)
    expect(isReady(snap([], [["ci-ok", "fail"]]))).toBe(false)
    expect(isReady(snap([], [["lint", "pass"]]))).toBe(false) // no ci-ok aggregate
    expect(isReady(snap([], [["CI-OK", "PASS"]]))).toBe(true) // case-insensitive
  })
})

describe("wakeText", () => {
  it("names the new items and the fix-or-won't-fix rule", () => {
    const text = wakeText(7, 12, { newUnresolvedThreads: [{ id: "t1", body: "rename this" }], failedChecks: [{ name: "tests", state: "fail" }], threadsOpen: 1 }, 2)
    expect(text).toContain("PR #12 (slice #7)")
    expect(text).toContain("rename this")
    expect(text).toContain("tests (fail)")
    expect(text).toContain("Won't fix, because")
    expect(text).toContain("the user merges")
  })

  it("says so when only resolved counts moved", () => {
    const text = wakeText(7, 12, { newUnresolvedThreads: [], failedChecks: [], threadsOpen: 2 }, 3)
    expect(text).toContain("No new unresolved threads")
    expect(text).toContain("2 threads still open")
  })
})

describe("parsePRGraphql", () => {
  it("extracts threads and check contexts from the graphql shape", () => {
    const json = {
      data: { repository: { pullRequest: { state: "OPEN", reviewThreads: { nodes: [{ id: "RT_1", isResolved: false, comments: { nodes: [{ body: "please fix" }] } }] }, statusCheckRollup: { contexts: { nodes: [{ name: "ci-ok", conclusion: "SUCCESS" }, { context: "status", state: "failure" }] } } } } },
    }
    const snapshot = parsePRGraphql(json)
    expect(snapshot.state).toBe("OPEN")
    expect(snapshot.threads).toEqual([{ id: "RT_1", resolved: false, lastBody: "please fix" }])
    expect(snapshot.checks.map((c) => [c.name, c.state])).toEqual([["ci-ok", "pass"], ["status", "fail"]])
    expect(parsePRGraphql({}).threads).toEqual([])
  })

  it("treats comments from any PR review tool as resolvable threads", () => {
    const thread = (id: string, body: string, login: string) => ({
      id,
      isResolved: false,
      comments: { nodes: [{ body, author: { login } }] },
    })
    const snapshot = parsePRGraphql({
      data: {
        repository: {
          pullRequest: {
            state: "OPEN",
            reviewThreads: {
              nodes: [
                thread("kilo", "Kilo found a regression", "kilo-bot"),
                thread("copilot", "Copilot suggests a guard", "copilot"),
                thread("security", "Security scanner found an issue", "security-bot"),
              ],
            },
            statusCheckRollup: { contexts: { nodes: [{ name: "ci-ok", conclusion: "SUCCESS" }] } },
          },
        },
      },
    })

    expect(diffSnapshot(undefined, snapshot).newUnresolvedThreads.map((t) => t.id)).toEqual(["kilo", "copilot", "security"])
    expect(isReady(snapshot)).toBe(false)
    expect(isReady({ ...snapshot, threads: snapshot.threads.map((t) => ({ ...t, resolved: true })) })).toBe(true)
  })

  it("normalizes every terminal GitHub check state before making monitor decisions", () => {
    const contexts = [
      { name: "success", conclusion: "SUCCESS" },
      { name: "failure", conclusion: "FAILURE" },
      { name: "timeout", conclusion: "TIMED_OUT" },
      { name: "action", conclusion: "ACTION_REQUIRED" },
      { name: "stale", conclusion: "STALE" },
      { name: "cancelled", conclusion: "CANCELLED" },
      { name: "skipped", conclusion: "SKIPPED" },
      { name: "neutral", conclusion: "NEUTRAL" },
      { name: "pending", conclusion: null },
      { context: "status-error", state: "ERROR" },
      { context: "status-pending", state: "PENDING" },
    ]
    const snapshot = parsePRGraphql({
      data: { repository: { pullRequest: { statusCheckRollup: { contexts: { nodes: contexts } } } } },
    })

    expect(snapshot.checks.map((c) => [c.name, c.state])).toEqual([
      ["success", "pass"],
      ["failure", "fail"],
      ["timeout", "fail"],
      ["action", "fail"],
      ["stale", "fail"],
      ["cancelled", "cancelled"],
      ["skipped", "skipping"],
      ["neutral", "neutral"],
      ["pending", "pending"],
      ["status-error", "fail"],
      ["status-pending", "pending"],
    ])
  })

  it("marks a real green GitHub response READY", () => {
    const snapshot = parsePRGraphql({
      data: {
        repository: {
          pullRequest: {
            state: "OPEN",
            reviewThreads: { nodes: [] },
            statusCheckRollup: { contexts: { nodes: [{ name: "ci-ok", conclusion: "SUCCESS" }] } },
          },
        },
      },
    })

    expect(isReady(snapshot)).toBe(true)
  })

  it.each(["FAILURE", "TIMED_OUT", "ACTION_REQUIRED", "STALE"])("wakes for a real GitHub %s check", (conclusion) => {
    const previous = parsePRGraphql({
      data: { repository: { pullRequest: { statusCheckRollup: { contexts: { nodes: [{ name: "ci-ok", conclusion: null }] } } } } },
    })
    const next = parsePRGraphql({
      data: { repository: { pullRequest: { statusCheckRollup: { contexts: { nodes: [{ name: "ci-ok", conclusion }] } } } } },
    })

    expect(diffSnapshot(previous, next).failedChecks).toEqual([{ name: "ci-ok", state: "fail" }])
  })
})
