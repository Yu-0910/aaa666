/**
 * 既存 canonical の `domain.plateAppearances` に、スポナビ実況（`game.textPlayByPlay`）から不足分を追加する。
 * Phase10 由来の plateAppearances が欠けている試合の「打席欠損」を埋めるためのバックフィル。
 * 日次パイプライン（Phase10 マージ直後）でも冪等に実行する。
 * 取りこぼし検知: `npm run validate:canonical-pa-text-result-coverage`（`inferResultSummaryJaFromSportsnaviPlayLineText` の拡張が必要な表記を列挙）
 *
 *   npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts
 *   npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts --game-id 2021038725
 *   npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts --game-ids 2021038725,2021038726
 *   npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts --year 2026 --from 2026-07-18 --to 2026-07-19
 */

import { createHash } from "crypto"
import { existsSync, readdirSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { applyCarryForwardPitcherForIntentionalWalks } from "../lib/yahooGame/carryForwardPitcherForIntentionalWalk"
import { supplementPlateAppearancesFromTextPlayByPlay } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): {
  year: string
  gameId: string | null
  gameIds: string[] | null
  from: string
  to: string
} {
  const args = process.argv.slice(2)
  let year = "2026"
  let gameId: string | null = null
  let gameIds: string[] | null = null
  let from = ""
  let to = ""
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = String(args[i + 1]).trim() || "2026"
      i++
    } else if (args[i] === "--game-id" && args[i + 1]) {
      gameId = args[i + 1]
      i++
    } else if (args[i] === "--game-ids" && args[i + 1]) {
      gameIds = String(args[i + 1])
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    } else if (args[i] === "--from" && args[i + 1]) {
      from = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--to" && args[i + 1]) {
      to = String(args[i + 1]).trim()
      i++
    }
  }
  return { year, gameId, gameIds, from, to }
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

function processDoc(raw: string): { doc: CanonicalGameDocument; changed: boolean } {
  const prev = JSON.parse(raw) as CanonicalGameDocument
  if (prev.schemaVersion !== "yahoo-game-canonical-v1" || !prev.gameId) {
    return { doc: prev, changed: false }
  }
  const pas0 = prev.domain?.plateAppearances ?? []
  const supplemented = supplementPlateAppearancesFromTextPlayByPlay(prev, pas0)
  const filled = applyCarryForwardPitcherForIntentionalWalks(supplemented)
  const before = JSON.stringify(pas0)
  const after = JSON.stringify(filled)
  if (before === after) return { doc: prev, changed: false }

  const paHash = createHash("sha256").update(after, "utf8").digest("hex")
  const evPrev = prev.eventsFingerprint ?? ""
  const eventsFingerprint = createHash("sha256")
    .update(`${evPrev}|textplay-supplement-v1|${paHash}`, "utf8")
    .digest("hex")

  const doc: CanonicalGameDocument = {
    ...prev,
    builtAt: new Date().toISOString(),
    eventsFingerprint,
    domain: {
      ...prev.domain,
      plateAppearances: filled,
      pitchEvents: filled.flatMap((p) => p.pitchEvents ?? []),
    },
  }
  return { doc, changed: true }
}

function main(): void {
  const { year, gameId, gameIds, from, to } = parseArgs()
  const dir = join(projectRoot, "_data", "scraped_games", "canonical")
  if (!existsSync(dir)) {
    console.error("missing:", dir)
    process.exit(1)
  }
  let targetGameIds: string[] | null = null
  if (gameId) {
    targetGameIds = [gameId]
  } else if (gameIds && gameIds.length > 0) {
    targetGameIds = [...new Set(gameIds)]
  } else if (from || to) {
    const indexPath = join(projectRoot, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
    const idx = readJsonIfExists<{ byDate?: Record<string, string[]> }>(indexPath)
    targetGameIds = filterGameIdsByDateRange(idx?.byDate, from, to)
    console.log(
      `[backfill:canonical:plate-appearances-from-text] date-range: from=${from || "(none)"} to=${to || "(none)"} -> ${targetGameIds.length} game(s)`,
    )
  }

  const files = targetGameIds
    ? targetGameIds.map((id) => `${id}.json`)
    : readdirSync(dir).filter((f) => f.endsWith(".json"))
  let n = 0
  for (const f of files) {
    const p = join(dir, f)
    if (!existsSync(p)) continue
    const raw = readFileSync(p, "utf8")
    const { doc, changed } = processDoc(raw)
    if (!changed) continue
    writeJsonFileWithRetrySync(p, doc)
    console.log("updated", f)
    n++
  }
  console.log(`done: ${n} file(s) changed`)
}

main()

