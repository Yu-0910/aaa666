/**
 * 試合取得・canonical 一括生成などの運用ログ（追記のみ）。
 * `_data/scraped_games/_meta/pipeline_bulk.log`
 */
import fs from "node:fs"
import path from "node:path"

/** @param {string} root プロジェクトルート */
export function appendPipelineBulkLog(root, component, message) {
  const dir = path.join(root, "_data", "scraped_games", "_meta")
  fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, "pipeline_bulk.log")
  const line = `${new Date().toISOString()} [${component}] ${message}\n`
  fs.appendFileSync(p, line, "utf8")
}
