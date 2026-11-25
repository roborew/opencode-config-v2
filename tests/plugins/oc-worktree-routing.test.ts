import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ execSync: vi.fn() }))
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, execSync: mocks.execSync }
})

import worktreePlugin from "../../plugins/oc-worktree/index"
import type { SliceRecord } from "../../plugins/oc-worktree/lib"
import { readSlice, removeSlice, updateSlice, writeSlice } from "../../plugins/shared/slice-store"

function memoryStorage(canonical: string) {
  const values = new Map<string, any>()
  const issue = (key: string) => key.startsWith("slices/") ? Number(key.slice("slices/".length)) : undefined
  const facade = {
    get: (key: string) => {
      const n = issue(key)
      return n === undefined ? values.get(key) : readSlice(canonical, n)
    },
    set: (key: string, value: any) => {
      const n = issue(key)
      if (n === undefined) values.set(key, structuredClone(value))
      else updateSlice(canonical, n, () => structuredClone(value))
    },
    delete: (key: string) => {
      const n = issue(key)
      if (n === undefined) values.delete(key)
      else removeSlice(canonical, n)
    },
  }
  return {
    values: facade,
    get: vi.fn(async (key: string) => structuredClone(values.get(key))),
    set: vi.fn(async (key: string, value: any) => void values.set(key, structuredClone(value))),
    remove: vi.fn(async (key: string) => void values.delete(key)),
    scan: vi.fn(async ({ prefix }: { prefix: string }) => ({
      entries: [...values.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value: structuredClone(value) })),
      next: undefined,
    })),
  }
}

async function setupWorktree(record: SliceRecord) {
  const tools = new Map<string, any>()
  const canonical = mkdtempSync(join(tmpdir(), "repo-"))
  writeSlice(canonical, record)
  const storage = memoryStorage(canonical)
  const prompt = vi.fn(async (_input: any) => undefined)
  const create = vi.fn(async () => ({ id: "recovered-7" }))
  const command = vi.fn(async () => undefined)
  const update = vi.fn(async (_input: any) => undefined)
  const interrupt = vi.fn(async () => ({ interrupted: false }))
  const ctx = {
    options: { worktreeRoot: "/tmp" },
    location: { directory: canonical, project: { id: "project", canonical } },
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
        location: { directory: sessionID === "coordinator" ? canonical : record.directory },
      })),
      prompt,
      create,
      command,
      update,
      interrupt,
    },
  }

  await worktreePlugin.setup(ctx as any)
  return { tools, storage, prompt, ctx, canonical }
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

  it("recovers an existing record that has no worker session", async () => {
    const withoutSession = { ...record(), sessionID: undefined }
    const { tools, storage, ctx } = await setupWorktree(withoutSession)

    const result = await tools.get("start").execute({ issue: 7 }, { sessionID: "coordinator" })

    expect(result.content).toContain("recovered worker session recovered-7")
    expect(storage.values.get("slices/7").sessionID).toBe("recovered-7")
    expect(ctx.session.command).toHaveBeenCalledWith({ sessionID: "recovered-7", name: "build", text: "#7" })
  })

  it("recovers a BLOCKED worker without changing its status label", async () => {
    const blocked: SliceRecord = { ...record(), sessionID: undefined, state: "blocked", blockedReason: "spec gap" }
    const { tools, storage } = await setupWorktree(blocked)

    const result = await tools.get("start").execute({ issue: 7 }, { sessionID: "coordinator" })

    expect(result.content).toContain("recovered worker session recovered-7")
    expect(storage.values.get("slices/7")).toMatchObject({ state: "blocked", sessionID: "recovered-7" })
    const labelCall = String(
      mocks.execSync.mock.calls.find(([command]) => String(command).includes("--add-label status:"))?.[0],
    )
    expect(labelCall).toContain("--add-label status:blocked")
    expect(labelCall).not.toContain("--add-label status:in-progress")
  })

  it("fails closed when slice_message cannot read the caller location", async () => {
    const { tools, prompt, ctx } = await setupWorktree(record())
    ctx.session.get.mockRejectedValueOnce(new Error("session lookup failed"))

    const result = await tools.get("message").execute({ issue: 7, text: "Please fix this" }, { sessionID: "coordinator" })

    expect(result.content).toContain("cannot verify the caller's session location")
    expect(prompt).not.toHaveBeenCalled()
  })

  it("does not overwrite a BLOCKED state reported while feedback is queued", async () => {
    const { tools, storage, prompt } = await setupWorktree(record())
    let releasePrompt: (() => void) | undefined
    prompt.mockImplementationOnce(async () => new Promise<undefined>((resolve) => { releasePrompt = () => resolve(undefined) }))

    const feedback = tools.get("message").execute({ issue: 7, text: "Please fix this" }, { sessionID: "coordinator" })
    await Promise.resolve()
    await Promise.resolve()
    storage.values.set("slices/7", { ...record(), state: "blocked", blockedReason: "New blocker" })
    releasePrompt!()
    const result = await feedback

    expect(storage.values.get("slices/7").state).toBe("blocked")
    expect(result.content).toContain("changed state while feedback was queued")
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

  it("resumes a BLOCKED slice in its existing worker from central build", async () => {
    const blocked = { ...record(), state: "blocked" as const, blockedReason: "Spec gap", prURL: undefined }
    const { tools, storage, prompt } = await setupWorktree(blocked)

    const result = await tools.get("resume").execute({ issue: 7 }, { sessionID: "coordinator" })

    expect(result.content).toContain("resumed")
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ sessionID: "worker-7" }))
    expect(storage.values.get("slices/7").state).toBe("building")
    expect(storage.values.get("slices/7").blockedReason).toBeUndefined()
  })

  it("persists the PR URL resolved from slice_message", async () => {
    const withoutURL = { ...record(), prURL: undefined }
    const { tools, storage } = await setupWorktree(withoutURL)

    await tools.get("message").execute({ issue: 7, text: "Please fix this" }, { sessionID: "coordinator" })

    expect(storage.values.get("slices/7").prURL).toBe(record().prURL)
  })

  it("clears syncPending when a merge conflict blocks the slice", async () => {
    const directory = mkdtempSync(join(tmpdir(), "sync-conflict-"))
    const { tools, storage } = await setupWorktree({ ...record(), state: "building", directory })
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("git merge origin/main")) {
        throw Object.assign(new Error("conflict"), { status: 1, stdout: "conflict" })
      }
      return Buffer.from("")
    })

    const result = await tools.get("sync").execute({}, { sessionID: "coordinator" })

    expect(result.content).toContain("BLOCKED")
    expect(storage.values.get("slices/7")).toMatchObject({ state: "blocked", syncPending: false })
  })

  it("retries a failed GitHub status label through slice_status", async () => {
    const { tools, storage } = await setupWorktree(record())
    let firstLabelAttempt = true
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view")) return Buffer.from(JSON.stringify({ state: "OPEN", url: record().prURL }))
      if (command.includes("gh issue edit") && firstLabelAttempt) {
        firstLabelAttempt = false
        throw Object.assign(new Error("label failed"), { status: 1, stdout: "label failed" })
      }
      return Buffer.from("")
    })

    const message = await tools.get("message").execute({ issue: 7, text: "Please fix this" }, { sessionID: "coordinator" })
    expect(message.content).toContain("label retry pending")
    expect(storage.values.get("slices/7").pendingLabel).toBe("in-progress")

    await tools.get("status").execute({}, { sessionID: "coordinator" })
    expect(storage.values.get("slices/7").pendingLabel).toBeUndefined()
  })

  it("does not recreate a legacy record removed during coordinator backfill", async () => {
    const legacy = { ...record(), coordinatorSessionID: undefined }
    const { tools, storage, ctx, canonical } = await setupWorktree(legacy)
    let release: (() => void) | undefined
    ctx.session.get.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ location: { directory: canonical } })
    }))

    const status = tools.get("status").execute({}, { sessionID: "coordinator" })
    await Promise.resolve()
    await Promise.resolve()
    storage.values.delete("slices/7")
    release!()
    await status

    expect(storage.values.get("slices/7")).toBeUndefined()
  })

  it("marks a slice pending when sync cannot reach its worktree", async () => {
    const { tools, storage } = await setupWorktree({ ...record(), state: "building" })

    const result = await tools.get("sync").execute({}, { sessionID: "coordinator" })

    expect(result.content).toContain("sync pending")
    expect(storage.values.get("slices/7").syncPending).toBe(true)
  })

  it("uses only supported gh pr view fields in slice_finish", async () => {
    const { tools } = await setupWorktree(record())
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view")) return Buffer.from(JSON.stringify({ state: "MERGED", url: record().prURL }))
      return Buffer.from("")
    })

    await tools.get("finish").execute({ issue: 7 }, { sessionID: "coordinator" })

    const prView = mocks.execSync.mock.calls.find(([command]) => command.includes("gh pr view"))![0]
    expect(prView).toContain("--json state,url")
    expect(prView).not.toContain("merged")
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

  it("retains the blocker reason and reports a failed issue comment", async () => {
    const legacy = { ...record(), coordinatorSessionID: undefined }
    const { tools, storage } = await setupWorktree(legacy)
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh issue comment")) {
        throw Object.assign(new Error("comment failed"), { status: 1, stdout: "comment failed" })
      }
      return Buffer.from("")
    })

    const result = await tools.get("block").execute(
      { issue: 7, reason: "Keep this reason" },
      { sessionID: "worker-7" },
    )

    expect(storage.values.get("slices/7")).toMatchObject({ state: "blocked", blockedReason: "Keep this reason" })
    expect(result.content).toContain("issue comment failed")
    expect(result.content).not.toContain("commented on its issue,")
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

describe("slice worker question deny", () => {
  const denyRule = { action: "question", resource: "*", effect: "deny" }

  it("denies the question tool on a recovered worker session", async () => {
    const withoutSession = { ...record(), sessionID: undefined }
    const { tools, ctx } = await setupWorktree(withoutSession)

    await tools.get("start").execute({ issue: 7 }, { sessionID: "coordinator" })

    expect(ctx.session.update).toHaveBeenCalledWith({
      sessionID: "recovered-7",
      permissions: [denyRule],
    })
  })

  it("re-asserts the question deny on legacy worker sessions from slice_status", async () => {
    const legacy = { ...record(), sessionID: "worker-7" }
    const { tools, ctx } = await setupWorktree(legacy)

    await tools.get("status").execute({}, { sessionID: "coordinator" })

    expect(ctx.session.update).toHaveBeenCalledWith({
      sessionID: "worker-7",
      permissions: [denyRule],
    })
  })

  it("does not touch worker permissions from outside the main checkout", async () => {
    const { tools, ctx } = await setupWorktree(record())

    await tools.get("status").execute({}, { sessionID: "worker-7" })

    expect(ctx.session.update).not.toHaveBeenCalled()
  })
})

describe("slice question recording and coordinator answers", () => {
  beforeEach(() => {
    mocks.execSync.mockReset()
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view")) {
        return Buffer.from(JSON.stringify({ state: "OPEN", url: record().prURL }))
      }
      return Buffer.from("")
    })
  })

  it("records the question, comments on the issue and notifies the coordinator with the answer path", async () => {
    const { tools, storage, prompt } = await setupWorktree(record())

    const result = await tools.get("block").execute(
      { issue: 7, reason: "local main is behind origin/main", question: "May I fast-forward the local main ref?" },
      { sessionID: "worker-7" },
    )

    expect(result.content).toContain("BLOCKED")
    expect(storage.values.get("slices/7")).toMatchObject({
      state: "blocked",
      blockedQuestion: "May I fast-forward the local main ref?",
      blockedReason: "local main is behind origin/main",
    })
    const comment = mocks.execSync.mock.calls.find(([command]) => String(command).includes("gh issue comment"))![0]
    expect(String(comment)).toContain("May I fast-forward the local main ref?")
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ sessionID: "coordinator", delivery: "queue" }))
    const notification = prompt.mock.calls[0]![0]
    expect(notification.text).toContain("May I fast-forward the local main ref?")
    expect(notification.text).toContain("slice_resume")
    expect(notification.text).toContain("answer")
  })

  it("keeps the plain blocker notification unchanged when no question is asked", async () => {
    const { tools, prompt } = await setupWorktree(record())

    await tools.get("block").execute({ issue: 7, reason: "spec gap" }, { sessionID: "worker-7" })

    const notification = prompt.mock.calls[0]![0]
    expect(notification.text).toContain("Slice #7 is BLOCKED: spec gap")
    expect(notification.text).not.toContain("asks the central Build coordinator")
  })

  it("requires the coordinator's answer before resuming a question-blocked slice", async () => {
    const blocked = { ...record(), state: "blocked" as const, blockedReason: "stale main", blockedQuestion: "May I fast-forward the local main ref?" }
    const { tools, prompt } = await setupWorktree(blocked)

    const result = await tools.get("resume").execute({ issue: 7 }, { sessionID: "coordinator" })

    expect(result.content).toContain("answer")
    expect(result.content).toContain("May I fast-forward the local main ref?")
    expect(prompt).not.toHaveBeenCalled()
  })

  it("delivers the question and answer to the same existing worker session", async () => {
    const blocked = { ...record(), state: "blocked" as const, blockedReason: "stale main", blockedQuestion: "May I fast-forward the local main ref?", prURL: undefined }
    const { tools, storage, prompt, ctx } = await setupWorktree(blocked)

    const result = await tools.get("resume").execute(
      { issue: 7, answer: "Yes — fast-forward the local main ref." },
      { sessionID: "coordinator" },
    )

    expect(result.content).toContain("resumed")
    expect(ctx.session.interrupt).toHaveBeenCalledWith({ sessionID: "worker-7", resume: false })
    expect(prompt).toHaveBeenCalledTimes(1)
    const message = prompt.mock.calls[0]![0]
    expect(message.sessionID).toBe("worker-7")
    expect(message.text).toContain("May I fast-forward the local main ref?")
    expect(message.text).toContain("Yes — fast-forward the local main ref.")
    const saved = storage.values.get("slices/7")
    expect(saved.state).toBe("building")
    expect(saved.blockedQuestion).toBeUndefined()
  })

  it("settles a worker stuck on a question form without creating anything new", async () => {
    const building = { ...record(), state: "building" as const }
    const { tools, storage, prompt, ctx } = await setupWorktree(building)

    const result = await tools.get("resume").execute(
      { issue: 7, answer: "Yes — fast-forward the local main ref." },
      { sessionID: "coordinator" },
    )

    expect(result.content).toContain("answer delivered")
    expect(ctx.session.interrupt).toHaveBeenCalledWith({ sessionID: "worker-7", resume: false })
    const message = prompt.mock.calls[0]![0]
    expect(message.sessionID).toBe("worker-7")
    expect(message.text).toContain("Yes — fast-forward the local main ref.")
    expect(storage.values.get("slices/7").state).toBe("building")
  })

  it("still refuses a plain resume for a slice that is not BLOCKED", async () => {
    const { tools, prompt } = await setupWorktree(record())

    const result = await tools.get("resume").execute({ issue: 7 }, { sessionID: "coordinator" })

    expect(result.content).toContain("not BLOCKED")
    expect(prompt).not.toHaveBeenCalled()
  })

  it("does not settle a READY slice waiting for user review", async () => {
    const { tools, prompt } = await setupWorktree(record())

    const result = await tools.get("resume").execute({ issue: 7, answer: "go on" }, { sessionID: "coordinator" })

    expect(result.content).toContain("not BLOCKED")
    expect(prompt).not.toHaveBeenCalled()
  })
})

describe("question deny failure handling and settle races", () => {
  beforeEach(() => {
    mocks.execSync.mockReset()
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes("gh pr view")) {
        return Buffer.from(JSON.stringify({ state: "OPEN", url: record().prURL }))
      }
      return Buffer.from("")
    })
  })

  it("does not dispatch /build when the deny fails, and reuses the pending session on retry", async () => {
    const withoutSession = { ...record(), sessionID: undefined }
    const { tools, storage, ctx } = await setupWorktree(withoutSession)
    ctx.session.update.mockRejectedValueOnce(new Error("session unavailable"))

    const refused = await tools.get("start").execute({ issue: 7 }, { sessionID: "coordinator" })

    expect(refused.content).toContain("BLOCKED")
    expect(refused.content).toContain("not dispatched")
    expect(ctx.session.command).not.toHaveBeenCalled()
    expect(storage.values.get("slices/7")).toMatchObject({ sessionID: "recovered-7", dispatchPending: true })

    const retried = await tools.get("start").execute({ issue: 7 }, { sessionID: "coordinator" })

    expect(retried.content).toContain("recovered worker session recovered-7")
    expect(retried.content).toContain("/build dispatched")
    expect(ctx.session.command).toHaveBeenCalledWith({ sessionID: "recovered-7", name: "build", text: "#7" })
    expect(storage.values.get("slices/7").dispatchPending).toBeUndefined()
  })

  it("keeps refusing while the deny still cannot be installed", async () => {
    const pending = { ...record(), sessionID: "recovered-7", dispatchPending: true }
    const { tools, storage, ctx } = await setupWorktree(pending)
    ctx.session.update.mockRejectedValue(new Error("session unavailable"))

    const result = await tools.get("start").execute({ issue: 7 }, { sessionID: "coordinator" })

    expect(result.content).toContain("BLOCKED")
    expect(result.content).toContain("still not installed")
    expect(ctx.session.command).not.toHaveBeenCalled()
    expect(storage.values.get("slices/7").dispatchPending).toBe(true)
  })

  it("surfaces a failed deny re-assert in slice_status", async () => {
    const legacy = { ...record(), sessionID: "worker-7" }
    const { tools, ctx } = await setupWorktree(legacy)
    ctx.session.update.mockRejectedValueOnce(new Error("session unavailable"))

    const result = await tools.get("status").execute({}, { sessionID: "coordinator" })

    expect(result.content).toContain("question deny re-assert failed")
  })

  it("shows a pending worker dispatch in slice_status", async () => {
    const pending = { ...record(), sessionID: "worker-7", dispatchPending: true }
    const { tools } = await setupWorktree(pending)

    const result = await tools.get("status").execute({}, { sessionID: "coordinator" })

    expect(result.content).toContain("dispatch pending")
    expect(result.content).toContain("retry slice_start")
  })

  it("does not deliver a settle answer over a newer blocker", async () => {
    const building = { ...record(), state: "building" as const }
    const { tools, storage, prompt, ctx } = await setupWorktree(building)
    ctx.session.interrupt.mockImplementationOnce(async () => {
      storage.values.set("slices/7", {
        ...building,
        state: "blocked" as const,
        blockedReason: "new question arrived",
        blockedRevision: "rev-2",
      })
      return { interrupted: false }
    })

    const result = await tools.get("resume").execute(
      { issue: 7, answer: "Yes — fast-forward the local main ref." },
      { sessionID: "coordinator" },
    )

    expect(result.content).toContain("changed state")
    expect(result.content).toContain("new question arrived")
    expect(prompt).not.toHaveBeenCalled()
    expect(storage.values.get("slices/7").state).toBe("blocked")
  })

  it("still delivers the settle answer when nothing changed during the interrupt", async () => {
    const building = { ...record(), state: "building" as const }
    const { tools, prompt } = await setupWorktree(building)

    const result = await tools.get("resume").execute(
      { issue: 7, answer: "Yes — fast-forward the local main ref." },
      { sessionID: "coordinator" },
    )

    expect(result.content).toContain("answer delivered")
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(prompt.mock.calls[0]![0].sessionID).toBe("worker-7")
  })
})
