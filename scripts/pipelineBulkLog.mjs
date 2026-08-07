/**
 * 試合取得・canonical 一括生成などの運用ログ（追記のみ）。
 * `_data/scraped_games/_meta/pipeline_bulk.log`
 */
import fs from "node:fs"
import path from "node:path"

function jstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const out = {}
  for (const part of parts) {
    if (part.type !== "literal") out[part.type] = part.value
  }
  return out
}

export function formatJstTimestamp(date = new Date()) {
  const p = jstParts(date)
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} JST`
}

/** @param {string} root プロジェクトルート */
export function appendPipelineBulkLog(root, component, message) {
  const dir = path.join(root, "_data", "scraped_games", "_meta")
  fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, "pipeline_bulk.log")
  const line = `${formatJstTimestamp()} [${component}] ${message}\n`
  fs.appendFileSync(p, line, "utf8")
}
