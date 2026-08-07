/**
 * `raw_sportsnavi_text/{gameId}.html` から、全プレー（各 `li.bb-liveText__item`）について
 * 一球速報でプレー上部に出る見出し `p.bb-liveText__itemTitle` を読み、
 * canonical の `game.textPlayByPlay[].playHeadlineJa` にマージする。
 *
 * 牽制球捕球ミス等の特別トリガーは不要。raw がある全試合を対象。動画見出しが無いプレーは null。
 * `lines` の粒度が Yahoo マージ済みと異なる場合は、1プレー全文に含まれる先頭の行へ見出しを付与（sportsnaviTextPlaySections.ts）。
 *
 *   npx tsx scripts/enrich_text_play_headlines_from_raw_text.ts
 *   npx tsx scripts/enrich_text_play_headlines_from_raw_text.ts --year 2026 --from 2026-08-07 --to 2026-08-07
 *   npx tsx scripts/enrich_text_play_headlines_from_raw_text.ts --game-ids 2021039241,2021039242
 */

import { existsSync, readFileSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  mergePlayHeadlinesLooseIntoTextPlayByPlay,
  parseSportsnaviTextPlaySectionsFromHtml,
} from "../lib/yahooGame/sportsnaviTextPlaySections"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; from: string; to: string; gameIds: string[] | null } {
  const args = process.argv.slice(2)
  let year = "2026"
  let from = ""
  let to = ""
  let gameIds: string[] | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = String(args[i + 1]).trim() || "2026"
      i++
    } else if (args[i] === "--from" && args[i + 1]) {
      from = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--to" && args[i + 1]) {
      to = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--game-ids" && args[i + 1]) {
      gameIds = String(args[i + 1])
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    }
  }
  return { year, from, to, gameIds }
}

function readJsonIfExists<T>(p: string): T | null {
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T
  } catch {
    return null
  }
}

function filterGameIdsByDateRange(
  byDate: Record<string, string[]> | undefined,
  from: string,
  to: string,
): string[] {
  if (!byDate) return []
  const out = new Set<string>()
  for (const [day, ids] of Object.entries(byDate)) {
    if (from && day < from) continue
    if (to && day > to) continue
    if (!Array.isArray(ids)) continue
    for (const id of ids) {
      const s = String(id ?? "").trim()
      if (s) out.add(s)
    }
  }
  return [...out].sort()
}

function main(): void {
  const { year, from, to, gameIds } = parseArgs()
  const canonicalDir = join(projectRoot, "_data", "scraped_games", "canonical")
  const rawTextDir = join(projectRoot, "_data", "scraped_games", "raw_sportsnavi_text")

  let updated = 0
  let skipped = 0
  let targetGameIds: string[] | null = gameIds ? [...new Set(gameIds)] : null
  if (!targetGameIds && (from || to)) {
    const indexPath = join(projectRoot, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
    const idx = readJsonIfExists<{ byDate?: Record<string, string[]> }>(indexPath)
    targetGameIds = filterGameIdsByDateRange(idx?.byDate, from, to)
    console.log(
      `[enrich_text_play_headlines_from_raw_text] date-range: from=${from || "(none)"} to=${to || "(none)"} -> ${targetGameIds.length} game(s)`,
    )
  }
  const files = targetGameIds
    ? targetGameIds.map((id) => `${id}.json`)
    : readdirSync(canonicalDir).filter((f) => f.endsWith(".json"))

  for (const f of files) {
    const gameId = f.replace(/\.json$/, "")
    const rawPath = join(rawTextDir, `${gameId}.html`)
    if (!existsSync(rawPath)) continue

    const cPath = join(canonicalDir, f)
    let doc: CanonicalGameDocument
    try {
      doc = JSON.parse(readFileSync(cPath, "utf8")) as CanonicalGameDocument
    } catch {
      continue
    }
    if (doc.schemaVersion !== "yahoo-game-canonical-v1") continue

    const html = readFileSync(rawPath, "utf8")
    const parsed = parseSportsnaviTextPlaySectionsFromHtml(html)
    if (parsed.length === 0) continue

    const merged = mergePlayHeadlinesLooseIntoTextPlayByPlay(doc.game?.textPlayByPlay ?? [], parsed)
    const before = JSON.stringify(doc.game?.textPlayByPlay ?? [])
    if (JSON.stringify(merged) === before) {
      skipped += 1
      continue
    }
    doc.game.textPlayByPlay = merged

    writeJsonFileWithRetrySync(cPath, doc)
    updated += 1
  }

  console.log(`[enrich_text_play_headlines_from_raw_text] updated=${updated} skipped=${skipped}`)
}

main()
