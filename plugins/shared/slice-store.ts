import { randomUUID } from "node:crypto"
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs"
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

/** A live writer owns its lock; a lock left by a dead process is reclaimable. */
const processAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error: any) {
    // EPERM means the process exists but belongs to another user.
    return error?.code === "EPERM"
  }
}

const staleLock = (lock: string): boolean => {
  let contents = ""
  try {
    contents = readFileSync(lock, "utf8").trim()
  } catch {
    return false
  }
  const pid = Number(contents)
  if (Number.isInteger(pid) && pid > 0) return !processAlive(pid)
  // The owner died before writing its pid. Only reclaim a genuinely old lock so
  // we never steal one from a live writer in that window.
  try {
    return Date.now() - statSync(lock).mtimeMs > 30_000
  } catch {
    return false
  }
}

const recoveryPath = (lock: string) => `${lock}.recovery`

/**
 * Serialize stale-lock recovery so two processes cannot both remove the same
 * dead lock and have the second delete the first process's replacement.
 */
const acquireRecovery = (lock: string): boolean => {
  const path = recoveryPath(lock)
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const fd = openSync(path, "wx")
      try {
        writeSync(fd, String(process.pid))
      } finally {
        closeSync(fd)
      }
      return true
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error
      let contents = ""
      try {
        contents = readFileSync(path, "utf8").trim()
      } catch { }
      const pid = Number(contents)
      if (Number.isInteger(pid) && pid > 0 && !processAlive(pid)) {
        try {
          unlinkSync(path)
        } catch { }
        continue
      }
      sleep(10)
    }
  }
  return false
}

const withLock = <T>(canonical: string, issue: number, task: () => T): T => {
  ensureDir(canonical)
  const lock = lockPath(canonical, issue)
  let fd: number | undefined
  for (let attempt = 0; attempt < 500; attempt++) {
    try {
      fd = openSync(lock, "wx")
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error
      if (staleLock(lock)) {
        if (acquireRecovery(lock)) {
          try {
            // Re-check under the recovery lock: another process may already have
            // replaced the stale lock with a live one.
            if (staleLock(lock)) {
              try {
                unlinkSync(lock)
              } catch { }
            }
          } finally {
            try {
              unlinkSync(recoveryPath(lock))
            } catch { }
          }
        }
        continue
      }
      sleep(10)
      continue
    }
    try {
      writeSync(fd, String(process.pid))
    } catch (error) {
      try {
        closeSync(fd)
      } catch { }
      try {
        unlinkSync(lock)
      } catch { }
      fd = undefined
      throw error
    }
    break
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
  } catch (error: any) {
    // Only a missing record is absence. Other errors must surface so callers can
    // retry instead of treating a transient read failure as record removal.
    if (error?.code === "ENOENT") return undefined
    throw error
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
      } catch (error: any) {
        if (error?.code !== "ENOENT") throw error
      }
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
    } catch (error: any) {
      // A missing record is already removed; anything else is a real failure the
      // caller must report and retry.
      if (error?.code !== "ENOENT") throw error
    }
  })
}
