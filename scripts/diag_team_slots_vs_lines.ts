/**
 * チーム単位: appearance_slots vs battingLines 合算比較
 *   npx tsx scripts/diag_team_slots_vs_lines.ts DeNA
 */
import {
  emptyBattingSeasonAggYahoo,
  mergeBattingSeasonAggYahoo,
  updateBattingAggFromAppearanceSlotsInGame,
} from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const root = process.cwd()
const team = process.argv[2] ?? "DeNA"

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
const slots = emptyBattingSeasonAggYahoo()
const lines = emptyBattingSeasonAggYahoo()

for (const doc of docs) {
  const gameId = String(doc.gameId ?? "").trim()
  const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, gameId) }
  if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue

  const bids = new Set<string>()
  for (const ln of doc.domain?.battingLines ?? []) {
    const bid = String(ln.yahooPlayerId ?? "").trim()
    if (bid && batterTeamShortInGame(doc, bid) === team) bids.add(bid)
  }

  for (const bid of bids) {
    const line = (doc.domain?.battingLines ?? []).find((l) => String(l.yahooPlayerId ?? "").trim() === bid)
    const g = emptyBattingSeasonAggYahoo()
    updateBattingAggFromAppearanceSlotsInGame(g, gameId, doc, bid, line ?? null)
    mergeBattingSeasonAggYahoo(slots, g)
  }

  for (const ln of doc.domain?.battingLines ?? []) {
    const bid = String(ln.yahooPlayerId ?? "").trim()
    if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
    lines.ab += ln.ab ?? 0
    lines.h += ln.h ?? 0
    lines.h2 += ln.h2 ?? 0
    lines.h3 += ln.h3 ?? 0
    lines.hr += ln.hr ?? 0
  }
}

console.log(`【${team}】`)
console.log(`  battingLines: H=${lines.h} AB=${lines.ab} 2B=${lines.h2} 3B=${lines.h3} HR=${lines.hr}`)
console.log(`  appearance_slots: H=${slots.h} AB=${slots.ab} 2B=${slots.h2} 3B=${slots.h3} HR=${slots.hr}`)
console.log(`  ΔH=${slots.h - lines.h} ΔAB=${slots.ab - lines.ab} Δ2B=${slots.h2 - lines.h2}`)
