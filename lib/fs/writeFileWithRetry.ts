import { renameSync, unlinkSync, writeFileSync } from "fs"

const RETRYABLE_WRITE_ERROR_CODES = new Set(["UNKNOWN", "EBUSY", "EPERM", "EACCES"])
const MAX_WRITE_ATTEMPTS = 60

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function retryDelayMs(attempt: number): number {
  return Math.min(1000, 100 + attempt * 100)
}

export function writeTextFileWithRetrySync(path: string, body: string): void {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    const tmpPath = `${path}.${process.pid}.${Date.now()}.${attempt}.tmp`
    try {
      writeFileSync(tmpPath, body, "utf8")
      renameSync(tmpPath, path)
      return
    } catch (e) {
      lastError = e
      try {
        unlinkSync(tmpPath)
      } catch {
        // best effort cleanup
      }
      const code = String((e as NodeJS.ErrnoException)?.code || "")
      if (!RETRYABLE_WRITE_ERROR_CODES.has(code) || attempt === MAX_WRITE_ATTEMPTS) break
      sleepSync(retryDelayMs(attempt))
    }
  }
  throw lastError
}

export function writeJsonFileWithRetrySync(path: string, payload: unknown): void {
  writeTextFileWithRetrySync(path, JSON.stringify(payload, null, 2))
}
