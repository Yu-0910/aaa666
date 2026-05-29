/**
 * raw_sportsnavi_text/{gameId}.html から runnerEvents（盗塁/盗塁死）を再抽出し、
 * canonical.domain.runnerEvents を上書きする（best-effort）。
 *
 * 実行:
 *   node scripts/backfill_runner_events_from_raw_text_html.mjs --year 2026
 */

import fs from "node:fs"
import path from "node:path"
import { parseRunnerEventsFromRawTextHtml } from "../lib/yahooGame/sportsnaviStatsTextParse.mjs"

function parseArgs(argv) {
  const yearIdx = argv.indexOf("--year")
  const year = yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026"
  return { year }
}

function main() {
  const { year } = parseArgs(process.argv.slice(2))
  const root = process.cwd()
  const canonicalDir = path.join(root, "_data", "scraped_games", "canonical")
  const textDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi_text")

  const files = fs.readdirSync(canonicalDir).filter((f) => f.endsWith(".json"))
  let wrote = 0
  let skippedNoText = 0
  let unchanged = 0

  for (const f of files) {
    const p = path.join(canonicalDir, f)
    let doc
    try {
      doc = JSON.parse(fs.readFileSync(p, "utf8"))
    } catch {
      continue
    }
    if (!doc || doc.schemaVersion !== "yahoo-game-canonical-v1" || !doc.gameId) continue
    const title = String(doc.game?.meta?.documentTitle ?? "")
    if (year && !title.includes(`${year}年`)) continue

    const textPath = path.join(textDir, `${doc.gameId}.html`)
    if (!fs.existsSync(textPath)) {
      skippedNoText += 1
      continue
    }
    const html = fs.readFileSync(textPath, "utf8")
    const runnerEvents = parseRunnerEventsFromRawTextHtml(html, String(doc.gameId))

    const prev = JSON.stringify(doc.domain?.runnerEvents ?? [])
    const next = JSON.stringify(runnerEvents ?? [])
    if (prev === next) {
      unchanged += 1
      continue
    }
    doc.builtAt = new Date().toISOString()
    doc.domain = { ...(doc.domain ?? {}), runnerEvents }
    fs.writeFileSync(p, JSON.stringify(doc, null, 2), "utf8")
    wrote += 1
  }

  console.log(
    `[backfill_runner_events_from_raw_text_html] year=${year} wrote=${wrote} unchanged=${unchanged} skippedNoText=${skippedNoText} files=${files.length}`,
  )
}

main()

