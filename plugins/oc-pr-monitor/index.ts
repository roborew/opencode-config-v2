import { Plugin } from "@opencode/plugin"
import { execSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { diffSnapshot, isReady, parsePRGraphql, wakeText, type PRSnapshot } from "./lib"
import type { SliceRecord } from "../oc-worktree/lib"

/**
 * oc-pr-monitor — namespace "prmon": prmon_watch, prmon_status.
 *
 * A zero-token wait loop: while a watch is active, a plain timer polls GitHub
 * through `gh api graphql` (no model calls). When the snapshot changes, the
 * slice session gets a compact wake prompt listing only the new unresolved
 * threads and failed checks. READY (all threads resolved + ci-ok passed) updates
 * the slice record and notifies the central build session. The watch stays armed
 * for late feedback until the PR merges or closes. More than maxRounds wakes
 * marks the slice BLOCKED. Watches survive a server restart: they are stored in
 * plugin storage and re-armed on setup.
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
  watchID?: string
  slice: number
  pr: number
  sessionID: string
  repoDir: string
  owner: string
  name: string
  round: number
  lastSnapshot?: PRSnapshot
  prURL?: string
  readyNotified?: boolean
  retryTerminalNotification?: "blocked" | "closed"
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
    const liveWatches = new Map<number, WatchRecord>()
    const ticking = new Set<number>()
    const stateQueues = new Map<number, Promise<unknown>>()

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

    const setSliceState = (watch: WatchRecord, state: SliceRecord["state"], resume = false): Promise<boolean> => {
      const previous = stateQueues.get(watch.slice) ?? Promise.resolve()
      const queued = previous.catch(() => undefined).then(async () => {
        if (!resume && !isCurrent(watch)) return false
        const record = (await ctx.storage.get(`slices/${watch.slice}`)) as SliceRecord | undefined
        if (!resume && !isCurrent(watch)) return false
        if (record?.state === "blocked" && state !== "blocked" && !resume) return false
        if (record) {
          record.state = state
          record.prURL = watch.prURL ?? record.prURL
          await ctx.storage.set(`slices/${watch.slice}`, record as any)
        }
        const label = state === "building" ? "in-progress" : state
        const removals = ["in-progress", "in-review", "ready", "blocked"]
          .filter((name) => name !== label)
          .map((name) => ` --remove-label status:${name}`)
          .join("")
        gh(`issue edit ${watch.slice} --add-label status:${label}${removals}`, watch.repoDir)
        return true
      })
      stateQueues.set(watch.slice, queued)
      void queued.finally(() => {
        if (stateQueues.get(watch.slice) === queued) stateQueues.delete(watch.slice)
      })
      return queued
    }

    type Delivery = "delivered" | "failed" | "unconfigured"
    const notifyCoordinator = async (watch: WatchRecord, text: string): Promise<Delivery> => {
      const record = (await ctx.storage.get(`slices/${watch.slice}`)) as SliceRecord | undefined
      if (!record?.coordinatorSessionID) {
        console.error(`[oc-pr-monitor] slice #${watch.slice} has no coordinatorSessionID; run slice_status from the central build session to backfill it`)
        return "unconfigured"
      }
      try {
        await ctx.session.prompt({ sessionID: record.coordinatorSessionID, text, delivery: "queue" })
        return "delivered"
      } catch (e: any) {
        console.error("[oc-pr-monitor] coordinator notify failed:", e?.message ?? e)
        return "failed"
      }
    }

    const isCurrent = (watch: WatchRecord) => watch.active && liveWatches.get(watch.slice) === watch

    const save = async (watch: WatchRecord, replace = false): Promise<boolean> => {
      if (!replace) {
        const stored = (await ctx.storage.get(`watches/${watch.slice}`)) as WatchRecord | undefined
        if (stored?.watchID && stored.watchID !== watch.watchID) return false
      }
      await ctx.storage.set(`watches/${watch.slice}`, watch as any)
      return true
    }

    const stop = async (watch: WatchRecord) => {
      watch.active = false
      if (liveWatches.get(watch.slice) === watch) {
        const t = timers.get(watch.slice)
        if (t) clearInterval(t)
        timers.delete(watch.slice)
        liveWatches.delete(watch.slice)
      }
      await save(watch)
    }

    const tick = async (watch: WatchRecord) => {
      if (!isCurrent(watch)) return
      const durable = (await ctx.storage.get(`slices/${watch.slice}`)) as SliceRecord | undefined
      if (!isCurrent(watch)) return
      if (!durable) {
        console.log(`[oc-pr-monitor] slice #${watch.slice} record removed — stopping the watch`)
        await stop(watch)
        return
      }
      if (durable.state === "building") {
        // slice_message owns the worker until it fixes and explicitly re-watches.
        await save(watch)
        return
      }
      if (durable.state === "blocked") {
        if (watch.retryTerminalNotification) {
          const kind = watch.retryTerminalNotification
          const text = kind === "closed"
            ? `PR #${watch.pr} for slice #${watch.slice} was CLOSED without merging. The user needs to decide whether to reopen it or close the slice.`
            : `Slice #${watch.slice} / PR #${watch.pr} is BLOCKED after ${maxRounds} review rounds. See the slice issue for the summary${watch.prURL ? ` and PR: ${watch.prURL}` : ""}.`
          const delivery = await notifyCoordinator(watch, text)
          if (!isCurrent(watch)) return
          if (delivery !== "failed") await stop(watch)
          else await save(watch)
        } else {
          await stop(watch)
        }
        return
      }

      const snapshot = fetchSnapshot(watch)
      if (!snapshot) return
      if (snapshot.state === "MERGED") {
        console.log(`[oc-pr-monitor] PR #${watch.pr} merged — stopping the watch`)
        const delivery = await notifyCoordinator(
          watch,
          `PR #${watch.pr} for slice #${watch.slice} is MERGED${watch.prURL ? `: ${watch.prURL}` : ""}. Wait for the user's instruction, then run the main-checkout reconciliation: slice_finish, slice_sync, close the PRD if complete, and start newly unblocked slices.`,
        )
        if (!isCurrent(watch)) return
        if (delivery !== "failed") await stop(watch)
        else await save(watch)
        return
      }
      if (snapshot.state === "CLOSED") {
        await setSliceState(watch, "blocked")
        watch.retryTerminalNotification = "closed"
        const delivery = await notifyCoordinator(watch, `PR #${watch.pr} for slice #${watch.slice} was CLOSED without merging. The user needs to decide whether to reopen it or close the slice.`)
        if (!isCurrent(watch)) return
        if (delivery !== "failed") await stop(watch)
        else await save(watch)
        return
      }

      const wasReady = watch.lastSnapshot ? isReady(watch.lastSnapshot) : durable.state === "ready"
      const diff = diffSnapshot(watch.lastSnapshot, snapshot)
      watch.lastSnapshot = snapshot

      if (isReady(snapshot)) {
        if (durable.state !== "ready") {
          console.log(`[oc-pr-monitor] PR #${watch.pr} is READY — status:ready`)
          watch.readyNotified = false
          if (!await setSliceState(watch, "ready")) {
            await stop(watch)
            return
          }
          if (!isCurrent(watch)) return
          await ctx.session
            .prompt({
              sessionID: watch.sessionID,
              text: `PR #${watch.pr} is READY (all threads resolved, ci-ok green). Go idle; the monitor remains armed for late feedback until merge.`,
              delivery: "queue",
            })
            .catch((e: any) => console.error("[oc-pr-monitor] READY worker notify failed:", e?.message ?? e))
          if (!isCurrent(watch)) return
        }
        if (!watch.readyNotified) {
          const delivery = await notifyCoordinator(
            watch,
            `Slice #${watch.slice} / PR #${watch.pr} is READY for user review and testing${watch.prURL ? `: ${watch.prURL}` : ""}. All review threads are resolved and ci-ok is green. If the user finds a problem, use slice_message to wake the existing worker; never merge.`,
          )
          if (!isCurrent(watch)) return
          const latest = (await ctx.storage.get(`slices/${watch.slice}`)) as SliceRecord | undefined
          if (!latest || latest.state === "blocked") {
            await stop(watch)
            return
          }
          if (latest.state !== "ready") {
            await save(watch)
            return
          }
          if (delivery !== "failed") {
            watch.readyNotified = true
            gh(`pr comment ${watch.pr} --body "READY: all review threads resolved and ci-ok green. The user reviews, tests and merges."`, watch.repoDir)
          }
        }
        await save(watch)
        return
      }

      if (wasReady) {
        watch.readyNotified = false
        if (!await setSliceState(watch, "in-review")) {
          await stop(watch)
          return
        }
        await notifyCoordinator(watch, `PR #${watch.pr} for slice #${watch.slice} is no longer READY after a new commit, comment or check change. The worker will handle any actionable feedback before it is presented again.`)
      }

      if (diff.newUnresolvedThreads.length === 0 && diff.failedChecks.length === 0) {
        await save(watch) // pending checks need no model call; a later failure or READY will wake us
        return
      }

      watch.round += 1
      if (watch.round > maxRounds) {
        console.log(`[oc-pr-monitor] slice #${watch.slice} BLOCKED after ${maxRounds} rounds`)
        gh(
          `issue comment ${watch.slice} --body "BLOCKED: the PR did not converge within ${maxRounds} review rounds. Latest open threads: ${snapshot.threads.filter((t) => !t.resolved).length}. Robin takes a look."`,
          watch.repoDir,
        )
        await setSliceState(watch, "blocked")
        watch.retryTerminalNotification = "blocked"
        await ctx.session
          .prompt({
            sessionID: watch.sessionID,
            text: `Slice #${watch.slice} is BLOCKED after ${maxRounds} review rounds. Post a short handover summary and go idle.`,
            delivery: "queue",
          })
          .catch(() => { })
        const delivery = await notifyCoordinator(watch, `Slice #${watch.slice} / PR #${watch.pr} is BLOCKED after ${maxRounds} review rounds. See the slice issue for the summary${watch.prURL ? ` and PR: ${watch.prURL}` : ""}.`)
        if (!isCurrent(watch)) return
        if (delivery !== "failed") await stop(watch)
        else await save(watch)
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
      if (!watch.active) return
      watch.watchID ??= randomUUID()
      liveWatches.set(watch.slice, watch)
      const previous = timers.get(watch.slice)
      if (previous) clearInterval(previous)
      timers.set(
        watch.slice,
        setInterval(() => {
          if (ticking.has(watch.slice) || !isCurrent(watch)) return
          ticking.add(watch.slice)
          void tick(watch)
            .catch((e) => console.error("[oc-pr-monitor] tick failed:", e))
            .finally(() => ticking.delete(watch.slice))
        }, intervalMs),
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
        description: "Watch a PR until merge: wake the worker on feedback, notify the coordinator on READY/BLOCKED/MERGED, and keep watching after READY for late changes.",
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
            watchID: randomUUID(),
            slice: input.slice,
            pr: input.pr,
            sessionID: context?.sessionID ?? "",
            repoDir,
            owner: m[1]!,
            name: m[2]!,
            round: 0,
            prURL: url,
            readyNotified: false,
            active: true,
          }
          liveWatches.set(input.slice, watch)
          await setSliceState(watch, "in-review", true)
          await save(watch, true)
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
