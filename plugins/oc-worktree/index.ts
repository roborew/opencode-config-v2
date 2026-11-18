import { Plugin } from "@opencode/plugin"
import { execSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  type IssueInfo,
  type SliceRecord,
  classifyWorktreeError,
  envFilesToCopy,
  listWorktrees,
  parseBlockers,
  processIsAlive,
  removalGuard,
  slugify,
} from "./lib"
import { sandboxId } from "../oc-sandbox/lib"
import { listSlices, readSlice, removeSlice, updateSlice } from "../shared/slice-store"

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

    const claimSync = (issue: number): string | undefined => {
      const token = randomUUID()
      let claimed = false
      updateSlice<SliceRecord>(canonical, issue, (current) => {
        if (!current) return undefined
        if (current.state !== "building" && current.state !== "in-review") return current
        if (current.syncClaim) {
          // A claim owned by a live process is honoured; one left by a dead
          // process (server restart mid-fetch) is reclaimed.
          if (current.syncClaimPID === process.pid || processIsAlive(current.syncClaimPID)) return current
          current.syncClaim = undefined
          current.syncClaimPID = undefined
        }
        current.syncClaim = token
        current.syncClaimPID = process.pid
        current.syncPending = true
        claimed = true
        return current
      })
      return claimed ? token : undefined
    }

    const releaseSync = (issue: number, token: string, pending: boolean): void => {
      updateSlice<SliceRecord>(canonical, issue, (current) => {
        if (!current || current.syncClaim !== token) return current
        current.syncClaim = undefined
        current.syncClaimPID = undefined
        current.syncPending = pending
        return current
      })
    }

    const setSliceState = async (
      record: SliceRecord,
      state: SliceRecord["state"],
      resume = false,
      patch: Partial<SliceRecord> = {},
      expectedBlockedRevision?: string,
    ): Promise<boolean> => {
      let current: SliceRecord | undefined
      let applied = false
      current = updateSlice<SliceRecord>(canonical, record.issue, (latest) => {
        current = latest
        if (!latest) return undefined
        if (expectedBlockedRevision && latest.blockedRevision !== expectedBlockedRevision) return latest
        if (latest.state === "blocked" && state !== "blocked" && !resume) return latest
        Object.assign(latest, patch)
        latest.state = state
        latest.pendingLabel = state === "building" ? "in-progress" : state
        current = latest
        applied = true
        return latest
      })
      if (!current || !applied) return false
      const label = current.pendingLabel
      if (!label) return true
      const removals = ["in-progress", "in-review", "ready", "blocked"]
        .filter((name) => name !== label)
        .map((name) => ` --remove-label status:${name}`)
        .join("")
      const update = gh(canonical, `issue edit ${record.issue} --add-label status:${label}${removals}`)
      if (update.code === 0) {
        updateSlice<SliceRecord>(canonical, record.issue, (latest) => {
          if (latest && latest.pendingLabel === label) latest.pendingLabel = undefined
          return latest
        })
      } else {
        console.error(`[oc-worktree] label update failed for slice #${record.issue}; slice_status will retry`)
      }
      const saved = readSlice<SliceRecord>(canonical, record.issue)
      if (saved) Object.assign(record, saved)
      return applied
    }

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

    const activeSlices = async (): Promise<SliceRecord[]> => listSlices<SliceRecord>(canonical)

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
          const existing = readSlice<SliceRecord>(canonical, input.issue)
          if (existing?.sessionID) {
            return { content: `slice #${input.issue} is already active (${existing.state}) in ${existing.directory}; use slice_message or slice_resume for its worker, or slice_status for its PR` }
          }
          if (existing) {
            const token = randomUUID()
            const claimed = updateSlice<SliceRecord>(canonical, input.issue, (current) => {
              if (!current) return undefined
              if (current.sessionID) return current
              if (current.sessionStarting) {
                // Recover a start claim whose owner process died before it could
                // attach a worker; a live owner still wins.
                if (current.sessionStartingPID === process.pid || processIsAlive(current.sessionStartingPID)) return current
                current.sessionStarting = undefined
                current.sessionStartingPID = undefined
              }
              current.sessionStarting = token
              current.sessionStartingPID = process.pid
              return current
            })
            if (!claimed) return { content: `BLOCKED: slice #${input.issue} record disappeared during session recovery` }
            if (claimed.sessionID) {
              return { content: `slice #${input.issue} is already active (${claimed.state}) in ${claimed.directory}; use slice_message or slice_resume` }
            }
            if (claimed.sessionStarting !== token) {
              return { content: `BLOCKED: worker recovery for slice #${input.issue} is already in progress` }
            }
            let directory = claimed.directory
            if (!directory) {
              // The previous start died before persisting its directory. Find the
              // worktree already created for this branch, or create it now, and
              // persist the directory before attaching a worker.
              const match = listWorktrees(canonical)
                .filter((w) => w.type === "worktree")
                .find((w) => gitIn(w.directory, "rev-parse --abbrev-ref HEAD").out.trim() === claimed.branch)
              try {
                if (match) directory = match.directory
                else {
                  const created: any = await ctx.worktree.create({
                    projectID,
                    name: `slice-${claimed.issue}-${slugify(claimed.title ?? `slice ${claimed.issue}`)}`,
                    branch: claimed.branch,
                  })
                  directory = created.directory
                }
              } catch (error: any) {
                updateSlice<SliceRecord>(canonical, input.issue, (current) => {
                  if (current?.sessionStarting === token) {
                    current.sessionStarting = undefined
                    current.sessionStartingPID = undefined
                  }
                  return current
                })
                return { content: `BLOCKED: slice #${input.issue} startup is incomplete and its worktree could not be recovered: ${error?.message ?? error}` }
              }
              updateSlice<SliceRecord>(canonical, input.issue, (current) => {
                if (!current) return current
                current.directory = directory
                return current
              })
              claimed.directory = directory
            }
            try {
              const session: any = await ctx.session.create({
                title: `#${input.issue} ${claimed.title ?? "slice"}`,
                location: { directory },
              })
              const sessionID = session.id ?? session.sessionID
              if (!sessionID) throw new Error("session create returned no session ID")
              await ctx.session.command({ sessionID, name: "build", text: `#${input.issue}` })
              const saved = updateSlice<SliceRecord>(canonical, input.issue, (current) => {
                if (!current) return undefined
                current.sessionID = sessionID
                current.sessionStarting = undefined
                current.sessionStartingPID = undefined
                return current
              })
              if (saved && existsSync(saved.directory)) writeSliceRecordFile(saved.directory, saved)
              // Attaching a worker is not the same as resuming work. Derive the
              // label from the state observed in the attachment transaction so a
              // BLOCKED slice stays BLOCKED. If another transition already queued a
              // label, leave it to slice_status instead of replacing it.
              const effective = saved ?? claimed
              if (!effective.pendingLabel) {
                const label = effective.state === "ready"
                  ? "ready"
                  : effective.state === "in-review"
                    ? "in-review"
                    : effective.state === "building"
                      ? "in-progress"
                      : "blocked"
                ensureLabel(canonical, `status:${label}`)
                const removals = ["in-progress", "in-review", "ready", "blocked"]
                  .filter((name) => name !== label)
                  .map((name) => ` --remove-label status:${name}`)
                  .join("")
                const labelUpdate = gh(canonical, `issue edit ${input.issue} --add-label status:${label}${removals}`)
                if (labelUpdate.code !== 0) {
                  updateSlice<SliceRecord>(canonical, input.issue, (current) => {
                    if (current) current.pendingLabel = label
                    return current
                  })
                }
              }
              return { content: `recovered worker session ${sessionID} for existing slice #${input.issue} in ${effective.directory}` }
            } catch (error: any) {
              updateSlice<SliceRecord>(canonical, input.issue, (current) => {
                if (current?.sessionStarting === token) {
                  current.sessionStarting = undefined
                  current.sessionStartingPID = undefined
                }
                return current
              })
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
          const prd = Number(info.body.match(/part of[^#\n]*#(\d+)/i)?.[1] ?? 0) || undefined
          const startupToken = randomUUID()
          const startupRecord: SliceRecord = {
            issue: input.issue,
            title: info.title,
            labels: info.labels,
            prd,
            branch,
            directory: "",
            coordinatorSessionID: context?.sessionID ?? undefined,
            state: "building",
            sessionStarting: startupToken,
            sessionStartingPID: process.pid,
            createdAt: Date.now(),
          }
          // Claim startup before creating a worktree so a concurrent slice_start
          // cannot publish a second record and start a second worker.
          let claimedStart = false
          updateSlice<SliceRecord>(canonical, input.issue, (current) => {
            if (current) return current
            claimedStart = true
            return startupRecord
          })
          if (!claimedStart) {
            return { content: `BLOCKED: slice #${input.issue} was started by another call; use slice_status to inspect it` }
          }

          let directory: string
          try {
            const created: any = await ctx.worktree.create({ projectID, name, branch })
            directory = created.directory
          } catch (error: any) {
            removeSlice(canonical, input.issue)
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

          const record: SliceRecord = startupRecord
          record.directory = directory
          const published = updateSlice<SliceRecord>(canonical, input.issue, (current) => {
            if (!current) return undefined
            current.directory = directory
            return current
          })
          if (!published) {
            return { content: `BLOCKED: slice #${input.issue} record disappeared after worktree creation` }
          }
          try {
            writeSliceRecordFile(directory, record)
          } catch (error: any) {
            // Keep the worktree and its persisted directory so a retry can finish
            // publication and attach a worker; release the startup claim.
            updateSlice<SliceRecord>(canonical, input.issue, (current) => {
              if (!current) return undefined
              if (current.sessionStarting === startupToken) {
                current.sessionStarting = undefined
                current.sessionStartingPID = undefined
              }
              return current
            })
            return { content: `BLOCKED: worktree ${directory} was created on ${branch} but its slice record could not be written: ${error?.message ?? error}. Retry slice_start to finish publication.` }
          }

          let sessionID: string | undefined
          try {
            const session: any = await ctx.session.create({
              title: `#${input.issue} ${info.title}`,
              location: { directory },
            })
            sessionID = session.id ?? session.sessionID
            if (!sessionID) throw new Error("session create returned no session ID")
            await ctx.session.command({ sessionID, name: "build", text: `#${input.issue}` })
            const saved = updateSlice<SliceRecord>(canonical, input.issue, (current) => {
              if (!current) return undefined
              current.sessionID = sessionID
              current.sessionStarting = undefined
              current.sessionStartingPID = undefined
              return current
            })
            record.sessionID = sessionID
            record.sessionStarting = undefined
            record.sessionStartingPID = undefined
            if (saved && existsSync(saved.directory)) writeSliceRecordFile(saved.directory, saved)
          } catch (error: any) {
            updateSlice<SliceRecord>(canonical, input.issue, (current) => {
              if (!current) return undefined
              if (current.sessionStarting === startupToken) {
                current.sessionStarting = undefined
                current.sessionStartingPID = undefined
              }
              return current
            })
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
        let slices = await activeSlices()
        const dir = await sessionDir(context.sessionID)
        if (dir === canonical && context.sessionID) {
          for (const record of slices) {
            if (!record.coordinatorSessionID || record.pendingLabel) {
              const current = readSlice<SliceRecord>(canonical, record.issue)
              if (!current) continue
              let labelOk = true
              if (current.pendingLabel) {
                const label = current.pendingLabel
                const removals = ["in-progress", "in-review", "ready", "blocked"]
                  .filter((name) => name !== label)
                  .map((name) => ` --remove-label status:${name}`)
                  .join("")
                labelOk = gh(canonical, `issue edit ${current.issue} --add-label status:${label}${removals}`).code === 0
              }
              updateSlice<SliceRecord>(canonical, record.issue, (latest) => {
                if (!latest) return undefined
                if (!latest.coordinatorSessionID) latest.coordinatorSessionID = context.sessionID
                if (labelOk && latest.pendingLabel === current.pendingLabel) latest.pendingLabel = undefined
                return latest
              })
            }
          }
          slices = await activeSlices()
        }
        if (slices.length === 0) return { content: "no active slices" }
        const lines = slices.map(
          (s) => `  #${s.issue} ${s.state} — ${s.branch} — session ${s.sessionID ?? "-"}${s.prURL ? ` — ${s.prURL}` : ""}${s.blockedReason ? ` — reason: ${s.blockedReason}` : ""}${s.pendingLabel ? ` — label retry pending: ${s.pendingLabel}` : ""}${s.syncPending ? " — sync pending" : ""}${s.pushPending ? " — push pending" : ""}`,
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
          const record = readSlice<SliceRecord>(canonical, input.issue)
          if (!record) return { content: `BLOCKED: no active slice record for #${input.issue}; post-merge fixes need a new slice` }
          if (!record.sessionID) return { content: `BLOCKED: slice #${input.issue} has no existing worker session` }
          if (record.state === "blocked") {
            return { content: `BLOCKED: slice #${input.issue} is already BLOCKED; use slice_resume after resolving the blocker` }
          }
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
          const record = readSlice<SliceRecord>(canonical, input.issue)
          if (!record) return { content: `BLOCKED: no active slice record for #${input.issue}` }
          if (!record.sessionID) return { content: `BLOCKED: slice #${input.issue} has no worker session; retry slice_start to recover it` }
          if (record.state !== "blocked") return { content: `slice #${input.issue} is ${record.state}, not BLOCKED; no resume needed` }
          const pr = gh(canonical, `pr view ${JSON.stringify(record.branch)} --json state,url`)
          if (pr.code === 0) {
            if (String(JSON.parse(pr.out || "{}").state).toUpperCase() !== "OPEN") {
              return { content: `BLOCKED: the PR for slice #${input.issue} is no longer OPEN; post-merge work needs a new slice` }
            }
          } else {
            const listed = gh(canonical, `pr list --head ${JSON.stringify(record.branch)} --state all --json number,state`)
            if (listed.code !== 0) {
              return { content: `BLOCKED: could not verify whether slice #${input.issue} has a PR (${listed.out.trim().slice(0, 200)}); the slice remains BLOCKED, retry later` }
            }
            const prs = JSON.parse(listed.out || "[]") as { number: number; state: string }[]
            const nonOpen = prs.find((entry) => String(entry.state).toUpperCase() !== "OPEN")
            if (nonOpen) {
              return { content: `BLOCKED: the PR for slice #${input.issue} is ${nonOpen.state}; post-merge work needs a new slice` }
            }
          }
          const observedBlocker = record.blockedRevision
          const text = `The blocker for slice #${input.issue} has been resolved or replanned. Resume work in the existing worktree and branch. Follow the current /build #${input.issue} workflow; if a PR already exists, run the normal verification, review and ship flow, then restart its prmon_watch. Do not create a replacement worktree or PR.`
          try {
            await ctx.session.prompt({ sessionID: record.sessionID, text, delivery: "queue" })
          } catch (error: any) {
            return { content: `BLOCKED: could not wake the worker for slice #${input.issue}: ${error?.message ?? error}` }
          }
          const resumed = await setSliceState(record, "building", true, { blockedReason: undefined, blockedRevision: undefined }, observedBlocker)
          if (!resumed) return { content: `BLOCKED: slice #${input.issue} reported a newer blocker while resume was pending; it remains BLOCKED and was not resumed` }
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
          const record = readSlice<SliceRecord>(canonical, input.issue)
          if (!record) return { content: `BLOCKED: no slice record for #${input.issue}` }
          if (dir !== record.directory) {
            return { content: `BLOCKED: slice_block for #${input.issue} must run in its own worktree (${record.directory})` }
          }
          if (!input.reason.trim()) return { content: "BLOCKED: a reason is required" }

          const reason = input.reason.trim()
          if (!await setSliceState(record, "blocked", false, { blockedReason: reason, blockedRevision: randomUUID(), syncClaim: undefined, syncClaimPID: undefined })) {
            return { content: `BLOCKED: slice #${input.issue} no longer exists; blocker was not recorded and no notification was sent` }
          }
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
              const token = claimSync(s.issue)
              if (token) releaseSync(s.issue, token, true)
              results.push(`  #${s.issue}: sync pending — worktree missing (${s.directory})`)
              continue
            }
            const token = claimSync(s.issue)
            if (!token) {
              results.push(`  #${s.issue}: skipped — state changed before sync (READY, BLOCKED, syncing or removed)`)
              continue
            }
            try {
              const fetched = gitIn(s.directory, "fetch origin main")
              if (fetched.code !== 0) throw new Error(`git fetch failed: ${fetched.out.trim().slice(0, 200)}`)
              if (gitIn(s.directory, "rev-parse -q --verify MERGE_HEAD").out.trim()) {
                releaseSync(s.issue, token, true)
                results.push(`  #${s.issue}: sync pending — a merge is already in progress; left untouched`)
                continue
              }
              const before = gitIn(s.directory, "rev-parse HEAD").out.trim()
              const merge = gitIn(s.directory, "merge origin/main --no-edit")
              if (merge.code !== 0) {
                gitIn(s.directory, "merge --abort")
                await setSliceState(s, "blocked", false, { syncPending: false, syncClaim: undefined, syncClaimPID: undefined })
                results.push(`  #${s.issue}: BLOCKED — merge conflict with origin/main (never forced; resolve manually or re-slice)`)
              } else {
                const after = gitIn(s.directory, "rev-parse HEAD").out.trim()
                const changed = Boolean(before && after && before !== after)
                const inReview = s.state === "in-review"
                const needsPush = inReview && (changed || s.pushPending === true) && Boolean(s.sessionID)
                // Clear the claim and record the push obligation in one token-checked
                // update so a monitor cannot observe READY in between.
                updateSlice<SliceRecord>(canonical, s.issue, (current) => {
                  if (!current || current.syncClaim !== token) return current
                  current.syncClaim = undefined
                  current.syncClaimPID = undefined
                  current.syncPending = false
                  if (inReview && changed) {
                    current.pushPending = true
                    current.pushCommit = after
                  }
                  return current
                })
                if (needsPush) {
                  try {
                    await ctx.session.prompt({
                      sessionID: s.sessionID!,
                      text: `origin/main was synced into your in-review branch for slice #${s.issue}, creating local commits that are not yet on the PR. Verify the merge, push the branch, then restart prmon_watch in this same worktree. READY stays deferred until the push lands.`,
                      delivery: "queue",
                    })
                    results.push(changed
                      ? `  #${s.issue}: merged origin/main and woke the worker to push (READY deferred)`
                      : `  #${s.issue}: wake retried for the pending push (READY deferred)`)
                  } catch (error: any) {
                    results.push(`  #${s.issue}: merged origin/main; the worker wake failed: ${error?.message ?? error} (READY stays deferred)`)
                  }
                } else {
                  results.push(`  #${s.issue}: merged origin/main`)
                }
              }
            } catch (error: any) {
              releaseSync(s.issue, token, true)
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
          const record = readSlice<SliceRecord>(canonical, input.issue)
          if (!record) return { content: `refused: no slice record for #${input.issue}` }
          if (record.cleanupComplete) {
            try {
              removeSlice(canonical, input.issue)
              return { content: `slice #${input.issue} record cleanup completed; worktree was already removed` }
            } catch (error: any) {
              return { content: `refused: worktree is removed but the slice record could not be cleaned: ${error?.message ?? error}; retry slice_finish` }
            }
          }

          const pr = gh(dir, `pr view ${JSON.stringify(record.branch)} --json state,url`)
          if (pr.code !== 0 || String(JSON.parse(pr.out || "{}").state).toUpperCase() !== "MERGED") {
            return { content: `refused: the PR for ${record.branch} is not merged yet — the user merges` }
          }
          record.prURL = JSON.parse(pr.out).url
          ensureLabel(canonical, "status:cleanup-pending")
          if (gh(canonical, `issue edit ${input.issue} --add-label status:cleanup-pending`).code !== 0) {
            return { content: `refused: the merge is verified but status:cleanup-pending could not be set; slice record retained for retry` }
          }

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
          updateSlice<SliceRecord>(canonical, input.issue, (current) => {
            if (current) current.cleanupComplete = true
            return current
          })
          try {
            removeSlice(canonical, input.issue)
          } catch (error: any) {
            return { content: `slice #${input.issue} cleanup completed but the slice record could not be removed: ${error?.message ?? error}. Retry slice_finish; status:cleanup-pending lets central build retry issue and PRD closure.` }
          }

          return {
            content: `slice #${input.issue} finished: worktree and branch removed, sandbox torn down; issue and PRD closure recorded by status:cleanup-pending`,
          }
        },
      )
    })

    return () => { }
  },
})
