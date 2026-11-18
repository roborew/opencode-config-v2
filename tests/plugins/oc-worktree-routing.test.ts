import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ execSync: vi.fn() }))
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, execSync: mocks.execSync }
})

import worktreePlugin from "../../plugins/oc-worktree/index"
import type { SliceRecord } from "../../plugins/oc-worktree/lib"

function memoryStorage() {
  const values = new Map<string, any>()
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

async function setupWorktree(record: SliceRecord) {
  const tools = new Map<string, any>()
  const storage = memoryStorage()
  storage.values.set(`slices/${record.issue}`, record)
  const prompt = vi.fn(async (_input: any) => undefined)
  const ctx = {
    options: { worktreeRoot: "/tmp" },
    location: { directory: "/repo", project: { id: "project", canonical: "/repo" } },
    storage,
    worktree: { transform: async (callback: any) => callback({ add: vi.fn() }) },
    tool: {
      transform: async (callback: any) => callback({
        namespace: vi.fn(),
        add: (tool: any) => tools.set(tool.name, tool),
      }),
    },
    session: {
      get: vi.fn(async ({ sessionID }: { sessionID: string }) => ({
        location: { directory: sessionID === "coordinator" ? "/repo" : record.directory },
      })),
      prompt,
    },
  }

  await worktreePlugin.setup(ctx as any)
  return { tools, storage, prompt }
}

const record = (): SliceRecord => ({
  issue: 7,
  title: "Empty states",
  labels: ["slice"],
  branch: "slice/7-empty-states",
  directory: "/worktrees/slice-7-empty-states",
  sessionID: "worker-7",
  coordinatorSessionID: "coordinator",
  state: "ready",
  prURL: "https://github.com/example/app/pull/12",
  createdAt: 1,
})

describe("central build to slice worker routing", () => {
  beforeEach(() => {
    mocks.execSync.mockReset()
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view")) {
        return Buffer.from(JSON.stringify({ state: "OPEN", url: record().prURL }))
      }
      return Buffer.from("")
    })
  })

  it("resumes the existing worker with user feedback and marks the slice building", async () => {
    const { tools, storage, prompt } = await setupWorktree(record())

    const result = await tools.get("message").execute(
      { issue: 7, text: "The empty state is missing its recovery action." },
      { sessionID: "coordinator" },
    )

    expect(result.content).toContain("slice #7")
    expect(prompt).toHaveBeenCalledTimes(1)
    const message = prompt.mock.calls[0]![0]
    expect(message).toMatchObject({ sessionID: "worker-7", delivery: "queue" })
    expect(message.text).toContain("The empty state is missing its recovery action.")
    expect(message.text).toContain("existing worktree and PR")
    expect(message.text).toContain("prmon_watch")
    expect(storage.values.get("slices/7").state).toBe("building")
  })

  it("does not start a duplicate worker for an active READY slice", async () => {
    const { tools, prompt } = await setupWorktree(record())

    const result = await tools.get("start").execute({ issue: 7 }, { sessionID: "coordinator" })

    expect(result.content).toContain("already active")
    expect(result.content).toContain("ready")
    expect(prompt).not.toHaveBeenCalled()
    expect(mocks.execSync).not.toHaveBeenCalled()
  })

  it("rejects feedback for a merged PR and directs the user to a new slice", async () => {
    const { tools, prompt } = await setupWorktree(record())
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view")) {
        return Buffer.from(JSON.stringify({ state: "MERGED", url: record().prURL }))
      }
      return Buffer.from("")
    })

    const result = await tools.get("message").execute({ issue: 7, text: "A post-merge defect" }, { sessionID: "coordinator" })

    expect(result.content).toContain("MERGED")
    expect(result.content).toContain("new slice")
    expect(prompt).not.toHaveBeenCalled()
  })

  it("backfills the coordinator session on legacy records from central slice_status", async () => {
    const legacy = { ...record(), coordinatorSessionID: undefined }
    const { tools, storage } = await setupWorktree(legacy)

    const result = await tools.get("status").execute({}, { sessionID: "coordinator" })

    expect(result.content).toContain("#7")
    expect(storage.values.get("slices/7").coordinatorSessionID).toBe("coordinator")
  })

  it("refuses to route feedback without the existing worker session", async () => {
    const withoutSession = { ...record(), sessionID: undefined }
    const { tools, prompt } = await setupWorktree(withoutSession)

    const result = await tools.get("message").execute({ issue: 7, text: "Please fix this" }, { sessionID: "coordinator" })

    expect(result.content).toContain("BLOCKED")
    expect(prompt).not.toHaveBeenCalled()
  })
})

describe("slice worker BLOCKED reporting", () => {
  beforeEach(() => {
    mocks.execSync.mockReset()
    mocks.execSync.mockReturnValue(Buffer.from(""))
  })

  it("records BLOCKED, comments on the issue, and notifies the central session", async () => {
    const { tools, storage, prompt } = await setupWorktree(record())

    const result = await tools.get("block").execute(
      { issue: 7, reason: "The spec does not define the recovery behaviour." },
      { sessionID: "worker-7" },
    )

    expect(result.content).toContain("BLOCKED")
    expect(storage.values.get("slices/7").state).toBe("blocked")
    expect(mocks.execSync).toHaveBeenCalledWith(
      expect.stringContaining("gh issue comment 7"),
      expect.anything(),
    )
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: "coordinator",
      delivery: "queue",
    }))
    expect(prompt.mock.calls[0]![0].text).toContain("The spec does not define the recovery behaviour.")
  })

  it("reports a missing coordinator without claiming delivery", async () => {
    const legacy = { ...record(), coordinatorSessionID: undefined }
    const { tools, storage } = await setupWorktree(legacy)

    const result = await tools.get("block").execute(
      { issue: 7, reason: "The spec does not define the recovery behaviour." },
      { sessionID: "worker-7" },
    )

    expect(storage.values.get("slices/7").state).toBe("blocked")
    expect(result.content).toContain("no coordinator session is recorded")
    expect(result.content).toContain("slice_status")
    expect(result.content).not.toContain("reported to the central build session; go idle")
  })

  it("records BLOCKED but honestly reports a coordinator delivery failure", async () => {
    const { tools, storage, prompt } = await setupWorktree(record())
    prompt.mockRejectedValueOnce(new Error("session unavailable"))

    const result = await tools.get("block").execute(
      { issue: 7, reason: "The spec does not define the recovery behaviour." },
      { sessionID: "worker-7" },
    )

    expect(storage.values.get("slices/7").state).toBe("blocked")
    expect(result.content).toContain("notification failed")
    expect(result.content).toContain("session unavailable")
    expect(result.content).not.toContain("reported to the central build session; go idle")
  })
})
