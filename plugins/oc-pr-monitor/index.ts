import { Plugin } from "@opencode/plugin"
import { execSync } from "node:child_process"
import { diffSnapshot, isReady, parsePRGraphql, wakeText, type PRSnapshot } from "./lib"

/**
 * oc-pr-monitor — namespace "prmon": prmon_watch, prmon_status.
 *
 * A zero-token wait loop: while a watch is active, a plain timer polls GitHub
 * through `gh api graphql` (no model calls). When the snapshot changes, the
 * slice session gets a compact wake prompt listing only the new unresolved
 * threads and failed checks. READY (all threads resolved + ci-ok passed) sets
 * status:ready and posts a short PR comment; more than maxRounds wakes mark
 * the slice BLOCKED with a summary on the issue. Watches survive a server
 * restart: they are stored in plugin storage and re-armed on setup.
 */

const sh = (cmd: string, cwd: string, timeoutMs = 60_000): { code: number; out: string } => {
  try {
    const out = execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs }).toString()
    return { code: 0, out }
  } catch (e: any) {
    return { code: e.status ?? 1, out: (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "") }
  }
}

interface WatchRecord {
  slice: number
  pr: number
  sessionID: string
  repoDir: string
  owner: string
  name: string
  round: number
  lastSnapshot?: PRSnapshot
  active: boolean
}

const PR_QUERY = `
query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      state
      reviewThreads(first:100){nodes{id isResolved comments(last:1){nodes{body}}}}
      statusCheckRollup{state contexts{... on CheckRun{name conclusion}... on StatusContext{name state}}}
    }
  }
}`

export default Plugin.define({
  id: "oc-pr-monitor",
  async setup(ctx) {
    const intervalMs = Number((ctx.options as any)?.intervalMs ?? 120_000)
    const maxRounds = Number((ctx.options as any)?.maxRounds ?? 5)
    const timers = new Map<number, ReturnType<typeof setInterval>>()

    console.log(`[oc-pr-monitor] active (interval ${intervalMs}ms, maxRounds ${maxRounds})`)

    const fetchSnapshot = (watch: WatchRecord): PRSnapshot | undefined => {
      const res = sh(
        `gh api graphql -f query=${JSON.stringify(PR_QUERY)} -F owner=${JSON.stringify(watch.owner)} -F name=${JSON.stringify(watch.name)} -F number=${watch.pr}`,
        watch.repoDir,
      )
      if (res.code !== 0) {
        console.error(`[oc-pr-monitor] graphql failed for PR #${watch.pr}: ${res.out.trim().slice(0, 200)}`)
        return undefined
      }
      try {
        return parsePRGraphql(JSON.parse(res.out))
      } catch (e) {
        console.error(`[oc-pr-monitor] could not parse the PR response:`, e)
        return undefined
      }
    }

    const gh = (args: string, cwd: string) => sh(`gh ${args}`, cwd)

    const save = async (watch: WatchRecord) => ctx.storage.set(`watches/${watch.slice}`, watch)

    const stop = async (watch: WatchRecord) => {
      watch.active = false
      const t = timers.get(watch.slice)
      if (t) {
        clearInterval(t)
        timers.delete(watch.slice)
      }
      await save(watch)
    }

    const tick = async (watch: WatchRecord) => {
      const snapshot = fetchSnapshot(watch)
      if (!snapshot) return
      if (snapshot.state === "MERGED") {
        console.log(`[oc-pr-monitor] PR #${watch.pr} merged — stopping the watch`)
        await stop(watch)
        return
      }
      const diff = diffSnapshot(watch.lastSnapshot, snapshot)
      watch.lastSnapshot = snapshot

      if (isReady(snapshot)) {
        console.log(`[oc-pr-monitor] PR #${watch.pr} is READY — status:ready`)
        gh(`issue edit ${watch.slice} --add-label status:ready`, watch.repoDir)
        gh(`pr comment ${watch.pr} --body "READY: all review threads resolved and ci-ok green. Robin merges."`, watch.repoDir)
        await ctx.session
          .prompt({
            sessionID: watch.sessionID,
            text: `PR #${watch.pr} is READY (all threads resolved, ci-ok green). Go idle; Robin merges.`,
            delivery: "queue",
          })
          .catch((e: any) => console.error("[oc-pr-monitor] READY notify failed:", e?.message ?? e))
        await stop(watch)
        return
      }

      if (diff.newUnresolvedThreads.length === 0 && diff.failedChecks.length === 0) {
        await save(watch) // snapshot moved on, nothing new to wake for
        return
      }

      watch.round += 1
      if (watch.round > maxRounds) {
        console.log(`[oc-pr-monitor] slice #${watch.slice} BLOCKED after ${maxRounds} rounds`)
        gh(
          `issue comment ${watch.slice} --body "BLOCKED: the PR did not converge within ${maxRounds} review rounds. Latest open threads: ${snapshot.threads.filter((t) => !t.resolved).length}. Robin takes a look."`,
          watch.repoDir,
        )
        await ctx.session
          .prompt({
            sessionID: watch.sessionID,
            text: `Slice #${watch.slice} is BLOCKED after ${maxRounds} review rounds. Post a short handover summary and go idle.`,
            delivery: "queue",
          })
          .catch(() => { })
        await stop(watch)
        return
      }

      const text = wakeText(watch.slice, watch.pr, diff, watch.round)
      await ctx.session
        .prompt({ sessionID: watch.sessionID, text, delivery: "queue" })
        .then(() => console.log(`[oc-pr-monitor] woke slice #${watch.slice} (round ${watch.round})`))
        .catch((e: any) => console.error("[oc-pr-monitor] wake failed:", e?.message ?? e))
      await save(watch)
    }

    const arm = async (watch: WatchRecord) => {
      if (!watch.active || timers.has(watch.slice)) return
      timers.set(
        watch.slice,
        setInterval(() => void tick(watch).catch((e) => console.error("[oc-pr-monitor] tick failed:", e)), intervalMs),
      )
    }

    // re-arm watches that survived a restart
    let after: string | undefined
    do {
      const page = await ctx.storage.scan({ prefix: "watches/", after, limit: 200 })
      for (const entry of page.entries) {
        const watch = entry.value as unknown as WatchRecord
        if (watch?.active) {
          console.log(`[oc-pr-monitor] re-armed watch for slice #${watch.slice} (PR #${watch.pr}, round ${watch.round})`)
          await arm(watch)
        }
      }
      after = page.next
    } while (after)

    await ctx.tool.transform((editor: any) => {
      editor.namespace({ name: "prmon", description: "The zero-token PR wait loop (blueprint §7.3)" })

      editor.add({
        name: "watch",
        description: "Start watching a PR: poll on a timer without spending tokens, wake this session only on change. READY sets status:ready; more than the round cap BLOCKS the slice.",
        input: {
          type: "object",
          properties: { slice: { type: "number" }, pr: { type: "number" } },
          required: ["slice", "pr"],
          additionalProperties: false,
        },
        options: { namespace: "prmon", codemode: true },
        execute: async (input: { slice: number; pr: number }, context: any) => {
          const repoDir: string = context?.sessionID
            ? await ctx.session
              .get({ sessionID: context.sessionID })
              .then((s: any) => s?.location?.directory)
              .catch(() => ctx.location.directory)
            : ctx.location.directory
          const view = gh(`pr view ${input.pr} --json url,headRefName`, repoDir)
          if (view.code !== 0) return { content: `BLOCKED: gh pr view ${input.pr} failed: ${view.out.trim().slice(0, 200)}` }
          const url = (JSON.parse(view.out).url ?? "") as string
          const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
          if (!m) return { content: `BLOCKED: could not read owner/repo from ${url}` }
          const watch: WatchRecord = {
            slice: input.slice,
            pr: input.pr,
            sessionID: context?.sessionID ?? "",
            repoDir,
            owner: m[1]!,
            name: m[2]!,
            round: 0,
            active: true,
          }
          await save(watch)
          await arm(watch)
          return { content: `watching PR #${input.pr} (slice #${input.slice}): interval ${intervalMs}ms, round cap ${maxRounds}. Going idle — the monitor wakes this session only on change.` }
        },
      } as any)

      editor.add({
        name: "status",
        description: "Report the watch for a slice: round, open threads, checks, state.",
        input: { type: "object", properties: { slice: { type: "number" } }, required: ["slice"], additionalProperties: false },
        options: { namespace: "prmon", codemode: true },
        execute: async (input: { slice: number }) => {
          const watch = (await ctx.storage.get(`watches/${input.slice}`)) as WatchRecord | undefined
          if (!watch) return { content: `no watch for slice #${input.slice}` }
          const snapshot = watch.lastSnapshot
          return {
            content:
              `slice #${watch.slice} — PR #${watch.pr} — round ${watch.round}/${maxRounds} — ${watch.active ? "watching" : "stopped"}\n` +
              `threads open: ${snapshot ? snapshot.threads.filter((t) => !t.resolved).length : "?"}\n` +
              `checks: ${snapshot ? snapshot.checks.map((c) => `${c.name}:${c.state}`).join(", ") || "none reported" : "no snapshot yet"}`,
          }
        },
      } as any)
    })

    return () => {
      for (const t of timers.values()) clearInterval(t)
      timers.clear()
    }
  },
})
