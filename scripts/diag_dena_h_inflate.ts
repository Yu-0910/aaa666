/** DeNA 安打過多の試合特定 npx tsx scripts/diag_dena_h_inflate.ts */
import {
  aggregateBattingForBatterInGameHybrid,
  shouldAggregateBattingFromPaOnlyForBatterInGame,
} from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"

const root = process.cwd()
const team = "DeNA"
const docs = loadCanonicalGamesMergedForDerivedPipeline(root)

for (const doc of docs) {
  const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
  if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue

  let lineH = 0
  const dups: string[] = []
  const counts = new Map<string, number>()
  const paOnly: string[] = []

  for (const ln of doc.domain?.battingLines ?? []) {
    const bid = String(ln.yahooPlayerId ?? "").trim()
    if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
    lineH += ln.h ?? 0
    counts.set(bid, (counts.get(bid) ?? 0) + 1)
    if (shouldAggregateBattingFromPaOnlyForBatterInGame(doc, bid)) paOnly.push(bid)
  }
  for (const [bid, c] of counts) if (c > 1) dups.push(`${bid}x${c}`)

  let hybridH = 0
  for (const bid of counts.keys()) {
    const g = aggregateBattingForBatterInGameHybrid(doc, bid, { projectRoot: root, skipRisp: true })
    if (g) hybridH += g.h
  }

  if (dups.length > 0 || lineH !== hybridH || paOnly.length > 8) {
    console.log(
      `${doc.gameId} lineH=${lineH} hybridH=${hybridH} Δ=${hybridH - lineH} dups=[${dups.join(",")}] paOnly=${paOnly.length}`,
    )
  }
}
