import { randomUUID } from "node:crypto"
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Shared slice-record store.
 *
 * OpenCode's `ctx.storage` is namespaced per plugin, so oc-worktree and
 * oc-pr-monitor cannot use it as a common source of truth. Records therefore
 * live under the canonical checkout's git directory, where both plugin
 * instances and every worktree session resolve the same path.
 *
 * Every mutation runs under a per-slice lock and writes through a temp file +
 * rename. This gives both plugins one serialization point for state, label,
 * sync and recovery updates without exposing secrets or adding app-repo files.
 */

/**
 * Minimal shape the store needs. Kept structural (no index signature) so
 * concrete record interfaces such as `SliceRecord` satisfy it directly.
 */
export interface StoreSlice {
  issue: number
}

const storeDir = (canonical: string) => join(canonical, ".git", "opencode", "slices")
const recordPath = (canonical: string, issue: number) => join(storeDir(canonical), `${issue}.json`)
const lockPath = (canonical: string, issue: number) => join(storeDir(canonical), `${issue}.lock`)

const ensureDir = (canonical: string) => mkdirSync(storeDir(canonical), { recursive: true })

const sleep = (ms: number) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

const withLock = <T>(canonical: string, issue: number, task: () => T): T => {
  ensureDir(canonical)
  const lock = lockPath(canonical, issue)
  let fd: number | undefined
  for (let attempt = 0; attempt < 500; attempt++) {
    try {
      fd = openSync(lock, "wx")
      break
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error
      sleep(10)
    }
  }
  if (fd === undefined) throw new Error(`timed out waiting for the slice #${issue} record lock`)
  try {
    return task()
  } finally {
    closeSync(fd)
    try {
      unlinkSync(lock)
    } catch { }
  }
}

export function readSlice<T extends StoreSlice>(canonical: string, issue: number): T | undefined {
  try {
    return JSON.parse(readFileSync(recordPath(canonical, issue), "utf8")) as T
  } catch {
    return undefined
  }
}

export function listSlices<T extends StoreSlice>(canonical: string): T[] {
  const dir = storeDir(canonical)
  if (!existsSync(dir)) return []
  const out: T[] = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue
    try {
      out.push(JSON.parse(readFileSync(join(dir, file), "utf8")) as T)
    } catch { }
  }
  return out.sort((a, b) => a.issue - b.issue)
}

export function writeSlice<T extends StoreSlice>(canonical: string, record: T): T {
  updateSlice(canonical, record.issue, () => record)
  return record
}

export function updateSlice<T extends StoreSlice>(
  canonical: string,
  issue: number,
  mutate: (current: T | undefined) => T | undefined,
): T | undefined {
  return withLock(canonical, issue, () => {
    const current = readSlice<T>(canonical, issue)
    const next = mutate(current)
    if (next === undefined) {
      try {
        unlinkSync(recordPath(canonical, issue))
      } catch { }
      return undefined
    }
    const target = recordPath(canonical, issue)
    const temp = join(storeDir(canonical), `.${issue}.${process.pid}.${randomUUID()}.tmp`)
    writeFileSync(temp, JSON.stringify(next, null, 2))
    renameSync(temp, target)
    return next
  })
}

export function removeSlice(canonical: string, issue: number): void {
  withLock(canonical, issue, () => {
    try {
      unlinkSync(recordPath(canonical, issue))
    } catch { }
  })
}
