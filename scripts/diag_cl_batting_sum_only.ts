/** npx tsx scripts/diag_cl_batting_sum_only.ts */
import { aggregateTeamStandingsByLeagueFromCanonical } from "@/lib/standings/aggregateTeamStandingsFromCanonical"
import { teamShortFromCode } from "@/lib/standings/teamCodes"
import {
  aggregateBattingForBatterInGameHybrid,
  emptyBattingSeasonAggYahoo,
  mergeBattingSeasonAggYahoo,
} from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"

const root = process.cwd()
const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
const opts = (d: CanonicalGameDocument) => ({
  sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, d.gameId),
})

const OFFICIAL: Record<string, { h: number; d2: number; ab: number }> = {
  巨人: { h: 472, d2: 79, ab: 2066 },
  阪神: { h: 494, d2: 85, ab: 1992 },
  ヤクルト: { h: 493, d2: 84, ab: 2095 },
  DeNA: { h: 510, d2: 93, ab: 2092 },
  広島: { h: 426, d2: 67, ab: 1987 },
  中日: { h: 480, d2: 72, ab: 2067 },
}

for (const team of Object.keys(OFFICIAL)) {
  const lines = emptyBattingSeasonAggYahoo()
  const hybrid = emptyBattingSeasonAggYahoo()
  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts(doc))) continue
    const bids = new Set<string>()
    for (const ln of doc.domain?.battingLines ?? []) {
      const bid = String(ln.yahooPlayerId ?? "").trim()
      if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
      bids.add(bid)
      lines.h += ln.h ?? 0
      lines.ab += ln.ab ?? 0
      lines.h2 += ln.h2 ?? (ln as { doubles?: number }).doubles ?? 0
    }
    for (const bid of bids) {
      const g = aggregateBattingForBatterInGameHybrid(doc, bid, { projectRoot: root, skipRisp: true })
      if (g) mergeBattingSeasonAggYahoo(hybrid, g)
    }
  }
  const o = OFFICIAL[team]!
  console.log(
    `${team}: lines H=${lines.h}(${lines.h - o.h >= 0 ? "+" : ""}${lines.h - o.h}) h2=${lines.h2}(${lines.h2 - o.d2 >= 0 ? "+" : ""}${lines.h2 - o.d2}) ab=${lines.ab}(${lines.ab - o.ab >= 0 ? "+" : ""}${lines.ab - o.ab}) | hybrid H=${hybrid.h} h2=${hybrid.h2} ab=${hybrid.ab}`,
  )
}

const standings = aggregateTeamStandingsByLeagueFromCanonical(docs, "2026", { projectRoot: root })
for (const row of standings.CL) {
  const t = teamShortFromCode(row.team)
  console.log(`JSON ${t}: H=${row.h} 2B=${row.doubles}`)
}
