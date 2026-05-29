/**
 * canonical に runnerEvents（textPlayByPlay 由来）を付与する。
 *
 * **非推奨（本番）**: 盗塁死の正は一球 score 記録文（Phase4 マージ）。本番では `phase4:yahoo:pitch-by-pitch` を使う。
 *
 * 目的:
 * - SB/CS は battingLines/plateAppearances だけでは欠けるため、textPlayByPlay から正規化して保存する。
 *
 * 実行:
 *   npx tsx scripts/backfill_runner_events_from_text.ts
 *   npx tsx scripts/backfill_runner_events_from_text.ts --year 2026
 */

import { readdirSync, readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { runnerEventsFromTextPlayByPlay } from "../lib/yahooGame/runnerEventsFromTextPlayByPlay"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = String(args[i + 1]).trim()
      i++
    }
  }
  return { year }
}

function main(): void {
  const { year } = parseArgs()
  const dir = join(projectRoot, "_data", "scraped_games", "canonical")
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  let wrote = 0
  let unchanged = 0

  for (const f of files) {
    const p = join(dir, f)
    const raw = readFileSync(p, "utf8")
    let doc: CanonicalGameDocument
    try {
      doc = JSON.parse(raw) as CanonicalGameDocument
    } catch {
      continue
    }
    if (doc?.schemaVersion !== "yahoo-game-canonical-v1") continue
    // 年フィルタ（タイトルからゆるく判定）
    const title = String(doc.game?.meta?.documentTitle ?? "")
    if (year && !title.includes(`${year}年`)) continue

    const next = {
      ...doc,
      builtAt: new Date().toISOString(),
      domain: {
        ...doc.domain,
        runnerEvents: runnerEventsFromTextPlayByPlay(doc),
      },
    } satisfies CanonicalGameDocument

    const out = JSON.stringify(next, null, 2)
    if (out === raw) {
      unchanged += 1
      continue
    }
    writeFileSync(p, out, "utf8")
    wrote += 1
  }

  console.log(`[backfill_runner_events] year=${year} wrote=${wrote} unchanged=${unchanged} files=${files.length}`)
}

main()

