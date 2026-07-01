/**
 * 一括取得で見つかった問題と、採った修正を別記録する追記ログ。
 * `_data/scraped_games/_meta/bulk_issue_fix.log`
 */
import fs from "node:fs"
import path from "node:path"

/**
 * @param {string} root プロジェクトルート
 * @param {object} entry
 * @param {string} entry.phase
 * @param {string} entry.dateJst
 * @param {string} entry.issue
 * @param {string} entry.fix
 * @param {string[]} [entry.gameIds]
 * @param {string} [entry.sourceUrl]
 */
export function appendBulkIssueFixLog(root, entry) {
  const dir = path.join(root, "_data", "scraped_games", "_meta")
  fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, "bulk_issue_fix.log")
  const line = JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      ...entry,
    },
    null,
    0,
  )
  fs.appendFileSync(p, `${line}\n`, "utf8")
}
