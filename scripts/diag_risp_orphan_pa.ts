/**
 * 得点圏: battingLines 無し打者の PA がチーム得点圏に含まれているか
 *   npx tsx scripts/diag_risp_orphan_pa.ts 巨人
 */
import { dedupePlateAppearancesByInningHalfOrder } from "@/lib/yahooGame/dedupePlateAppearances"
import {
  emptyBattingSeasonAggYahoo,
  updateRispFromPasInGame,
} from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const root = process.cwd()
const team = process.argv[2] ?? "巨人"

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
let allAb = 0
let allH = 0
let lineAb = 0
let lineH = 0
let orphanAb = 0

for (const doc of docs) {
  const gameId = String(doc.gameId ?? "").trim()
  const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, gameId) }
  if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue

  const lineBids = new Set<string>()
  for (const ln of doc.domain?.battingLines ?? []) {
    const bid = String(ln.yahooPlayerId ?? "").trim()
    if (bid) lineBids.add(bid)
  }

  const pas = dedupePlateAppearancesByInningHalfOrder(doc.domain?.plateAppearances ?? [], gameId)
  const m = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()
  updateRispFromPasInGame(m, gameId, doc, pas, root)
  for (const [bid, agg] of m) {
    if (batterTeamShortInGame(doc, bid) !== team) continue
    allAb += agg.risp_ab
    allH += agg.risp_h
    if (lineBids.has(bid)) {
      lineAb += agg.risp_ab
      lineH += agg.risp_h
    } else {
      orphanAb += agg.risp_ab
    }
  }
}

console.log(`【${team}】`)
console.log(`  全PA:     ${allH}/${allAb} = ${allAb ? (allH / allAb).toFixed(3) : "—"}`)
console.log(`  lines有:  ${lineH}/${lineAb} = ${lineAb ? (lineH / lineAb).toFixed(3) : "—"}`)
console.log(`  orphan AB: ${orphanAb}`)
