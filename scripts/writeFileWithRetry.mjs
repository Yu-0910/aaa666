import fs from "node:fs"

const RETRYABLE_WRITE_ERROR_CODES = new Set(["UNKNOWN", "EBUSY", "EPERM", "EACCES"])
const MAX_WRITE_ATTEMPTS = 60

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function retryDelayMs(attempt) {
  return Math.min(1000, 100 + attempt * 100)
}

export function writeTextFileWithRetrySync(filePath, body, encoding = "utf8") {
  let lastError = null
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${attempt}.tmp`
    try {
      fs.writeFileSync(tmpPath, body, encoding)
      fs.renameSync(tmpPath, filePath)
      return
    } catch (e) {
      lastError = e
      try {
        fs.unlinkSync(tmpPath)
      } catch {
        // best effort cleanup
      }
      const code = String(e?.code || "")
      if (!RETRYABLE_WRITE_ERROR_CODES.has(code) || attempt === MAX_WRITE_ATTEMPTS) break
      sleepSync(retryDelayMs(attempt))
    }
  }
  throw lastError
}

export function writeJsonFileWithRetrySync(filePath, payload) {
  writeTextFileWithRetrySync(filePath, JSON.stringify(payload, null, 2))
}
