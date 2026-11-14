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
    expect(text).toContain("Robin merges")
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
      data: { repository: { pullRequest: { state: "OPEN", reviewThreads: { nodes: [{ id: "RT_1", isResolved: false, comments: { nodes: [{ body: "please fix" }] } }] }, statusCheckRollup: { contexts: [{ name: "ci-ok", conclusion: "SUCCESS" }, { name: "status", state: "failure" }] } } } },
    }
    const snapshot = parsePRGraphql(json)
    expect(snapshot.state).toBe("OPEN")
    expect(snapshot.threads).toEqual([{ id: "RT_1", resolved: false, lastBody: "please fix" }])
    expect(snapshot.checks.map((c) => [c.name, c.state])).toEqual([["ci-ok", "success"], ["status", "failure"]])
    expect(parsePRGraphql({}).threads).toEqual([])
  })
})
