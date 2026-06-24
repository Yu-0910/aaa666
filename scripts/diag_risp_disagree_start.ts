/**
 * 得点圏: result vs start 不一致時は打席開始塁を採用
 *   npx tsx scripts/diag_risp_disagree_start.ts
 */
import { dedupePlateAppearancesByInningHalfOrder } from "@/lib/yahooGame/dedupePlateAppearances"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { loadSportsnaviScoreSnapshots } from "@/lib/yahooGame/sportsnaviScoreSnapshotIO"
import { buildScoreBasesContextByPaId } from "@/lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { basesBeforeForPlateAppearanceHybrid } from "@/lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "@/lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import {
  applyPlayResult,
  classifySituationAtPaStart,
  emptyGameState,
  type Bases,
} from "@/lib/yahooGame/paSituationSim"
import { hitBases, isAtBat } from "@/lib/yahooGame/resultJaHitBases"
import { plateAppearanceResolvedResultText } from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import type { PlateAppearance } from "@/lib/yahooGame/types"
import type { ScoreBasesContext } from "@/lib/yahooGame/basesFromSportsnaviScoreSnapshot"

const root = process.cwd()
const TEAMS = ["巨人", "阪神", "DeNA", "中日"] as const
const OFFICIAL: Record<string, { h: number; ab: number }> = {
  巨人: { h: 111, ab: 462 },
  阪神: { h: 131, ab: 477 },
  DeNA: { h: 132, ab: 460 },
  中日: { h: 112, ab: 456 },
}

function rispCurrent(
  pa: PlateAppearance,
  paStart: Bases,
  ctx: ScoreBasesContext | undefined,
  playLine?: string,
): boolean {
  const atResult = ctx?.resultBallClass ?? null
  if (atResult) return classifySituationAtPaStart(atResult).risp
  const hybrid = basesBeforeForPlateAppearanceHybrid(pa, playLine, ctx)
  if (hybrid) return classifySituationAtPaStart(hybrid).risp
  return classifySituationAtPaStart(paStart).risp
}

function rispDisagreePreferStart(
  pa: PlateAppearance,
  paStart: Bases,
  ctx: ScoreBasesContext | undefined,
  playLine?: string,
): boolean {
  const atResult = ctx?.resultBallClass ?? null
  const hybrid = basesBeforeForPlateAppearanceHybrid(pa, playLine, ctx)
  const rResult = atResult ? classifySituationAtPaStart(atResult).risp : null
  const rStart = hybrid ? classifySituationAtPaStart(hybrid).risp : null
  if (rResult !== null && rStart !== null) {
    if (rResult !== rStart) return rStart
    return rResult
  }
  if (rStart !== null) return rStart
  if (rResult !== null) return rResult
  return classifySituationAtPaStart(paStart).risp
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)

for (const team of TEAMS) {
  const o = OFFICIAL[team]!
  const cur = { ab: 0, h: 0 }
  const neu = { ab: 0, h: 0 }
  for (const doc of docs) {
    const gameId = String(doc.gameId ?? "").trim()
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, gameId) }
    if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue
    const pas = dedupePlateAppearancesByInningHalfOrder(doc.domain?.plateAppearances ?? [], gameId)
    const scoreCtx = buildScoreBasesContextByPaId(
      pas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, gameId),
    )
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    let curHalf = ""
    let state = emptyGameState()
    for (const pa of pas) {
      const half = String(pa.inningHalf ?? "").trim()
      if (half && half !== curHalf) {
        curHalf = half
        state = emptyGameState()
      }
      const bid = String(pa.yahooBatterId ?? "").trim()
      if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
      const result = plateAppearanceResolvedResultText(doc, pa)
      const ctx = scoreCtx.get(pa.paId)
      const pl = playMap.get(pa.paId)
      if (!isAtBat(result)) {
        state = applyPlayResult(state, result)
        continue
      }
      if (rispCurrent(pa, state.b, ctx, pl)) {
        cur.ab++
        if (hitBases(result) > 0) cur.h++
      }
      if (rispDisagreePreferStart(pa, state.b, ctx, pl)) {
        neu.ab++
        if (hitBases(result) > 0) neu.h++
      }
      state = applyPlayResult(state, result)
    }
  }
  console.log(
    `【${team}】公式 ${o.h}/${o.ab}=${(o.h / o.ab).toFixed(3)} | 現 ${cur.h}/${cur.ab}=${(cur.h / cur.ab).toFixed(3)} | 新 ${neu.h}/${neu.ab}=${(neu.h / neu.ab).toFixed(3)}`,
  )
}
