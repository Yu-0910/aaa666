/**
 * 指定打者の「試合開催日」別の安打数を、**出場成績末尾列のみ**
 *（`BattingLine.appearancePaSlotsJa`、省略時は `game.statsPlayerLinkedRows[].cells` の末尾列）から数える。
 * `hitBases` / `isAtBat` は `resultJaHitBases.ts`（一球・出場テキスト共通ルール）。
 *
 *   npx tsx scripts/diag_batter_appearance_slots_hits_by_game_date.ts --yahoo-id 1851204 --year 2026
 *   npx tsx scripts/diag_batter_appearance_slots_hits_by_game_date.ts --yahoo-id 1851204 --year 2026 --season-total
 */
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { extractAppearanceStatSlotsFromCells } from "../lib/yahooGame/appearanceStatsTrailingCells"
import { parseGameDateYmdFromCanonical } from "../lib/yahooGame/gameDateFromCanonical"
import { hitBases, isAtBat } from "../lib/yahooGame/resultJaHitBases"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import type { BattingLine, CanonicalGameDocument } from "../lib/yahooGame/types"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { yahooId: string; year: string; seasonTotal: boolean } {
  const args = process.argv.slice(2)
  let yahooId = ""
  let year = "2026"
  let seasonTotal = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--yahoo-id" && args[i + 1]) {
      yahooId = args[i + 1]!
      i++
    } else if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    } else if (args[i] === "--season-total") {
      seasonTotal = true
    }
  }
  if (!yahooId.trim()) {
    console.error(
      "Usage: tsx scripts/diag_batter_appearance_slots_hits_by_game_date.ts --yahoo-id <id> [--year 2026] [--season-total]",
    )
    process.exit(1)
  }
  return { yahooId: yahooId.trim(), year, seasonTotal }
}

/** 非空スロットごとに、打数に数える打席かつ安打以上なら 1 安打として数える */
function hitsFromAppearanceSlots(slots: readonly string[] | undefined): number {
  if (!slots?.length) return 0
  let h = 0
  for (const raw of slots) {
    const t = String(raw ?? "").trim()
    if (!t) continue
    if (!isAtBat(t)) continue
    if (hitBases(t) > 0) h += 1
  }
  return h
}

/**
 * ディスク上の canonical では `BattingLine.appearancePaSlotsJa` が省略されることがある。
 * そのときは `game.statsPlayerLinkedRows[].cells` から末尾列を取り、canonical 生成時と同じ切り出しにする。
 */
function appearanceSlotsForBatter(doc: CanonicalGameDocument, yahooId: string): string[] {
  const lines = (doc.domain?.battingLines ?? []).filter(
    (l) => String(l.yahooPlayerId ?? "").trim() === yahooId,
  )
  const fromLines = slotsFromBattingLines(lines)
  if (fromLines.length > 0) return fromLines

  const rows = doc.game?.statsPlayerLinkedRows ?? []
  for (const row of rows) {
    if (String(row.yahooPlayerId ?? "").trim() !== yahooId) continue
    return extractAppearanceStatSlotsFromCells(row.cells ?? [])
  }
  return []
}

function slotsFromBattingLines(lines: readonly BattingLine[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    const s = line.appearancePaSlotsJa
    if (Array.isArray(s) && s.some((c) => String(c ?? "").trim() !== "")) {
      for (const x of s) out.push(String(x ?? "").trim())
    }
  }
  return out
}

function main(): void {
  const { yahooId, year, seasonTotal } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  const byYmd = new Map<string, { h: number; slots: number }>()

  let seasonHits = 0
  let seasonNonemptySlots = 0
  let gamesWithAppearanceData = 0

  for (const doc of docs) {
    const ymd = parseGameDateYmdFromCanonical(doc)
    if (!ymd || !ymd.startsWith(year)) continue

    const slots = appearanceSlotsForBatter(doc, yahooId)
    let daySlots = 0
    for (const s of slots) {
      if (String(s ?? "").trim() !== "") daySlots += 1
    }
    const dayHits = hitsFromAppearanceSlots(slots)

    if (seasonTotal) {
      if (daySlots > 0 || dayHits > 0) {
        gamesWithAppearanceData += 1
        seasonHits += dayHits
        seasonNonemptySlots += daySlots
      }
      continue
    }

    if (daySlots === 0 && dayHits === 0) continue

    const prev = byYmd.get(ymd)
    if (prev) {
      byYmd.set(ymd, { h: prev.h + dayHits, slots: prev.slots + daySlots })
    } else {
      byYmd.set(ymd, { h: dayHits, slots: daySlots })
    }
  }

  if (seasonTotal) {
    console.log(
      `yahoo_id\tyear\th_appearance_slots\tnonempty_slots\tgames_with_slots_or_hits\t(出場末尾列のみ / canonical)`,
    )
    console.log(
      `${yahooId}\t${year}\t${seasonHits}\t${seasonNonemptySlots}\t${gamesWithAppearanceData}`,
    )
    return
  }

  const keys = [...byYmd.keys()].sort()
  console.log(
    `date\th_appearance_slots\tnonempty_slots\t(${yahooId}, ${year}, appearance slots from canonical row / stats cells)`,
  )
  for (const k of keys) {
    const v = byYmd.get(k)!
    console.log(`${k}\t${v.h}\t${v.slots}`)
  }
}

main()
