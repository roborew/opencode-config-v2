import { Plugin } from "@opencode/plugin"
import {
  appsWithSkills,
  appSkillFiles,
  parseSkillFile,
  readFrontMatter,
  readSliceRecord,
  skillsForSlice,
} from "./skills"

/**
 * oc-skills — guaranteed skill loading in slice sessions (blueprint §6/§7.4).
 *
 * Two things it does, both needed because per-app skills sit below the session
 * working directory where OpenCode's discovery can't see them (no glob support
 * in skills paths, ADR 0009):
 *
 * 1. Registers every app's apps/<app>/.agents/skills as real skills
 *    (ctx.skill.transform), from the project's canonical checkout at boot and
 *    lazily from a slice worktree when a session needs one that the canonical
 *    checkout didn't have (a slice may add its own). Appended after the
 *    deny-all: a skill the registry never had fails prompt admission with
 *    "Skill not found".
 * 2. Allows those dynamic skill IDs in the plan/build permission lists
 *    (ctx.agent.transform), because their static allow-lists can't know
 *    repo-specific skill IDs.
 *
 * And the prompt hook: when a prompt is admitted in a session whose working
 * directory is a slice worktree (an oc-slice.json record in the worktree's git
 * directory, written by oc-worktree at slice_start), it adds the slice's base
 * and area skills to prompt.skills.
 *
 * Worktree sessions share the canonical checkout's plugin registry and
 * ctx.location is the plugin instance's location — NOT the session's — so the
 * hook resolves the session's own directory from its sessionID on every prompt.
 */
export default Plugin.define({
  id: "oc-skills",
  async setup(ctx) {
    const registered = new Set<string>()
    const allowed = new Set<string>()

    const registerSkill = async (id: string, path: string) => {
      const parsed = parseSkillFile(path)
      await ctx.skill.transform((editor: any) => {
        editor.add({
          id,
          name: parsed.name ?? id,
          description: parsed.description ?? `Per-app skill ${id} (apps/*/.agents/skills)`,
          path,
          content: parsed.content,
        })
      })
      registered.add(id)
      if (!allowed.has(id)) {
        await ctx.agent.transform((editor: any) => {
          for (const agentId of ["plan", "build"]) {
            editor.update(agentId, (agent: any) => {
              agent.permissions = [
                ...(agent.permissions ?? []),
                { action: "skill", resource: id, effect: "allow" },
              ]
            })
          }
        })
        allowed.add(id)
      }
      console.log(`[oc-skills] registered per-app skill '${id}' (${path})`)
    }

    const ensureAppSkills = async (directory: string, apps: string[]) => {
      for (const app of apps) {
        for (const { id, path } of appSkillFiles(directory, app)) {
          if (!registered.has(id)) await registerSkill(id, path)
        }
      }
    }

    // Fast path: register every app's skills from the project's canonical checkout at boot.
    const canonical: string = ctx.location.project?.canonical ?? ctx.location.directory
    try {
      await ensureAppSkills(canonical, appsWithSkills(canonical))
    } catch (error) {
      console.error("[oc-skills] canonical app-skill registration failed:", error)
    }
    console.log(`[oc-skills] active (registry location: ${ctx.location.directory}; ${registered.size} per-app skills registered)`)

    await ctx.session.hook("prompt", async (event: any) => {
      try {
        let directory: string = ctx.location.directory
        if (event.sessionID) {
          const session: any = await ctx.session.get({ sessionID: event.sessionID })
          if (session?.location?.directory) directory = session.location.directory
        }
        const record = readSliceRecord(directory)
        if (!record) return
        // a slice worktree may add app skills the canonical checkout didn't have
        const apps = (record.labels ?? [])
          .filter((l: string) => l.startsWith("area:") && !["db", "infra", "docs"].includes(l.slice(5)))
          .map((l: string) => l.slice(5))
        await ensureAppSkills(directory, apps)
        const frontMatter = readFrontMatter(directory)
        const wanted = skillsForSlice(record, frontMatter, directory)
        const existing = new Set((event.prompt.skills ?? []).map((s: any) => s.id))
        const add = wanted.filter((s) => !existing.has(s))
        if (add.length === 0) return
        event.prompt.skills = [...(event.prompt.skills ?? []), ...add.map((id) => ({ id }))]
        console.log(`[oc-skills] slice #${record.issue} in ${directory}: added ${add.join(", ")}`)
      } catch (error) {
        console.error("[oc-skills] prompt hook failed:", error)
      }
    })
    return () => { }
  },
})
