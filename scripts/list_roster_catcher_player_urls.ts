/**
 * Phase 2: 名簿捕手の個人ページ URL 一覧
 *
 *   npx tsx scripts/list_roster_catcher_player_urls.ts [--format json|csv|md]
 */

import { writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import {
  evaluateAllRosterCatcherPlayerPages,
  findDuplicateCatcherNameKeys,
} from "@/lib/rosterCatcherPlayerPageReachability"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseFormat(): "json" | "csv" | "md" {
  const idx = process.argv.indexOf("--format")
  const v = idx >= 0 ? (process.argv[idx + 1] ?? "").trim().toLowerCase() : "md"
  if (v === "json" || v === "csv" || v === "md") return v
  return "md"
}

function main() {
  const format = parseFormat()
  const rows = evaluateAllRosterCatcherPlayerPages()
  const dupes = findDuplicateCatcherNameKeys()

  if (format === "json") {
    const out = rows.map((r) => ({
      ...r.urls,
      ok: r.ok,
      issues: r.issues,
    }))
    console.log(JSON.stringify({ count: out.length, duplicateNameKeys: dupes, rows: out }, null, 2))
    return
  }

  if (format === "csv") {
    const lines = [
      "npb_player_id,name_ja,team,team_code,pathByNpbId,pathByJaName,ok",
      ...rows.map(
        (r) =>
          [
            r.urls.npb_player_id,
            `"${r.urls.name_ja.replace(/"/g, '""')}"`,
            `"${r.urls.team.replace(/"/g, '""')}"`,
            r.urls.team_code,
            r.urls.pathByNpbId,
            r.urls.pathByJaName,
            r.ok ? "1" : "0",
          ].join(",")
      ),
    ]
    const dest = join(projectRoot, "docs", "roster_catcher_player_urls.csv")
    writeFileSync(dest, lines.join("\n") + "\n", "utf8")
    console.log(`Wrote ${rows.length} rows to ${dest}`)
    return
  }

  const mdLines = [
    "# 名簿捕手 個人ページ URL 一覧（Phase 2 自動生成）",
    "",
    `生成件数: **${rows.length}**`,
    "",
    dupes.length
      ? `⚠ 日本語名照合キー重複: ${dupes.length} 件（NPB ID URL を正とする）`
      : "日本語名照合キー重複: なし",
    "",
    "| 選手 | 球団 | NPB ID | URL（NPB） | URL（日本語名） |",
    "|------|------|--------|------------|----------------|",
    ...rows.map(
      (r) =>
        `| ${r.urls.name_ja} | ${r.urls.team} | ${r.urls.npb_player_id} | ${r.urls.pathByNpbId} | ${r.urls.pathByJaName} |`
    ),
    "",
  ]
  const dest = join(projectRoot, "docs", "roster_catcher_player_urls.md")
  writeFileSync(dest, mdLines.join("\n"), "utf8")
  console.log(`Wrote ${rows.length} rows to ${dest}`)
}

main()
