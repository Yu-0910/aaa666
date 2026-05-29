/**
 * 1 打者について、試合ごとの「出場成績行の AB 合計」と
 * Phase11 / ランキングと同じ `computeBattingTargetForGameAndBatter`（ハイブリッド）の AB を比較する。
 *
 *   npx tsx scripts/diag_hybrid_vs_line_ab_one_batter.ts 1800050
 */

import { dirname, join } from "path"
import { fileURLToPath } from "url"
import {
  computeBattingTargetForGameAndBatter,
  shouldAggregateBattingFromPaOnlyForBatterInGame,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function gameDateFromTitle(doc: CanonicalGameDocument): string | null {
  const t = String(doc.game?.meta?.documentTitle ?? "")
  const m = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return null
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
}

function lineAbSumInGame(doc: CanonicalGameDocument, bid: string): number {
  let s = 0
  for (const line of doc.domain?.battingLines ?? []) {
    if (String(line.yahooPlayerId ?? "").trim() !== bid) continue
    s += line.ab ?? 0
  }
  return s
}

function main(): void {
  const bid = (process.argv[2] ?? "").trim()
  if (!/^\d+$/.test(bid)) {
    console.error("usage: tsx scripts/diag_hybrid_vs_line_ab_one_batter.ts <yahooBatterId>")
    process.exit(1)
  }
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  const rows: Array<{
    gameId: string
    date: string | null
    lineAb: number
    hybridAb: number | null
    paPrimary: boolean
  }> = []

  for (const doc of docs) {
    const lineAb = lineAbSumInGame(doc, bid)
    if (lineAb <= 0 && !(doc.domain?.battingLines ?? []).some((l) => String(l.yahooPlayerId ?? "").trim() === bid)) {
      continue
    }
    const t = computeBattingTargetForGameAndBatter(doc, bid)
    const paPrimary = shouldAggregateBattingFromPaOnlyForBatterInGame(doc, bid)
    const hybridAb = t?.ab ?? null
    rows.push({
      gameId: doc.gameId,
      date: gameDateFromTitle(doc),
      lineAb,
      hybridAb,
      paPrimary,
    })
  }

  const mismatches = rows.filter((r) => r.hybridAb != null && r.lineAb !== r.hybridAb)
  console.log(
    JSON.stringify(
      {
        yahooBatterId: bid,
        gamesWithBattingLine: rows.length,
        lineAbSeasonTotal: rows.reduce((a, r) => a + r.lineAb, 0),
        hybridAbSeasonTotal: rows.reduce((a, r) => a + (r.hybridAb ?? 0), 0),
        mismatchedGames: mismatches.length,
        mismatches: mismatches.map((m) => ({
          gameId: m.gameId,
          date: m.date,
          lineAb: m.lineAb,
          hybridAb: m.hybridAb,
          paPrimary: m.paPrimary,
        })),
      },
      null,
      2,
    ),
  )
}

main()
