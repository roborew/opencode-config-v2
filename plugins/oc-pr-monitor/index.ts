import { Plugin } from "@opencode/plugin"
import { execFile, execSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { diffSnapshot, isReady, parsePRGraphql, wakeText, type PRSnapshot, type WakeSummary } from "./lib"
import type { SliceRecord } from "../oc-worktree/lib"
import { readSlice, updateSlice } from "../shared/slice-store"

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

const execFileAsync = (file: string, args: string[], options: any): Promise<{ stdout: Buffer | string; stderr: Buffer | string }> =>
  new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }))
      else resolve({ stdout, stderr })
    })
  })

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
  pendingWake?: WakeSummary
  prURL?: string
  readyWorkerNotified?: boolean
  readyCommentPosted?: boolean
  readyNotified?: boolean
  retryTerminalNotification?: "blocked" | "closed"
  active: boolean
}

// Do not filter by reviewer or bot: CodeRabbit, Kilo, Copilot, security tools
// and humans all produce the same review-thread contract.
const PR_QUERY = `
query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      state
      reviewThreads(first:100){nodes{id isResolved comments(last:1){nodes{body}}}}
      statusCheckRollup{state contexts(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{... on CheckRun{name conclusion}... on StatusContext{context state}}}}
    }
  }
}`

export default Plugin.define({
  id: "oc-pr-monitor",
  async setup(ctx) {
    const intervalMs = Number((ctx.options as any)?.intervalMs ?? 120_000)
    const maxRounds = Number((ctx.options as any)?.maxRounds ?? 5)
    const canonical: string = ctx.location.project?.canonical ?? ctx.location.directory
    const timers = new Map<number, ReturnType<typeof setInterval>>()
    const liveWatches = new Map<number, WatchRecord>()
    const ticking = new Set<number>()
    const stateQueues = new Map<number, Promise<unknown>>()
    const watchQueues = new Map<number, Promise<unknown>>()
    const registrationQueues = new Map<number, Promise<unknown>>()

    const withRegistration = <T>(slice: number, task: () => Promise<T>): Promise<T> => {
      const previous = registrationQueues.get(slice) ?? Promise.resolve()
      const queued = previous.catch(() => undefined).then(task)
      registrationQueues.set(slice, queued)
      const cleanup = () => {
        if (registrationQueues.get(slice) === queued) registrationQueues.delete(slice)
      }
      void queued.then(cleanup, cleanup)
      return queued
    }

    console.log(`[oc-pr-monitor] active (interval ${intervalMs}ms, maxRounds ${maxRounds})`)

    const fetchPage = async (watch: WatchRecord, cursor?: string): Promise<PRSnapshot | undefined> => {
      const args = [
        "api", "graphql",
        "-f", `query=${PR_QUERY}`,
        "-F", `owner=${watch.owner}`,
        "-F", `name=${watch.name}`,
        "-F", `number=${watch.pr}`,
      ]
      if (cursor) args.push("-F", `cursor=${cursor}`)
      try {
        const { stdout } = await execFileAsync("gh", args, {
          cwd: watch.repoDir,
          timeout: 60_000,
          maxBuffer: 10 * 1024 * 1024,
        })
        return parsePRGraphql(JSON.parse(stdout.toString()))
      } catch (e: any) {
        const out = (e?.stdout?.toString() ?? "") + (e?.stderr?.toString() ?? "")
        console.error(`[oc-pr-monitor] graphql failed for PR #${watch.pr}: ${out.trim().slice(0, 200)}`)
        return undefined
      }
    }

    const fetchSnapshot = async (watch: WatchRecord): Promise<{ snapshot: PRSnapshot; complete: boolean } | undefined> => {
      const first = await fetchPage(watch)
      if (!first) return undefined
      const checks = [...first.checks]
      let page = first.checkPage
      let complete = true
      let pages = 0
      while (page?.hasNextPage) {
        if (!page.endCursor || pages >= 100) {
          complete = false
          break
        }
        const next = await fetchPage(watch, page.endCursor)
        if (!next) {
          complete = false
          break
        }
        checks.push(...next.checks)
        page = next.checkPage
        pages++
      }
      if (page?.hasNextPage) complete = false
      return { snapshot: { ...first, checks }, complete }
    }

    const gh = (args: string, cwd: string) => sh(`gh ${args}`, cwd)

    const setSliceState = (watch: WatchRecord, state: SliceRecord["state"], resume = false): Promise<boolean> => {
      const previous = stateQueues.get(watch.slice) ?? Promise.resolve()
      const queued = previous.catch(() => undefined).then(async () => {
        if (!resume && !isCurrent(watch)) return false
        let record: SliceRecord | undefined
        let applied = false
        record = updateSlice<SliceRecord>(canonical, watch.slice, (current) => {
          record = current
          if (!current) return undefined
          if (current.state === "blocked" && state !== "blocked" && !resume) return current
          if (current.syncClaim && state === "ready") return current
          if (current.pushPending && state === "ready") return current
          current.state = state
          current.prURL = watch.prURL ?? current.prURL
          current.pendingLabel = state === "building" ? "in-progress" : state
          record = current
          applied = true
          return current
        })
        if (!record || !applied) return false
        const label = record.pendingLabel
        if (label) {
          const removals = ["in-progress", "in-review", "ready", "blocked"]
            .filter((name) => name !== label)
            .map((name) => ` --remove-label status:${name}`)
            .join("")
          const update = gh(`issue edit ${watch.slice} --add-label status:${label}${removals}`, watch.repoDir)
          if (update.code === 0) {
            updateSlice<SliceRecord>(canonical, watch.slice, (latest) => {
              if (latest && latest.pendingLabel === label) latest.pendingLabel = undefined
              return latest
            })
          } else {
            console.error(`[oc-pr-monitor] label update failed for slice #${watch.slice}; slice_status will retry`)
          }
        }
        return true
      })
      stateQueues.set(watch.slice, queued)
      const cleanup = () => {
        if (stateQueues.get(watch.slice) === queued) stateQueues.delete(watch.slice)
      }
      void queued.then(cleanup, cleanup)
      return queued
    }

    type Delivery = "delivered" | "failed" | "unconfigured"
    const notifyCoordinator = async (watch: WatchRecord, text: string): Promise<Delivery> => {
      const record = readSlice<SliceRecord>(canonical, watch.slice)
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

    const retryPendingLabel = async (watch: WatchRecord): Promise<void> => {
      const previous = stateQueues.get(watch.slice) ?? Promise.resolve()
      const queued = previous.catch(() => undefined).then(async () => {
        if (!isCurrent(watch)) return
        const current = readSlice<SliceRecord>(canonical, watch.slice)
        if (!current?.pendingLabel) return
        const label = current.pendingLabel
        const removals = ["in-progress", "in-review", "ready", "blocked"]
          .filter((name) => name !== label)
          .map((name) => ` --remove-label status:${name}`)
          .join("")
        const update = gh(`issue edit ${watch.slice} --add-label status:${label}${removals}`, watch.repoDir)
        if (update.code !== 0) return
        updateSlice<SliceRecord>(canonical, watch.slice, (latest) => {
          if (latest && latest.pendingLabel === label) latest.pendingLabel = undefined
          return latest
        })
      })
      stateQueues.set(watch.slice, queued)
      const cleanup = () => {
        if (stateQueues.get(watch.slice) === queued) stateQueues.delete(watch.slice)
      }
      void queued.then(cleanup, cleanup)
      await queued
    }

    const isCurrent = (watch: WatchRecord) => watch.active && liveWatches.get(watch.slice) === watch

    const save = (watch: WatchRecord, replace = false): Promise<boolean> => {
      const previous = watchQueues.get(watch.slice) ?? Promise.resolve()
      const queued = previous.catch(() => undefined).then(async () => {
        if (!replace) {
          const stored = (await ctx.storage.get(`watches/${watch.slice}`)) as WatchRecord | undefined
          if (stored?.watchID && stored.watchID !== watch.watchID) return false
        }
        await ctx.storage.set(`watches/${watch.slice}`, watch as any)
        return true
      })
      watchQueues.set(watch.slice, queued)
      const cleanup = () => {
        if (watchQueues.get(watch.slice) === queued) watchQueues.delete(watch.slice)
      }
      void queued.then(cleanup, cleanup)
      return queued
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
      const durable = readSlice<SliceRecord>(canonical, watch.slice)
      if (!isCurrent(watch)) return
      if (!durable) {
        console.log(`[oc-pr-monitor] slice #${watch.slice} record removed — stopping the watch`)
        await stop(watch)
        return
      }
      await retryPendingLabel(watch)
      const fetched = await fetchSnapshot(watch)
      if (!isCurrent(watch)) return
      if (!fetched) return
      const snapshot = fetched.snapshot
      if (snapshot.state === "MERGED") {
        console.log(`[oc-pr-monitor] PR #${watch.pr} merged — stopping the watch`)
        const delivery = await notifyCoordinator(
          watch,
          `PR #${watch.pr} for slice #${watch.slice} is MERGED${watch.prURL ? `: ${watch.prURL}` : ""}. Wait for the user's instruction, then run the main-checkout reconciliation: slice_finish, slice_sync, close the PRD if complete, and start newly unblocked slices.`,
        )
        if (!isCurrent(watch)) return
        if (delivery === "delivered") await stop(watch)
        else await save(watch)
        return
      }
      if (snapshot.state === "CLOSED") {
        if (!await setSliceState(watch, "blocked") || !isCurrent(watch)) return
        watch.retryTerminalNotification = "closed"
        await save(watch)
        const delivery = await notifyCoordinator(watch, `PR #${watch.pr} for slice #${watch.slice} was CLOSED without merging. The user needs to decide whether to reopen it or close the slice.`)
        if (!isCurrent(watch)) return
        if (delivery === "delivered") await stop(watch)
        else await save(watch)
        return
      }

      // Only an open PR needs the full check list; terminal states were handled above.
      if (!fetched.complete) return

      if (durable.state === "blocked") {
        if (watch.retryTerminalNotification) {
          const kind = watch.retryTerminalNotification
          const text = kind === "closed"
            ? `PR #${watch.pr} for slice #${watch.slice} was CLOSED without merging. The user needs to decide whether to reopen it or close the slice.`
            : `Slice #${watch.slice} / PR #${watch.pr} is BLOCKED after ${maxRounds} review rounds. See the slice issue for the summary${watch.prURL ? ` and PR: ${watch.prURL}` : ""}.`
          const delivery = await notifyCoordinator(watch, text)
          if (!isCurrent(watch)) return
          if (delivery === "delivered") await stop(watch)
          else await save(watch)
        } else {
          await stop(watch)
        }
        return
      }

      if (durable.state === "building") {
        // slice_message owns the worker until it fixes and explicitly re-watches.
        await save(watch)
        return
      }

      const wasReady = durable.state === "ready"
      const diff = diffSnapshot(watch.lastSnapshot, snapshot)
      const retrying = Boolean(watch.pendingWake)

      if (isReady(snapshot)) {
        if (durable.state !== "ready") {
          console.log(`[oc-pr-monitor] PR #${watch.pr} is READY — status:ready`)
          watch.readyWorkerNotified = false
          watch.readyCommentPosted = false
          watch.readyNotified = false
          if (!await setSliceState(watch, "ready")) {
            const current = readSlice<SliceRecord>(canonical, watch.slice)
            if (!current || current.state === "blocked") {
              await stop(watch)
              return
            }
            // Deferred (for example a sync claim or a pending push); keep the
            // watch alive and retry the transition on a later poll.
            await save(watch)
            return
          }
          if (!isCurrent(watch)) return
        }
        watch.pendingWake = undefined
        watch.lastSnapshot = snapshot
        if (!watch.readyWorkerNotified) {
          try {
            await ctx.session.prompt({
              sessionID: watch.sessionID,
              text: `PR #${watch.pr} is READY (all threads resolved, ci-ok green). Go idle; the monitor remains armed for late feedback until merge.`,
              delivery: "queue",
            })
            watch.readyWorkerNotified = true
          } catch (e: any) {
            console.error("[oc-pr-monitor] READY worker notify failed:", e?.message ?? e)
          }
        }
        if (!isCurrent(watch)) return
        const beforeComment = readSlice<SliceRecord>(canonical, watch.slice)
        if (!beforeComment || beforeComment.state !== "ready") {
          if (!beforeComment || beforeComment.state === "blocked") await stop(watch)
          else await save(watch)
          return
        }
        if (!watch.readyCommentPosted) {
          const comment = gh(`pr comment ${watch.pr} --body "READY: all review threads resolved and ci-ok green. The user reviews, tests and merges."`, watch.repoDir)
          if (comment.code === 0) watch.readyCommentPosted = true
        }
        if (!watch.readyNotified) {
          const delivery = await notifyCoordinator(
            watch,
            `Slice #${watch.slice} / PR #${watch.pr} is READY for user review and testing${watch.prURL ? `: ${watch.prURL}` : ""}. All review threads are resolved and ci-ok is green. If the user finds a problem, use slice_message to wake the existing worker; never merge.`,
          )
          if (!isCurrent(watch)) return
          const latest = readSlice<SliceRecord>(canonical, watch.slice)
          if (!latest || latest.state === "blocked") {
            await stop(watch)
            return
          }
          if (latest.state !== "ready") {
            await save(watch)
            return
          }
          if (delivery === "delivered") watch.readyNotified = true
        }
        await save(watch)
        return
      }

      if (wasReady) {
        watch.readyNotified = false
        watch.readyWorkerNotified = false
        watch.readyCommentPosted = false
        if (!await setSliceState(watch, "in-review")) {
          await stop(watch)
          return
        }
        await notifyCoordinator(watch, `PR #${watch.pr} for slice #${watch.slice} is no longer READY after a new commit, comment or check change. The worker will handle any actionable feedback before it is presented again.`)
      }

      if (diff.newUnresolvedThreads.length === 0 && diff.failedChecks.length === 0) {
        watch.pendingWake = undefined
        watch.lastSnapshot = snapshot
        await save(watch) // pending checks need no model call; a later failure or READY will wake us
        return
      }

      if (!retrying) {
        watch.round += 1
      }
      if (watch.round > maxRounds) {
        console.log(`[oc-pr-monitor] slice #${watch.slice} BLOCKED after ${maxRounds} rounds`)
        gh(
          `issue comment ${watch.slice} --body "BLOCKED: the PR did not converge within ${maxRounds} review rounds. Latest open threads: ${snapshot.threads.filter((t) => !t.resolved).length}. Robin takes a look."`,
          watch.repoDir,
        )
        if (!await setSliceState(watch, "blocked") || !isCurrent(watch)) return
        watch.retryTerminalNotification = "blocked"
        // Persist the notification intent before awaiting the worker handover so a
        // restart cannot lose the coordinator notice.
        await save(watch)
        await ctx.session
          .prompt({
            sessionID: watch.sessionID,
            text: `Slice #${watch.slice} is BLOCKED after ${maxRounds} review rounds. Post a short handover summary and go idle.`,
            delivery: "queue",
          })
          .catch(() => { })
        const delivery = await notifyCoordinator(watch, `Slice #${watch.slice} / PR #${watch.pr} is BLOCKED after ${maxRounds} review rounds. See the slice issue for the summary${watch.prURL ? ` and PR: ${watch.prURL}` : ""}.`)
        if (!isCurrent(watch)) return
        if (delivery === "delivered") await stop(watch)
        else await save(watch)
        return
      }

      const text = wakeText(watch.slice, watch.pr, diff, watch.round)
      try {
        await ctx.session.prompt({ sessionID: watch.sessionID, text, delivery: "queue" })
        watch.pendingWake = undefined
        watch.lastSnapshot = snapshot
        console.log(`[oc-pr-monitor] woke slice #${watch.slice} (round ${watch.round})`)
      } catch (e: any) {
        watch.pendingWake = diff
        console.error("[oc-pr-monitor] wake failed:", e?.message ?? e)
      }
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
        execute: (input: { slice: number; pr: number }, context: any) => withRegistration(input.slice, async () => {
          const repoDir: string = context?.sessionID
            ? await ctx.session
              .get({ sessionID: context.sessionID })
              .then((s: any) => s?.location?.directory)
              .catch(() => ctx.location.directory)
            : ctx.location.directory
          const view = gh(`pr view ${input.pr} --json url,headRefName`, repoDir)
          if (view.code !== 0) return { content: `BLOCKED: gh pr view ${input.pr} failed: ${view.out.trim().slice(0, 200)}` }
          let url: string
          let headRefName: string
          try {
            const detail = JSON.parse(view.out)
            url = String(detail.url ?? "")
            headRefName = String(detail.headRefName ?? "")
          } catch {
            return { content: `BLOCKED: could not parse gh pr view ${input.pr}` }
          }
          const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
          if (!m) return { content: `BLOCKED: could not read owner/repo from ${url}` }
          const sliceRecord = readSlice<SliceRecord>(canonical, input.slice)
          if (!sliceRecord) return { content: `BLOCKED: no active slice record for #${input.slice}` }
          if (sliceRecord.branch !== headRefName) {
            return { content: `BLOCKED: PR #${input.pr} belongs to ${headRefName}, not slice #${input.slice} (${sliceRecord.branch})` }
          }
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
            readyWorkerNotified: false,
            readyCommentPosted: false,
            readyNotified: false,
            active: true,
          }
          const previous = liveWatches.get(input.slice)
          try {
            await save(watch, true)
            updateSlice<SliceRecord>(canonical, input.slice, (current) => {
              if (current) current.pushPending = undefined
              return current
            })
            if (!await setSliceState(watch, "in-review", true)) throw new Error("slice state update was rejected")
          } catch (e: any) {
            if (previous) await save(previous, true).catch(() => false)
            else await ctx.storage.remove(`watches/${input.slice}`).catch(() => { })
            return { content: `BLOCKED: could not register the replacement watch: ${e?.message ?? e}` }
          }
          await arm(watch)
          return { content: `watching PR #${input.pr} (slice #${input.slice}): interval ${intervalMs}ms, round cap ${maxRounds}. Going idle — the monitor wakes this session only on change.` }
        }),
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
