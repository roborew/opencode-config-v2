import { Plugin } from "@opencode/plugin"
import { execSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  type IssueInfo,
  type SliceRecord,
  classifyWorktreeError,
  envFilesToCopy,
  listWorktrees,
  parseBlockers,
  removalGuard,
  slugify,
} from "./lib"
import { sandboxId } from "../oc-sandbox/lib"

/**
 * oc-worktree — namespace "slice": slice_start, slice_status, slice_message,
 * slice_block, slice_sync and slice_finish (blueprint §7.1), plus the custom worktree strategy that gives
 * slice worktrees their branch: `git worktree add -b slice/<N>-<slug> <dir>
 * origin/main` (checked out, not detached — the built-in strategy detaches,
 * ADR 0009).
 *
 * Anti-cascade rule (ADR 0009): worktrees are created only from tool calls in
 * the canonical checkout, never from plugin setup or timers.
 */

const sh = (cmd: string, cwd: string, timeoutMs = 60_000): { code: number; out: string } => {
  try {
    const out = execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs }).toString()
    return { code: 0, out }
  } catch (e: any) {
    return { code: e.status ?? 1, out: (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "") }
  }
}

const gitIn = (cwd: string, args: string) => sh(`git ${args}`, cwd, 30_000)
const shellQuote = (value: string) => "'" + value.replace(/'/g, `'"'"'`) + "'"

export default Plugin.define({
  id: "oc-worktree",
  async setup(ctx) {
    const maxParallel = Number((ctx.options as any)?.maxParallel ?? 3)
    const worktreeRoot = String((ctx.options as any)?.worktreeRoot ?? "~/.opencode-worktrees").replace(
      /^~(?=$|\/)/,
      process.env.HOME ?? "",
    )
    const projectID: string = ctx.location.project?.id ?? ""
    const canonical: string = ctx.location.project?.canonical ?? ctx.location.directory

    console.log(`[oc-worktree] active (canonical: ${canonical}; maxParallel ${maxParallel}; root ${worktreeRoot})`)

    // ---- the slice worktree strategy: branch checked out off origin/main ----
    await ctx.worktree.transform((editor: any) => {
      editor.add({
        id: "oc-worktree",
        create: async ({ sourceDirectory, directory, branch }: any) => {
          const base = gitIn(sourceDirectory, "rev-parse --verify origin/main").code === 0 ? "origin/main" : "main"
          gitIn(sourceDirectory, `fetch origin main`)
          const add = gitIn(
            sourceDirectory,
            `worktree add -b ${JSON.stringify(branch ?? "slice/auto")} ${JSON.stringify(directory)} ${JSON.stringify(base)}`,
          )
          if (add.code !== 0) throw new Error(add.out.trim() || `git worktree add failed for ${directory}`)
          console.log(`[oc-worktree] strategy created ${branch ?? "(default branch)"} at ${directory} (off ${base})`)
          return { directory }
        },
        remove: async ({ directory, force }: any) => {
          const rm = gitIn(directory, `worktree remove ${force ? "--force" : ""} .`)
          if (rm.code !== 0) throw new Error(rm.out.trim() || `git worktree remove failed for ${directory}`)
        },
        list: async (sourceDirectory: string) => listWorktrees(sourceDirectory),
      })
    })

    const sessionDir = async (sessionID?: string): Promise<string> => {
      if (sessionID) {
        try {
          const session: any = await ctx.session.get({ sessionID })
          if (session?.location?.directory) return session.location.directory
        } catch { }
      }
      return ctx.location.directory
    }

    const gh = (repoDir: string, args: string) => sh(`gh ${args}`, repoDir, 60_000)
    const recordQueues = new Map<number, Promise<unknown>>()

    const queueRecordWrite = <T>(issue: number, task: () => Promise<T>): Promise<T> => {
      const previous = recordQueues.get(issue) ?? Promise.resolve()
      const queued = previous.catch(() => undefined).then(task)
      recordQueues.set(issue, queued)
      const cleanup = () => {
        if (recordQueues.get(issue) === queued) recordQueues.delete(issue)
      }
      void queued.then(cleanup, cleanup)
      return queued
    }

    const setSyncPending = (issue: number, pending: boolean): Promise<boolean> => queueRecordWrite(issue, async () => {
      const current = (await ctx.storage.get(`slices/${issue}`)) as SliceRecord | undefined
      if (!current) return false
      if (pending && current.state === "blocked") return false
      current.syncPending = pending
      await ctx.storage.set(`slices/${issue}`, current as any)
      return true
    })

    const setSliceState = (
      record: SliceRecord,
      state: SliceRecord["state"],
      resume = false,
      patch: Partial<SliceRecord> = {},
    ): Promise<boolean> => queueRecordWrite(record.issue, async () => {
      const current = (await ctx.storage.get(`slices/${record.issue}`)) as SliceRecord | undefined
      if (!current) return false
      if (current.state === "blocked" && state !== "blocked" && !resume) return false
      Object.assign(current, patch)
      current.state = state
      current.pendingLabel = state === "building" ? "in-progress" : state
      await ctx.storage.set(`slices/${record.issue}`, current as any)
      const label = current.pendingLabel
      const removals = ["in-progress", "in-review", "ready", "blocked"]
        .filter((name) => name !== label)
        .map((name) => ` --remove-label status:${name}`)
        .join("")
      const update = gh(canonical, `issue edit ${record.issue} --add-label status:${label}${removals}`)
      if (update.code === 0) {
        current.pendingLabel = undefined
        await ctx.storage.set(`slices/${record.issue}`, current as any)
      } else {
        console.error(`[oc-worktree] label update failed for slice #${record.issue}; slice_status will retry`)
      }
      Object.assign(record, current)
      return true
    })

    const notifyCoordinator = async (record: SliceRecord, text: string) => {
      if (!record.coordinatorSessionID) return false
      await ctx.session.prompt({ sessionID: record.coordinatorSessionID, text, delivery: "queue" })
      return true
    }

    const issueInfo = (repoDir: string, issue: number): IssueInfo | { error: string } => {
      const res = gh(repoDir, `issue view ${issue} --json number,title,labels,state,body`)
      if (res.code !== 0) return { error: `gh issue view ${issue} failed: ${res.out.trim().slice(0, 200)}` }
      const raw = JSON.parse(res.out) as any
      return {
        number: raw.number,
        title: raw.title ?? "",
        labels: (raw.labels ?? []).map((l: any) => (typeof l === "string" ? l : l.name)),
        state: raw.state ?? "OPEN",
        body: raw.body ?? "",
      }
    }

    const ensureLabel = (repoDir: string, label: string) => {
      gh(repoDir, `label view ${JSON.stringify(label)}`)
      if (gh(repoDir, `label view ${JSON.stringify(label)}`).code !== 0) {
        gh(repoDir, `label create ${JSON.stringify(label)} --force`)
      }
    }

    const writeSliceRecordFile = (worktree: string, record: SliceRecord) => {
      const gitDir = gitIn(worktree, "rev-parse --git-dir").out.trim()
      if (!gitDir) throw new Error(`cannot resolve the git dir of ${worktree}`)
      const dir = gitDir.startsWith("/") ? gitDir : join(worktree, gitDir)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, "oc-slice.json"), JSON.stringify(record, null, 2))
    }

    const activeSlices = async (): Promise<SliceRecord[]> => {
      const out: SliceRecord[] = []
      let after: string | undefined
      do {
        const page = await ctx.storage.scan({ prefix: "slices/", after, limit: 200 })
        for (const entry of page.entries) {
          const rec = entry.value as unknown as SliceRecord
          if (rec?.issue) out.push(rec)
        }
        after = page.next
      } while (after)
      return out
    }

    const teardownSandbox = (record: SliceRecord) => {
      // same teardown sandbox_down would do: the oc-sandbox project for this slice, volumes included
      try {
        const id = sandboxId(String(record.issue), record.directory)
        const composeFile = join(record.directory, "compose.yml")
        if (existsSync(composeFile)) {
          sh(`docker compose -p ${id} -f ${JSON.stringify(composeFile)} down -v --remove-orphans`, record.directory, 5 * 60_000)
        }
      } catch (error) {
        console.error("[oc-worktree] sandbox teardown failed (continuing):", error)
      }
    }

    await ctx.tool.transform((editor: any) => {
      editor.namespace({ name: "slice", description: "Slice worktrees and sessions (blueprint §7.1)" })

      const tool = (
        name: string,
        description: string,
        properties: Record<string, unknown>,
        execute: (input: any, context: any) => Promise<{ content: string }>,
      ) => {
        editor.add({
          name,
          description,
          input: { type: "object", properties, additionalProperties: false },
          options: { namespace: "slice", codemode: true },
          execute,
        })
      }

      tool(
        "start",
        "Start a slice: create its worktree off origin/main (branch slice/<N>-<slug>), copy .env files, save the slice record, open its session already running /build #N, and set status:in-progress. Refuses open blockers or when all parallel slots are taken.",
        { issue: { type: "number", description: "the slice issue number" } },
        async (input: { issue: number }, context) => {
          const dir = await sessionDir(context.sessionID)
          if (dir !== canonical) {
            return { content: `BLOCKED: run /build from the main checkout (${canonical}), not from ${dir}` }
          }
          const existing = (await ctx.storage.get(`slices/${input.issue}`)) as SliceRecord | undefined
          if (existing?.sessionID) {
            return { content: `slice #${input.issue} is already active (${existing.state}) in ${existing.directory}; use slice_message or slice_resume for its worker, or slice_status for its PR` }
          }
          if (existing) {
            try {
              const session: any = await ctx.session.create({
                title: `#${input.issue} ${existing.title ?? "slice"}`,
                location: { directory: existing.directory },
              })
              const sessionID = session.id ?? session.sessionID
              if (!sessionID) throw new Error("session create returned no session ID")
              await ctx.session.command({ sessionID, name: "build", text: `#${input.issue}` })
              existing.sessionID = sessionID
              await ctx.storage.set(`slices/${input.issue}`, existing as any)
              if (existsSync(existing.directory)) writeSliceRecordFile(existing.directory, existing)
              return { content: `recovered worker session ${sessionID} for existing slice #${input.issue} in ${existing.directory}` }
            } catch (error: any) {
              return { content: `BLOCKED: slice #${input.issue} exists without a worker session and the recovery session could not start: ${error?.message ?? error}` }
            }
          }
          const info = issueInfo(canonical, input.issue)
          if ("error" in info) return { content: `BLOCKED: ${info.error}` }
          if (String(info.state).toUpperCase() === "CLOSED") {
            return { content: `BLOCKED: issue #${input.issue} is closed` }
          }
          for (const blocker of parseBlockers(info.body)) {
            const b = issueInfo(canonical, blocker)
            if ("error" in b) continue
            if (String(b.state).toUpperCase() !== "CLOSED") {
              return { content: `BLOCKED: issue #${input.issue} is blocked by #${blocker} (${b.state})` }
            }
          }
          const active = (await activeSlices()).filter((s) => s.state === "building" || s.state === "in-review")
          if (active.length >= maxParallel) {
            return {
              content: `BLOCKED: all ${maxParallel} parallel slots are taken (${active.map((s) => `#${s.issue}`).join(", ")}) — this slice waits for a slot`,
            }
          }

          const slug = slugify(info.title)
          const branch = `slice/${input.issue}-${slug}`
          const name = `slice-${input.issue}-${slug}`
          let directory: string
          try {
            const created: any = await ctx.worktree.create({ projectID, name, branch })
            directory = created.directory
          } catch (error: any) {
            const cls = classifyWorktreeError(error)
            return { content: `BLOCKED: worktree creation failed — ${error?.message ?? error} (${cls.hint})` }
          }

          // .env copies for Robin's convenience: file names only, never values; tests never depend on them (§9.2)
          const copied: string[] = []
          for (const file of envFilesToCopy(canonical)) {
            try {
              copyFileSync(join(canonical, file), join(directory, file))
              copied.push(file)
            } catch { }
          }

          const prd = Number(info.body.match(/part of[^#\n]*#(\d+)/i)?.[1] ?? 0) || undefined
          const record: SliceRecord = {
            issue: input.issue,
            title: info.title,
            labels: info.labels,
            prd,
            branch,
            directory,
            coordinatorSessionID: context?.sessionID ?? undefined,
            state: "building",
            createdAt: Date.now(),
          }
          writeSliceRecordFile(directory, record)
          await ctx.storage.set(`slices/${input.issue}`, record as any)

          let sessionID: string | undefined
          try {
            const session: any = await ctx.session.create({
              title: `#${input.issue} ${info.title}`,
              location: { directory },
            })
            sessionID = session.id ?? session.sessionID
            if (!sessionID) throw new Error("session create returned no session ID")
            await ctx.session.command({ sessionID, name: "build", text: `#${input.issue}` })
            record.sessionID = sessionID
            await ctx.storage.set(`slices/${input.issue}`, record as any)
            writeSliceRecordFile(directory, record)
          } catch (error: any) {
            return {
              content: `worktree ${directory} created on ${branch}, but the session could not be started: ${error?.message ?? error}. Retry slice_start for #${input.issue}; it will attach a worker session to the existing record.`,
            }
          }

          ensureLabel(canonical, "status:in-progress")
          await setSliceState(record, "building")

          return {
            content:
              `slice #${input.issue} started: branch ${branch}, worktree ${directory}, session ${sessionID}` +
              (copied.length ? ` (copied for Robin: ${copied.join(", ")})` : ""),
          }
        },
      )

      tool("status", "Report every active slice: issue, branch, session, state, PR. Also backfills the coordinator session on legacy records.", {}, async (_input, context) => {
        const slices = await activeSlices()
        const dir = await sessionDir(context.sessionID)
        if (dir === canonical && context.sessionID) {
          for (const record of slices) {
            if (!record.coordinatorSessionID || record.pendingLabel) {
              await queueRecordWrite(record.issue, async () => {
                const current = (await ctx.storage.get(`slices/${record.issue}`)) as SliceRecord | undefined
                if (!current) return
                if (!current.coordinatorSessionID) current.coordinatorSessionID = context.sessionID
                if (current.pendingLabel) {
                  const label = current.pendingLabel
                  const removals = ["in-progress", "in-review", "ready", "blocked"]
                    .filter((name) => name !== label)
                    .map((name) => ` --remove-label status:${name}`)
                    .join("")
                  const update = gh(canonical, `issue edit ${current.issue} --add-label status:${label}${removals}`)
                  if (update.code === 0) current.pendingLabel = undefined
                }
                await ctx.storage.set(`slices/${record.issue}`, current as any)
              })
            }
          }
        }
        if (slices.length === 0) return { content: "no active slices" }
        const lines = slices.map(
          (s) => `  #${s.issue} ${s.state} — ${s.branch} — session ${s.sessionID ?? "-"}${s.prURL ? ` — ${s.prURL}` : ""}${s.pendingLabel ? ` — label retry pending: ${s.pendingLabel}` : ""}${s.syncPending ? " — sync pending" : ""}`,
        )
        return { content: `slice_status:\n${lines.join("\n")}` }
      })

      tool(
        "message",
        "Route user feedback from the main checkout to the existing slice session. The worker fixes the same worktree, branch and PR, then restarts its PR monitor.",
        {
          issue: { type: "number", description: "the slice issue number" },
          text: { type: "string", description: "User review or testing feedback" },
        },
        async (input: { issue: number; text: string }, context) => {
          let dir: string | undefined
          try {
            const session: any = context.sessionID ? await ctx.session.get({ sessionID: context.sessionID }) : undefined
            dir = session?.location?.directory
          } catch { }
          if (!dir) return { content: "BLOCKED: cannot verify the caller's session location; refusing to route feedback" }
          if (dir !== canonical) {
            return { content: `BLOCKED: route feedback from the main checkout (${canonical}), not from ${dir}` }
          }
          if (!input.text.trim()) return { content: "BLOCKED: feedback text is required" }
          const record = (await ctx.storage.get(`slices/${input.issue}`)) as SliceRecord | undefined
          if (!record) return { content: `BLOCKED: no active slice record for #${input.issue}; post-merge fixes need a new slice` }
          if (!record.sessionID) return { content: `BLOCKED: slice #${input.issue} has no existing worker session` }
          const pr = gh(canonical, `pr view ${JSON.stringify(record.branch)} --json state,url`)
          if (pr.code !== 0) return { content: `BLOCKED: could not verify the PR for slice #${input.issue}: ${pr.out.trim().slice(0, 200)}` }
          let prState: string
          try {
            const detail = JSON.parse(pr.out)
            prState = String(detail.state ?? "").toUpperCase()
            record.prURL = detail.url ?? record.prURL
          } catch {
            return { content: `BLOCKED: could not read the PR state for slice #${input.issue}` }
          }
          if (prState !== "OPEN") {
            return { content: `BLOCKED: the PR for slice #${input.issue} is ${prState || "not OPEN"}; post-merge or closed-PR fixes need a new slice` }
          }

          const text = [
            `The user reviewed slice #${input.issue} and found a problem:`,
            input.text.trim(),
            "Resume this slice in the existing worktree and PR. Reproduce the problem, add regression coverage without weakening existing tests, fix it, run sandbox_gate and redgreen_check, review the new diff, then commit and push to the same branch. Call prmon_watch for the existing PR and go idle until it is READY. Do not open a new PR. If this requires a requirements change, call slice_block with the spec gap instead of guessing.",
          ].join("\n\n")
          try {
            await ctx.session.prompt({ sessionID: record.sessionID, text, delivery: "queue" })
          } catch (error: any) {
            return { content: `BLOCKED: could not wake the worker for slice #${input.issue}: ${error?.message ?? error}` }
          }
          const resumed = await setSliceState(record, "building", false, { prURL: record.prURL })
          if (!resumed) {
            return { content: `BLOCKED: slice #${input.issue} changed state while feedback was queued (it may now be BLOCKED). The worker was woken, but the slice was not resumed; use slice_resume after resolving the blocker.` }
          }
          return { content: `feedback sent to slice #${input.issue}; the existing worker is fixing the same PR and will report READY again${record.pendingLabel ? " (GitHub label retry pending; slice_status will retry)" : ""}` }
        },
      )

      tool(
        "resume",
        "Resume a BLOCKED slice from the main checkout after the user resolves or replans it. Wakes the existing worker in the same worktree, branch and PR.",
        { issue: { type: "number", description: "the slice issue number" } },
        async (input: { issue: number }, context) => {
          let dir: string | undefined
          try {
            const session: any = context.sessionID ? await ctx.session.get({ sessionID: context.sessionID }) : undefined
            dir = session?.location?.directory
          } catch { }
          if (!dir) return { content: "BLOCKED: cannot verify the caller's session location; refusing to resume the slice" }
          if (dir !== canonical) return { content: `BLOCKED: resume from the main checkout (${canonical}), not from ${dir}` }
          const record = (await ctx.storage.get(`slices/${input.issue}`)) as SliceRecord | undefined
          if (!record) return { content: `BLOCKED: no active slice record for #${input.issue}` }
          if (!record.sessionID) return { content: `BLOCKED: slice #${input.issue} has no worker session; retry slice_start to recover it` }
          if (record.state !== "blocked") return { content: `slice #${input.issue} is ${record.state}, not BLOCKED; no resume needed` }
          const pr = gh(canonical, `pr view ${JSON.stringify(record.branch)} --json state,url`)
          if (pr.code === 0 && String(JSON.parse(pr.out || "{}").state).toUpperCase() !== "OPEN") {
            return { content: `BLOCKED: the PR for slice #${input.issue} is no longer OPEN; post-merge work needs a new slice` }
          }
          const text = `The blocker for slice #${input.issue} has been resolved or replanned. Resume work in the existing worktree and branch. Follow the current /build #${input.issue} workflow; if a PR already exists, run the normal verification, review and ship flow, then restart its prmon_watch. Do not create a replacement worktree or PR.`
          try {
            await ctx.session.prompt({ sessionID: record.sessionID, text, delivery: "queue" })
          } catch (error: any) {
            return { content: `BLOCKED: could not wake the worker for slice #${input.issue}: ${error?.message ?? error}` }
          }
          await setSliceState(record, "building", true, { blockedReason: undefined })
          return { content: `slice #${input.issue} resumed in its existing worker${record.pendingLabel ? " (GitHub label retry pending; slice_status will retry)" : ""}` }
        },
      )

      tool(
        "block",
        "Mark this slice BLOCKED from its own worktree, comment on the issue, and notify the central build session with the reason.",
        {
          issue: { type: "number", description: "the slice issue number" },
          reason: { type: "string", description: "the actionable blocker or spec gap" },
        },
        async (input: { issue: number; reason: string }, context) => {
          const dir = await sessionDir(context.sessionID)
          const record = (await ctx.storage.get(`slices/${input.issue}`)) as SliceRecord | undefined
          if (!record) return { content: `BLOCKED: no slice record for #${input.issue}` }
          if (dir !== record.directory) {
            return { content: `BLOCKED: slice_block for #${input.issue} must run in its own worktree (${record.directory})` }
          }
          if (!input.reason.trim()) return { content: "BLOCKED: a reason is required" }

          const reason = input.reason.trim()
          await setSliceState(record, "blocked", false, { blockedReason: reason })
          const comment = gh(canonical, `issue comment ${input.issue} --body ${shellQuote(`BLOCKED: ${reason}`)}`)
          const commentNote = comment.code === 0 ? "commented on its issue" : `issue comment failed (${comment.out.trim().slice(0, 200)}); the reason is retained in the slice record`
          const text = `Slice #${input.issue} is BLOCKED: ${reason}${record.prURL ? `\nPR: ${record.prURL}` : ""}\nThe user should take this back to plan if it is a spec gap, or resolve it and resume the slice.`
          if (!record.coordinatorSessionID) {
            return { content: `slice #${input.issue} marked BLOCKED and ${commentNote}, but no coordinator session is recorded. Run slice_status from the central build session to backfill it; the durable slice record retains the blocker.` }
          }
          try {
            await notifyCoordinator(record, text)
          } catch (error: any) {
            console.error(`[oc-worktree] BLOCKED notify failed for slice #${input.issue}:`, error?.message ?? error)
            return { content: `slice #${input.issue} marked BLOCKED and ${commentNote}, but coordinator notification failed: ${error?.message ?? error}. The durable slice record retains the blocker.` }
          }
          return { content: `slice #${input.issue} marked BLOCKED, ${commentNote}, and reported to the central build session; go idle` }
        },
      )

      tool(
        "sync",
        "Merge origin/main into active building slices. Call after a merge and on every /build run to retry syncPending slices. Conflicts are BLOCKED and never forced; READY and BLOCKED slices are skipped.",
        {},
        async () => {
          const slices = await activeSlices()
          const results: string[] = []
          for (const s of slices) {
            if (s.state === "blocked" || s.state === "ready") continue
            if (!existsSync(s.directory)) {
              await setSyncPending(s.issue, true)
              results.push(`  #${s.issue}: sync pending — worktree missing (${s.directory})`)
              continue
            }
            try {
              if (!await setSyncPending(s.issue, true)) {
                results.push(`  #${s.issue}: skipped — state changed before sync (now BLOCKED or removed)`)
                continue
              }
              gitIn(s.directory, "fetch origin main")
              const merge = gitIn(s.directory, "merge origin/main --no-edit")
              if (merge.code !== 0) {
                gitIn(s.directory, "merge --abort")
                await setSliceState(s, "blocked", false, { syncPending: false })
                results.push(`  #${s.issue}: BLOCKED — merge conflict with origin/main (never forced; resolve manually or re-slice)`)
              } else {
                await setSyncPending(s.issue, false)
                results.push(`  #${s.issue}: merged origin/main`)
              }
            } catch (error: any) {
              await setSyncPending(s.issue, true).catch(() => false)
              results.push(`  #${s.issue}: sync pending — ${error?.message ?? error}`)
            }
          }
          return { content: `slice_sync:\n${results.join("\n")}` }
        },
      )

      tool(
        "finish",
        "After Robin merges the PR: verify the worktree is clean and pushed, tear down its sandbox, remove the worktree and the local branch. Refuses dirty or unpushed worktrees; the device/inode guard protects the worktree root.",
        { issue: { type: "number" } },
        async (input: { issue: number }, context) => {
          const dir = await sessionDir(context.sessionID)
          const record = (await ctx.storage.get(`slices/${input.issue}`)) as SliceRecord | undefined
          if (!record) return { content: `refused: no slice record for #${input.issue}` }

          const pr = gh(dir, `pr view ${JSON.stringify(record.branch)} --json state,url`)
          if (pr.code !== 0 || String(JSON.parse(pr.out || "{}").state).toUpperCase() !== "MERGED") {
            return { content: `refused: the PR for ${record.branch} is not merged yet — Robin merges` }
          }
          record.prURL = JSON.parse(pr.out).url

          const status = gitIn(record.directory, "status --porcelain")
          if (status.out.trim()) {
            return { content: `refused: worktree ${record.directory} is dirty — commit or stash first (unpushed work is never lost)` }
          }
          gitIn(record.directory, `fetch origin ${JSON.stringify(record.branch)}`)
          const unpushed = gitIn(record.directory, `log origin/${record.branch}..HEAD --oneline`)
          if (unpushed.out.trim()) {
            return { content: `refused: ${record.directory} has unpushed commits (${unpushed.out.trim().split("\n").length})` }
          }

          const guard = removalGuard(worktreeRoot, record.directory)
          if (!guard.ok) return { content: `refused: ${guard.refused}` }

          await teardownSandbox(record)

          try {
            await ctx.worktree.remove({ projectID, directory: record.directory, force: false })
          } catch (error: any) {
            const cls = classifyWorktreeError(error)
            return { content: `refused: worktree removal failed — ${error?.message ?? error} (${cls.hint})` }
          }
          gitIn(canonical, `branch -d ${JSON.stringify(record.branch)}`)
          await queueRecordWrite(input.issue, async () => {
            const current = (await ctx.storage.get(`slices/${input.issue}`)) as SliceRecord | undefined
            if (current) await ctx.storage.remove(`slices/${input.issue}`)
          })

          // the PRD closes when its last slice merges (oc-github's job to check; we note it)
          const prds = (await activeSlices()).filter((s) => s.prd === record.prd && s.issue !== record.issue)
          return {
            content: `slice #${input.issue} finished: worktree and branch removed, sandbox torn down` +
              (record.prd && prds.length === 0 ? ` (PRD #${record.prd} has no open slices left — oc-github closes it)` : ""),
          }
        },
      )
    })

    return () => { }
  },
})
