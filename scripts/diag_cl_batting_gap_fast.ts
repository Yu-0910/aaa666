/** 高速: CL打撃ギャップの試合単位特定 npx tsx scripts/diag_cl_batting_gap_fast.ts */
import { aggregateTeamStandingsByLeagueFromCanonical } from "@/lib/standings/aggregateTeamStandingsFromCanonical"
import {
  aggregateBattingForBatterInGameHybrid,
  emptyBattingSeasonAggYahoo,
  mergeBattingSeasonAggYahoo,
  updateRispFromPasInGame,
} from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import { dedupePlateAppearancesByInningHalfOrder } from "@/lib/yahooGame/dedupePlateAppearances"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"

const root = process.cwd()
const year = "2026"

function opts(doc: CanonicalGameDocument) {
  return { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
}

function gameTeamBatting(doc: CanonicalGameDocument, team: string) {
  const linesH = { h: 0, h2: 0, ab: 0 }
  const bids = new Set<string>()
  for (const line of doc.domain?.battingLines ?? []) {
    const bid = String(line.yahooPlayerId ?? "").trim()
    if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
    bids.add(bid)
    linesH.h += line.h ?? 0
    linesH.h2 += (line as { doubles?: number }).doubles ?? (line as { h2?: number }).h2 ?? 0
    linesH.ab += line.ab ?? 0
  }
  const hybrid = emptyBattingSeasonAggYahoo()
  for (const bid of bids) {
    const g = aggregateBattingForBatterInGameHybrid(doc, bid, { projectRoot: root, skipRisp: true })
    if (g) mergeBattingSeasonAggYahoo(hybrid, g)
  }
  return { linesH, hybridH: hybrid.h, hybridH2: hybrid.h2, hybridAb: hybrid.ab, deltaH: hybrid.h - linesH.h }
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)

for (const team of ["巨人", "DeNA"] as const) {
  console.log(`\n=== ${team}: hybrid vs battingLines 試合別 ===`)
  let sumDelta = 0
  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, year, "CL", opts(doc))) continue
    const g = gameTeamBatting(doc, team)
    if (g.deltaH !== 0 || g.linesH.h !== g.hybridH) {
      console.log(
        `  ${doc.gameId}: lines H=${g.linesH.h} h2=${g.linesH.h2} | hybrid H=${g.hybridH} h2=${g.hybridH2} ΔH=${g.deltaH >= 0 ? "+" : ""}${g.deltaH}`,
      )
      sumDelta += g.deltaH
    }
  }
  console.log(`  合計 ΔH(hybrid-lines)=${sumDelta}`)
}

console.log("\n=== 得点圏: PA分類 vs 公式差 ===")
const rispOfficial: Record<string, { ab: number; h: number; avg: number }> = {
  巨人: { ab: 458, h: 111, avg: 0.242 },
  阪神: { ab: 470, h: 129, avg: 0.274 },
  DeNA: { ab: 451, h: 131, avg: 0.29 },
  広島: { ab: 429, h: 99, avg: 0.231 },
  中日: { ab: 445, h: 107, avg: 0.24 },
}

for (const [team, off] of Object.entries(rispOfficial)) {
  let rispAb = 0
  let rispH = 0
  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, year, "CL", opts(doc))) continue
    const gameId = String(doc.gameId ?? "").trim()
    const pas = dedupePlateAppearancesByInningHalfOrder(doc.domain?.plateAppearances ?? [], gameId)
    const byBatter = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()
    updateRispFromPasInGame(byBatter, gameId, doc, pas, root)
    for (const [bid, r] of byBatter) {
      if (batterTeamShortInGame(doc, bid) !== team) continue
      rispAb += r.risp_ab
      rispH += r.risp_h
    }
  }
  const avg = rispAb > 0 ? rispH / rispAb : 0
  console.log(
    `${team}: AB=${rispAb}(${rispAb - off.ab >= 0 ? "+" : ""}${rispAb - off.ab}) H=${rispH}(${rispH - off.h >= 0 ? "+" : ""}${rispH - off.h}) AVG=${avg.toFixed(3)}(公式${off.avg.toFixed(3)})`,
  )
}

const standings = aggregateTeamStandingsByLeagueFromCanonical(docs, year, { projectRoot: root })
console.log("\n=== 順位表打数(AB) vs 公式 ===")
const offAb: Record<string, number> = { 巨人: 2066, 阪神: 1992, ヤクルト: 2095, DeNA: 2092, 広島: 1987, 中日: 2067 }
for (const row of standings.CL) {
  const team = row.teamName === "横浜" ? "DeNA" : row.teamName
  const bucket = emptyBattingSeasonAggYahoo()
  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, year, "CL", opts(doc))) continue
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = String(line.yahooPlayerId ?? "").trim()
      if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
      bucket.ab += line.ab ?? 0
    }
    for (const bid of new Set(
      (doc.domain?.plateAppearances ?? []).map((p) => String(p.yahooBatterId ?? "").trim()).filter(Boolean),
    )) {
      if (batterTeamShortInGame(doc, bid) !== team) continue
      const g = aggregateBattingForBatterInGameHybrid(doc, bid, { projectRoot: root, skipRisp: true })
      if (g) mergeBattingSeasonAggYahoo(bucket, g)
    }
  }
  // recompute ab from hybrid only
  const hybridAb = (() => {
    const b = emptyBattingSeasonAggYahoo()
    for (const doc of docs) {
      if (!shouldIncludeStandingsGame(doc, year, "CL", opts(doc))) continue
      const bids = new Set<string>()
      for (const line of doc.domain?.battingLines ?? []) {
        const id = String(line.yahooPlayerId ?? "").trim()
        if (id && batterTeamShortInGame(doc, id) === team) bids.add(id)
      }
      for (const pa of doc.domain?.plateAppearances ?? []) {
        const id = String(pa.yahooBatterId ?? "").trim()
        if (id && batterTeamShortInGame(doc, id) === team) bids.add(id)
      }
      for (const bid of bids) {
        const g = aggregateBattingForBatterInGameHybrid(doc, bid, { projectRoot: root, skipRisp: true })
        if (g) mergeBattingSeasonAggYahoo(b, g)
      }
    }
    return b.ab
  })()
  console.log(`${team}: hybrid AB=${hybridAb} lines AB=${bucket.ab} 公式=${offAb[team] ?? "?"}`)
}
