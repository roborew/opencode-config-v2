import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import skillsPlugin from "../../plugins/oc-skills/index"

const tempDirs: string[] = []
let consoleError: ReturnType<typeof vi.spyOn> | undefined

async function setupPromptHook(session: { agent?: string; directory: string } | Error) {
  let admit: ((event: any) => Promise<void>) | undefined
  const directory = session instanceof Error ? session : mkdtempSync(join(tmpdir(), "oc-skill-prompt-"))
  if (!(directory instanceof Error)) tempDirs.push(directory)
  const sessionDirectory = directory instanceof Error ? "/unavailable" : directory
  const ctx = {
    location: { directory: sessionDirectory, project: { canonical: sessionDirectory } },
    skill: { transform: vi.fn() },
    agent: { transform: vi.fn() },
    session: {
      hook: vi.fn(async (name: string, callback: any) => {
        if (name === "prompt") admit = callback
      }),
      get: vi.fn(async () => {
        if (session instanceof Error) throw session
        return { agent: session.agent, location: { directory } }
      }),
    },
  }
  await skillsPlugin.setup(ctx as any)
  return { admit: admit!, get: ctx.session.get }
}

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => { })
})

afterEach(() => {
  consoleError?.mockRestore()
  consoleError = undefined
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("oc-skills primary prompt admission", () => {
  it("attaches Plan discovery and gateway without a command or slice record", async () => {
    const directory = mkdtempSync(join(tmpdir(), "oc-skill-prompt-"))
    tempDirs.push(directory)
    const { admit } = await setupPromptHook({ agent: "plan", directory })
    const event = { sessionID: "plan-session", prompt: { skills: [{ id: "already-attached" }] } }
    await admit(event)
    expect(event.prompt.skills.map((skill) => skill.id)).toEqual([
      "already-attached",
      "using-agent-skills",
      "oc-plan-gateway",
      "interview-me",
      "spec-driven-development",
      "planning-and-task-breakdown",
      "oc-github",
    ])
  })

  it("attaches Build by the configured default legacy-session agent", async () => {
    const directory = mkdtempSync(join(tmpdir(), "oc-skill-prompt-"))
    tempDirs.push(directory)
    const { admit } = await setupPromptHook({ directory })
    const event: any = { sessionID: "old-build-session", prompt: {} }
    await admit(event)
    expect(event.prompt.skills.map((skill: { id: string }) => skill.id)).toEqual([
      "using-agent-skills",
      "oc-build-gateway",
      "oc-worktree",
      "oc-github",
    ])
  })

  it("does not attach primary workflows to unrelated agents", async () => {
    const directory = mkdtempSync(join(tmpdir(), "oc-skill-prompt-"))
    tempDirs.push(directory)
    const { admit } = await setupPromptHook({ agent: "explore", directory })
    const event = { sessionID: "explore-session", prompt: { skills: [{ id: "existing" }] } }
    await admit(event)
    expect(event.prompt.skills).toEqual([{ id: "existing" }])
  })

  it("rejects admission instead of silently dropping gateways when session lookup fails", async () => {
    const { admit } = await setupPromptHook(new Error("session lookup failed"))
    const event = { sessionID: "broken-session", prompt: {} }
    await expect(admit(event)).rejects.toThrow("session lookup failed")
  })
})
