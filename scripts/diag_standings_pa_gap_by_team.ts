/** 行 vs force-PA の H 差分を球団別に集計 npx tsx scripts/diag_standings_pa_gap_by_team.ts [球団略称] */
import {
  aggregateBattingForBatterInGameHybrid,
  hasTrustworthyPlateAppearancesForBatterInGame,
  shouldAggregateBattingFromPaOnlyForBatterInGame,
} from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"

const root = process.cwd()
const teamFilter = process.argv[2]?.trim()

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
const byTeam = new Map<
  string,
  {
    rawLineH: number
    linesH: number
    standH: number
    hGap2Plus: number
    hGap2PlusDelta: number
    shouldAggDelta: number
  }
>()

for (const doc of docs) {
  const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
  if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue

  const bidsByTeam = new Map<string, Set<string>>()
  for (const ln of doc.domain?.battingLines ?? []) {
    const bid = String(ln.yahooPlayerId ?? "").trim()
    if (!bid) continue
    const ts = batterTeamShortInGame(doc, bid)
    if (!ts) continue
    if (teamFilter && ts !== teamFilter) continue
    if (!bidsByTeam.has(ts)) bidsByTeam.set(ts, new Set())
    bidsByTeam.get(ts)!.add(bid)
    const row = byTeam.get(ts) ?? {
      rawLineH: 0,
      linesH: 0,
      standH: 0,
      hGap2Plus: 0,
      hGap2PlusDelta: 0,
      shouldAggDelta: 0,
    }
    row.rawLineH += ln.h ?? 0
    byTeam.set(ts, row)
  }

  for (const [ts, bids] of bidsByTeam) {
    const row = byTeam.get(ts)!
    for (const bid of bids) {
      const fromLines = aggregateBattingForBatterInGameHybrid(doc, bid, {
        projectRoot: root,
        skipRisp: true,
        preferBattingLines: true,
      })
      if (!fromLines) continue
      row.linesH += fromLines.h

      let useH = fromLines.h
      if (shouldAggregateBattingFromPaOnlyForBatterInGame(doc, bid)) {
        const fromPa = aggregateBattingForBatterInGameHybrid(doc, bid, {
          projectRoot: root,
          skipRisp: true,
          preferBattingLines: false,
        })
        if (fromPa && (fromLines.h !== fromPa.h || fromLines.ab !== fromPa.ab)) {
          row.shouldAggDelta += fromPa.h - fromLines.h
          useH = fromPa.h
        }
      }

      if (hasTrustworthyPlateAppearancesForBatterInGame(doc, bid)) {
        const fromPaForce = aggregateBattingForBatterInGameHybrid(doc, bid, {
          projectRoot: root,
          skipRisp: true,
          forcePaAggregation: true,
        })
        if (fromPaForce) {
          const hGap = fromLines.h - fromPaForce.h
          if (hGap >= 2) {
            row.hGap2Plus += 1
            row.hGap2PlusDelta += fromPaForce.h - fromLines.h
            console.log(
              `  hGap2+ ${ts} ${doc.gameId} ${bid} lineH=${fromLines.h} paH=${fromPaForce.h} line2B=${fromLines.h2} pa2B=${fromPaForce.h2}`,
            )
          }
        }
      }

      row.standH += useH
      byTeam.set(ts, row)
    }
  }
}

for (const [ts, row] of [...byTeam.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(
    `${ts}: rawLineH=${row.rawLineH} linesH=${row.linesH} standH=${row.standH} shouldAggΔ=${row.shouldAggDelta} hGap2+=${row.hGap2Plus} hGap2+Δ=${row.hGap2PlusDelta}`,
  )
}
