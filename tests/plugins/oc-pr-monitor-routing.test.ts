import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ execSync: vi.fn(), execFileSync: vi.fn() }))
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, execSync: mocks.execSync, execFileSync: mocks.execFileSync }
})

import monitorPlugin from "../../plugins/oc-pr-monitor/index"
import type { SliceRecord } from "../../plugins/oc-worktree/lib"

const prURL = "https://github.com/example/app/pull/12"

function memoryStorage(record: SliceRecord) {
  const values = new Map<string, any>([[`slices/${record.issue}`, record]])
  return {
    values,
    get: vi.fn(async (key: string) => values.get(key)),
    set: vi.fn(async (key: string, value: any) => void values.set(key, value)),
    remove: vi.fn(async (key: string) => void values.delete(key)),
    scan: vi.fn(async ({ prefix }: { prefix: string }) => ({
      entries: [...values.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })),
      next: undefined,
    })),
  }
}

function githubResponse(state = "OPEN", unresolvedBody?: string, conclusion = "SUCCESS") {
  return {
    data: {
      repository: {
        pullRequest: {
          state,
          reviewThreads: {
            nodes: unresolvedBody
              ? [{ id: "thread-1", isResolved: false, comments: { nodes: [{ body: unresolvedBody }] } }]
              : [],
          },
          statusCheckRollup: { contexts: { nodes: [{ name: "ci-ok", conclusion }] } },
        },
      },
    },
  }
}

async function setupMonitor(maxRounds = 5, response: () => any = () => githubResponse()) {
  mocks.execFileSync.mockImplementation(() => Buffer.from(JSON.stringify(response())))
  const tools = new Map<string, any>()
  const record: SliceRecord = {
    issue: 7,
    title: "Empty states",
    labels: ["slice"],
    branch: "slice/7-empty-states",
    directory: "/worktrees/slice-7-empty-states",
    sessionID: "worker-7",
    coordinatorSessionID: "coordinator",
    state: "building",
    createdAt: 1,
  }
  const storage = memoryStorage(record)
  const prompt = vi.fn(async (_input: any) => undefined)
  const ctx = {
    options: { intervalMs: 1000, maxRounds },
    location: { directory: "/repo", project: { canonical: "/repo" } },
    storage,
    tool: {
      transform: async (callback: any) => callback({
        namespace: vi.fn(),
        add: (tool: any) => tools.set(tool.name, tool),
      }),
    },
    session: {
      get: vi.fn(async () => ({ location: { directory: record.directory } })),
      prompt,
    },
  }
  await monitorPlugin.setup(ctx as any)
  return { tools, storage, prompt }
}

describe("PR monitor coordinator lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.execSync.mockReset()
    mocks.execFileSync.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("keeps watching after READY, resumes for late feedback, and reports MERGED", async () => {
    let response = githubResponse()
    const { tools, storage, prompt } = await setupMonitor(5, () => response)
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 12")) return Buffer.from(JSON.stringify({ url: prURL, headRefName: "slice/7-empty-states" }))
      if (command.includes("gh api graphql")) return Buffer.from(JSON.stringify(response))
      return Buffer.from("")
    })

    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    expect(storage.values.get("slices/7")).toMatchObject({ state: "in-review", prURL })
    await vi.advanceTimersByTimeAsync(1000)

    expect(storage.values.get("slices/7").state).toBe("ready")
    expect(storage.values.get("watches/7")).toMatchObject({ active: true, readyNotified: true })
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ sessionID: "worker-7" }))
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: "coordinator",
      text: expect.stringContaining("READY"),
    }))
    const graphqlArgs = mocks.execFileSync.mock.calls[0]![1] as string[]
    expect(mocks.execFileSync.mock.calls[0]![0]).toBe("gh")
    expect(graphqlArgs.some((arg) => arg.includes("query($owner:String!,$name:String!,$number:Int!)") && arg.includes("contexts(first:100){nodes{"))).toBe(true)
    expect(graphqlArgs).toContain("owner=example")

    // An explicit re-watch after user feedback must replace the live timer's
    // stale READY state, even when CI is already green again.
    prompt.mockClear()
    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: "coordinator",
      text: expect.stringContaining("READY"),
    }))

    prompt.mockClear()
    response = githubResponse("OPEN", "Please cover the recovery path", "FAILURE")
    await vi.advanceTimersByTimeAsync(1000)

    expect(storage.values.get("slices/7").state).toBe("in-review")
    expect(storage.values.get("watches/7")).toMatchObject({ active: true, readyNotified: false, round: 1 })
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: "worker-7",
      text: expect.stringContaining("Please cover the recovery path"),
    }))

    prompt.mockClear()
    response = githubResponse("MERGED")
    await vi.advanceTimersByTimeAsync(1000)

    expect(storage.values.get("watches/7").active).toBe(false)
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: "coordinator",
      text: expect.stringContaining("MERGED"),
    }))
  })

  it("reports the round-cap BLOCKED state to the coordinator", async () => {
    const { tools, storage, prompt } = await setupMonitor(0, () => githubResponse("OPEN", "Still broken", "FAILURE"))
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 12")) return Buffer.from(JSON.stringify({ url: prURL, headRefName: "slice/7-empty-states" }))
      return Buffer.from("")
    })

    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    prompt.mockImplementation(async (input: any) => {
      if (input.sessionID === "coordinator") throw new Error("coordinator unavailable")
    })
    await vi.advanceTimersByTimeAsync(1000)

    expect(storage.values.get("slices/7").state).toBe("blocked")
    expect(storage.values.get("watches/7").active).toBe(true)

    prompt.mockImplementation(async () => undefined)
    prompt.mockClear()
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.values.get("watches/7").active).toBe(false)
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: "coordinator",
      text: expect.stringContaining("BLOCKED"),
    }))
  })

  it("retries READY and MERGED coordinator notifications after transient failures", async () => {
    let response = githubResponse()
    const { tools, storage, prompt } = await setupMonitor(5, () => response)
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 12")) return Buffer.from(JSON.stringify({ url: prURL, headRefName: "slice/7-empty-states" }))
      if (command.includes("gh api graphql")) return Buffer.from(JSON.stringify(response))
      return Buffer.from("")
    })
    prompt.mockImplementation(async (input: any) => {
      if (input.sessionID === "coordinator") throw new Error("coordinator unavailable")
    })

    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.values.get("watches/7")).toMatchObject({ active: true, readyNotified: false })
    const workerWakes = prompt.mock.calls.filter(([input]) => input.sessionID === "worker-7").length
    expect(workerWakes).toBe(1)

    prompt.mockImplementation(async () => undefined)
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.values.get("watches/7")).toMatchObject({ active: true, readyNotified: true })
    expect(prompt.mock.calls.filter(([input]) => input.sessionID === "worker-7")).toHaveLength(workerWakes)

    response = githubResponse("MERGED")
    prompt.mockImplementation(async (input: any) => {
      if (input.sessionID === "coordinator") throw new Error("coordinator unavailable")
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.values.get("watches/7").active).toBe(true)

    prompt.mockImplementation(async () => undefined)
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.values.get("watches/7").active).toBe(false)
  })

  it("rejects a PR whose head branch does not belong to the slice", async () => {
    const { tools, storage } = await setupMonitor()
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 13")) return Buffer.from(JSON.stringify({ url: "https://github.com/example/app/pull/13", headRefName: "slice/99-other" }))
      return Buffer.from("")
    })

    const result = await tools.get("watch").execute({ slice: 7, pr: 13 }, { sessionID: "worker-7" })

    expect(result.content).toContain("belongs to slice/99-other")
    expect(storage.values.get("slices/7").state).toBe("building")
    expect(storage.values.get("watches/7")).toBeUndefined()
  })

  it("keeps the old watch running when replacement registration fails", async () => {
    let response = githubResponse()
    const { tools, storage, prompt } = await setupMonitor(5, () => response)
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 12")) return Buffer.from(JSON.stringify({ url: prURL, headRefName: "slice/7-empty-states" }))
      return Buffer.from("")
    })

    const oldWatch = await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    expect(oldWatch.content).toContain("watching PR #12")
    storage.set.mockRejectedValueOnce(new Error("storage unavailable"))

    const replacement = await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    expect(replacement.content).toContain("could not register the replacement watch")

    prompt.mockClear()
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.values.get("slices/7").state).toBe("ready")
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ sessionID: "worker-7" }))
  })

  it("retries a failed worker READY prompt without repeating coordinator delivery", async () => {
    const { tools, storage, prompt } = await setupMonitor()
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 12")) return Buffer.from(JSON.stringify({ url: prURL, headRefName: "slice/7-empty-states" }))
      return Buffer.from("")
    })
    let workerFailed = false
    prompt.mockImplementation(async (input: any) => {
      if (input.sessionID === "worker-7" && !workerFailed) {
        workerFailed = true
        throw new Error("worker unavailable")
      }
    })

    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.values.get("watches/7")).toMatchObject({ readyWorkerNotified: false, readyNotified: true })
    const commentCount = mocks.execSync.mock.calls.filter(([command]) => command.includes("pr comment 12")).length

    prompt.mockClear()
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.values.get("watches/7")).toMatchObject({ readyWorkerNotified: true, readyNotified: true })
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ sessionID: "worker-7" }))
    expect(mocks.execSync.mock.calls.filter(([command]) => command.includes("pr comment 12"))).toHaveLength(commentCount)
  })

  it("honours a durable worker BLOCKED state and stops without overwriting it", async () => {
    const { tools, storage, prompt } = await setupMonitor()
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 12")) return Buffer.from(JSON.stringify({ url: prURL, headRefName: "slice/7-empty-states" }))
      if (command.includes("gh api graphql")) return Buffer.from(JSON.stringify(githubResponse()))
      return Buffer.from("")
    })

    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    storage.values.get("slices/7").state = "blocked"
    prompt.mockClear()
    await vi.advanceTimersByTimeAsync(1000)

    expect(storage.values.get("slices/7").state).toBe("blocked")
    expect(storage.values.get("watches/7").active).toBe(false)
    expect(prompt).not.toHaveBeenCalledWith(expect.objectContaining({ sessionID: "worker-7" }))
  })

  it("moves durable state back to in-review when a failed READY becomes non-READY", async () => {
    let response = githubResponse()
    const { tools, storage, prompt } = await setupMonitor(5, () => response)
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 12")) return Buffer.from(JSON.stringify({ url: prURL, headRefName: "slice/7-empty-states" }))
      if (command.includes("gh api graphql")) return Buffer.from(JSON.stringify(response))
      return Buffer.from("")
    })
    prompt.mockImplementation(async (input: any) => {
      if (input.sessionID === "coordinator") throw new Error("coordinator unavailable")
    })

    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.values.get("slices/7").state).toBe("ready")
    expect(storage.values.get("watches/7").readyNotified).toBe(false)

    response = githubResponse("OPEN", "Late feedback", "FAILURE")
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.values.get("slices/7").state).toBe("in-review")
  })

  it("does not let an in-flight MERGED tick stop its replacement watch", async () => {
    let response = githubResponse("MERGED")
    const { tools, storage, prompt } = await setupMonitor(5, () => response)
    let releaseCoordinator: (() => void) | undefined
    const coordinatorPending = new Promise<void>((resolve) => { releaseCoordinator = resolve })
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 12")) return Buffer.from(JSON.stringify({ url: prURL, headRefName: "slice/7-empty-states" }))
      if (command.includes("gh api graphql")) return Buffer.from(JSON.stringify(response))
      return Buffer.from("")
    })
    prompt.mockImplementation(async (input: any) => {
      if (input.sessionID === "coordinator") await coordinatorPending
    })

    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    await vi.advanceTimersByTimeAsync(1000)
    response = githubResponse()
    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    releaseCoordinator!()
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1000)

    expect(storage.values.get("watches/7")).toMatchObject({ active: true, readyNotified: true })
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: "coordinator",
      text: expect.stringContaining("READY"),
    }))
  })

  it("serializes a replacement behind an in-flight durable state write", async () => {
    const { tools, storage } = await setupMonitor()
    let releaseStateWrite: (() => void) | undefined
    const stateWritePending = new Promise<void>((resolve) => { releaseStateWrite = resolve })
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 12")) return Buffer.from(JSON.stringify({ url: prURL, headRefName: "slice/7-empty-states" }))
      if (command.includes("gh api graphql")) return Buffer.from(JSON.stringify(githubResponse()))
      return Buffer.from("")
    })

    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    storage.set.mockImplementation(async (key: string, value: any) => {
      if (key === "slices/7" && value.state === "ready") await stateWritePending
      storage.values.set(key, value)
    })
    await vi.advanceTimersByTimeAsync(1000)

    const replacing = tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    releaseStateWrite!()
    await replacing
    await vi.advanceTimersByTimeAsync(0)

    expect(storage.values.get("slices/7").state).toBe("in-review")
    expect(storage.values.get("watches/7").active).toBe(true)
  })

  it("pauses READY transitions while slice_message owns the building state", async () => {
    const { tools, storage, prompt } = await setupMonitor()
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 12")) return Buffer.from(JSON.stringify({ url: prURL, headRefName: "slice/7-empty-states" }))
      if (command.includes("gh api graphql")) return Buffer.from(JSON.stringify(githubResponse()))
      return Buffer.from("")
    })

    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    storage.values.get("slices/7").state = "building"
    prompt.mockClear()
    await vi.advanceTimersByTimeAsync(1000)

    expect(storage.values.get("slices/7").state).toBe("building")
    expect(storage.values.get("watches/7").readyNotified).toBe(false)
    expect(prompt).not.toHaveBeenCalled()
  })

  it("does not acknowledge READY if BLOCKED arrives while its prompt is pending", async () => {
    const { tools, storage, prompt } = await setupMonitor()
    let releaseCoordinator: (() => void) | undefined
    const coordinatorPending = new Promise<void>((resolve) => { releaseCoordinator = resolve })
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 12")) return Buffer.from(JSON.stringify({ url: prURL, headRefName: "slice/7-empty-states" }))
      if (command.includes("gh api graphql")) return Buffer.from(JSON.stringify(githubResponse()))
      return Buffer.from("")
    })
    prompt.mockImplementation(async (input: any) => {
      if (input.sessionID === "coordinator") await coordinatorPending
    })

    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    await vi.advanceTimersByTimeAsync(1000)
    storage.values.get("slices/7").state = "blocked"
    releaseCoordinator!()
    await vi.advanceTimersByTimeAsync(0)

    expect(storage.values.get("slices/7").state).toBe("blocked")
    expect(storage.values.get("watches/7")).toMatchObject({ active: false, readyNotified: false })
  })

  it("keeps READY pending until the coordinator is backfilled", async () => {
    let response = githubResponse()
    const { tools, storage, prompt } = await setupMonitor(5, () => response)
    storage.values.get("slices/7").coordinatorSessionID = undefined
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 12")) return Buffer.from(JSON.stringify({ url: prURL, headRefName: "slice/7-empty-states" }))
      return Buffer.from("")
    })

    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.values.get("watches/7")).toMatchObject({ active: true, readyNotified: false })
    expect(prompt.mock.calls.filter(([input]) => input.sessionID === "worker-7")).toHaveLength(1)
    expect(mocks.execSync.mock.calls.filter(([command]) => command.includes("pr comment 12"))).toHaveLength(1)

    storage.values.get("slices/7").coordinatorSessionID = "coordinator"
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.values.get("watches/7")).toMatchObject({ active: true, readyNotified: true })
    expect(prompt.mock.calls.filter(([input]) => input.sessionID === "worker-7")).toHaveLength(1)
    expect(mocks.execSync.mock.calls.filter(([command]) => command.includes("pr comment 12"))).toHaveLength(1)

    response = githubResponse("MERGED")
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.values.get("watches/7").active).toBe(false)
  })

  it("stops cleanly when slice_finish removes the record before the merge poll", async () => {
    const { tools, storage } = await setupMonitor()
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view 12")) return Buffer.from(JSON.stringify({ url: prURL, headRefName: "slice/7-empty-states" }))
      return Buffer.from("")
    })

    await tools.get("watch").execute({ slice: 7, pr: 12 }, { sessionID: "worker-7" })
    storage.values.delete("slices/7")
    await vi.advanceTimersByTimeAsync(1000)

    expect(storage.values.get("watches/7").active).toBe(false)
    expect(mocks.execFileSync).not.toHaveBeenCalled()
  })
})
