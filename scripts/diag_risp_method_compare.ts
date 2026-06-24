/**
 * 得点圏集計: resultBallClass vs 打席開始塁 の比較
 *   npx tsx scripts/diag_risp_method_compare.ts
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
} from "@/lib/yahooGame/paSituationSim"
import { hitBases, isAtBat } from "@/lib/yahooGame/resultJaHitBases"
import { plateAppearanceResolvedResultText } from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"

const root = process.cwd()
const OFFICIAL: Record<string, { risp: number; ab: number; h: number }> = {
  巨人: { risp: 0.24, ab: 462, h: 111 },
  阪神: { risp: 0.275, ab: 477, h: 131 },
  ヤクルト: { risp: 0.253, ab: 490, h: 124 },
  DeNA: { risp: 0.287, ab: 460, h: 132 },
  広島: { risp: 0.228, ab: 435, h: 99 },
  中日: { risp: 0.246, ab: 456, h: 112 },
}

type Method = "result_ball" | "pa_start_hybrid" | "sim"

function rispForPa(
  method: Method,
  pa: Parameters<typeof basesBeforeForPlateAppearanceHybrid>[0],
  paStartSim: ReturnType<typeof classifySituationAtPaStart> extends infer _ ? import("@/lib/yahooGame/paSituationSim").Bases : never,
  scoreCtx: ReturnType<typeof buildScoreBasesContextByPaId> extends Map<string, infer V> ? V : never,
  playLine?: string,
): boolean {
  if (method === "result_ball") {
    const atResult = scoreCtx?.resultBallClass ?? null
    if (atResult) return classifySituationAtPaStart(atResult).risp
  }
  if (method === "pa_start_hybrid") {
    const b = basesBeforeForPlateAppearanceHybrid(pa, playLine, scoreCtx)
    if (b) return classifySituationAtPaStart(b).risp
  }
  return classifySituationAtPaStart(paStartSim).risp
}

function teamRisp(
  docs: CanonicalGameDocument[],
  team: string,
  method: Method,
): { ab: number; h: number } {
  let ab = 0
  let h = 0
  for (const doc of docs) {
    const gameId = String(doc.gameId ?? "").trim()
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, gameId) }
    if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue

    const pas = dedupePlateAppearancesByInningHalfOrder(doc.domain?.plateAppearances ?? [], gameId)
    if (!pas.length) continue
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
      const risp = rispForPa(method, pa, state.b, ctx, playMap.get(pa.paId))
      if (risp && isAtBat(result)) {
        ab += 1
        if (hitBases(result) > 0) h += 1
      }
      state = applyPlayResult(state, result)
    }
  }
  return { ab, h }
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
console.log("=== 得点圏集計方式比較 ===\n")
for (const team of Object.keys(OFFICIAL)) {
  const o = OFFICIAL[team]!
  const rb = teamRisp(docs, team, "result_ball")
  const ps = teamRisp(docs, team, "pa_start_hybrid")
  const sm = teamRisp(docs, team, "sim")
  const fmt = (x: { ab: number; h: number }) =>
    `${(x.h / x.ab).toFixed(3)} (${x.h}/${x.ab}) Δab=${x.ab - o.ab} Δh=${x.h - o.h}`
  console.log(`【${team}】公式 ${o.risp.toFixed(3)} (${o.h}/${o.ab})`)
  console.log(`  result_ball:     ${fmt(rb)}`)
  console.log(`  pa_start_hybrid: ${fmt(ps)}`)
  console.log(`  sim:             ${fmt(sm)}`)
  console.log()
}
