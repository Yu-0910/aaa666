/**
 * パイロット今季成績 API（`{ hasData, year, payload }` 形式）
 * Yahoo pilot 連携選手は実データ。名簿の野手で未連携のときは通算行プレースホルダー（UI 用）。
 *
 * 野手通算は Phase 11（一球由来）を正とし、無いときは canonical の出場成績行でフォールバックする。
 * `battingTotalRowSource` で UI が区別できる（`mergePilotSeasonStatsWithDerived`）。
 */

import { derivedJsonExistsAsync } from '@/lib/derived/fetchDerivedJsonServer'
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { isFielderRegistrationPosition } from "@/lib/rosterPitcher"
import type { BattingTotalRowSource } from "@/lib/seasonStatsPilot"
import type { BattingVsHandTotalReconciliation } from "@/lib/seasonStatsPilotShared"
import {
  createPlaceholderTotalSeasonRow,
  DERIVED_SEASON_YEAR_DEFAULT,
  loadVsHandRowsFromCanonicalWithDebug,
  loadPilotBlocksData,
  loadPilotRispStats,
  mergePilotSeasonStatsWithDerivedAsync,
} from "@/lib/seasonStatsPilot"
import type { PilotBlocksData, SeasonStatsRow } from "@/lib/seasonStatsPilotShared"
import { loadPitchTypeStatsAsync, loadSpeedBandStatsAsync } from "@/lib/pitchDetailsPilot"
import type { PitchTypeStats, SpeedBandStatsMap } from "@/lib/pitchDetailsPilot"
import { resolveYahooPilotIdForStats } from "@/lib/yahooNpbBatterIdMap"

export const dynamic = "force-dynamic"

export type SeasonStatsApiPayload = {
  stats: SeasonStatsRow[]
  isPilot: boolean
  blocks: PilotBlocksData | null
  pitchTypeStats: PitchTypeStats[]
  speedBandStats: SpeedBandStatsMap
  /** 通算行の由来。出場成績フォールバック時は一球未連携でも表を埋められる */
  battingTotalRowSource: BattingTotalRowSource
  /** 通算行と対左右行の pa/ab/h 突合。一致しない場合もあり得る */
  battingVsHandReconciliation: BattingVsHandTotalReconciliation | null
}

export type SeasonStatsApiResponse = {
  hasData: boolean
  year: string
  payload: SeasonStatsApiPayload | null
  debug?: {
    yahooBatterId: string | null
    unknownPitchers: Array<{ yahooPitcherId: string; pa: number }>
    missingPitcherIdPas: number
    missingPitcherIdSamples: Array<{ gameId: string; paId: string; pitchEvents: number }>
    inferredPitcherIdPas: number
    inferredPitcherIdFromTextPas: number
    backfilledResultSamples: Array<{
      gameId: string
      paId: string
      vsHand: "R" | "L" | "unknown"
      rawLine: string
      inferredResult: string
    }>
    unparsedAtBatSamples: Array<{
      gameId: string
      paId: string
      vsHand: "R" | "L" | "unknown"
      resultText: string
    }>
    perGameMismatchSamples: Array<{
      gameId: string
      batterLine: { ab: number; h: number; hr: number; bb: number; hbp: number; so: number } | null
      parsed: { ab: number; h: number; hr: number; bb: number; hbp: number; so: number }
      suspectPa: Array<{ paId: string; vsHand: "R" | "L" | "unknown"; resultText: string }>
    }>
  }
  code?: string
  message?: string
}

function fielderPlaceholderPayload(): SeasonStatsApiPayload {
  return {
    stats: [createPlaceholderTotalSeasonRow()],
    isPilot: true,
    blocks: null,
    pitchTypeStats: [],
    speedBandStats: {},
    battingTotalRowSource: null,
    battingVsHandReconciliation: null,
  }
}

async function derivedSeasonBattingExists(yahooBatterId: string, year: string): Promise<boolean> {
  const id = (yahooBatterId || "").trim()
  if (!/^\d+$/.test(id)) return false
  const y = (year || "").trim() || DERIVED_SEASON_YEAR_DEFAULT
  const categories = [
    "player_season_batting",
    "player_season_batting_context",
    "player_season_batting_splits",
    "player_season_batting_count",
    "player_season_batting_period",
  ] as const
  for (const category of categories) {
    if (await derivedJsonExistsAsync(category, y, `yahoo_${id}.json`)) return true
  }
  return false
}

export async function GET(
  request: Request,
  context: { params: Promise<{ playerId: string }> | { playerId: string } }
) {
  try {
    const { playerId } =
      context.params instanceof Promise ? await context.params : context.params
    const decoded = decodePlayerPathSegment((playerId || "").trim())
    const year = yearFromRequest(request)
    const url = new URL(request.url)
    const debugParam = url.searchParams.get("debug")
    const debug =
      debugParam === "1" ||
      debugParam === "true" ||
      debugParam === "yes" ||
      debugParam === "on" ||
      // `?debug` のように値無しで付与された場合
      (debugParam !== null && debugParam === "")
    // 全選手対応: URL セグメント（Yahoo/NPB 数値・日本語名など）から Yahoo 打者 ID を解決する。
    // - 数値: bridge で NPB→Yahoo 変換 or Yahoo のまま
    // - 非数値: 名簿で NPB を解決→bridge で Yahoo
    let yahooId: string | null = resolveYahooPilotIdForStats(decoded)
    // bridge に載っていない Yahoo ID でも、派生 JSON が存在するなら Yahoo とみなして読む
    if (!yahooId && /^\d+$/.test(decoded) && (await derivedSeasonBattingExists(decoded, year))) {
      yahooId = decoded
    }
    if (!yahooId) {
      const rosterPlayer = findRosterPlayerByPublicId(decoded)
      if (rosterPlayer?.npb_player_id) {
        yahooId = resolveYahooPilotIdForStats(rosterPlayer.npb_player_id)
      }
    }
    if (!yahooId) {
      const rosterPlayer = findRosterPlayerByPublicId(decoded)
      if (
        rosterPlayer &&
        isFielderRegistrationPosition(rosterPlayer.position, {
          rosterNpbPlayerId: rosterPlayer.npb_player_id,
        })
      ) {
        return jsonDerivedResponse({
          hasData: true,
          year,
          payload: fielderPlaceholderPayload(),
        } satisfies SeasonStatsApiResponse)
      }
      return jsonDerivedResponse({
        hasData: false,
        year,
        payload: null,
      } satisfies SeasonStatsApiResponse)
    }
    const { rows: mergedStats, battingTotalRowSource, battingVsHandReconciliation } =
      await mergePilotSeasonStatsWithDerivedAsync(yahooId, year)
    let stats = mergedStats
    const blocks = loadPilotBlocksData(yahooId)
    if (blocks?.meta?.date && blocks.blocks?.F) {
      const byRispStats = loadPilotRispStats(yahooId, blocks.meta.date)
      if (byRispStats) {
        blocks.blocks.F.by_risp_stats = byRispStats
      }
    }
    const [pitchTypeStats, speedBandStats] = await Promise.all([
      loadPitchTypeStatsAsync(yahooId, year),
      loadSpeedBandStatsAsync(yahooId, year),
    ])

    if (stats.length === 0) {
      const rosterPlayer = findRosterPlayerByPublicId(decoded)
      if (
        rosterPlayer &&
        isFielderRegistrationPosition(rosterPlayer.position, {
          rosterNpbPlayerId: rosterPlayer.npb_player_id,
        })
      ) {
        stats = [createPlaceholderTotalSeasonRow()]
      }
    }

    const payload: SeasonStatsApiPayload = {
      stats,
      // SeasonStatsPilot は “今季成績UI” として使うため、派生が返る限り true にして描画させる
      isPilot: true,
      blocks,
      pitchTypeStats,
      speedBandStats,
      battingTotalRowSource,
      battingVsHandReconciliation,
    }
    const debugPayload = debug
      ? (() => {
          const dumpGameId = (url.searchParams.get("dumpGameId") ?? "").trim()
          const d = loadVsHandRowsFromCanonicalWithDebug(yahooId, dumpGameId ? { collectPaDumpForGameId: dumpGameId } : undefined)
          const unknownPitchers = Object.entries(d.unknownPitchers)
            .map(([yahooPitcherId, pa]) => ({ yahooPitcherId, pa }))
            .sort((a, b) => b.pa - a.pa)
          return {
            yahooBatterId: yahooId,
            unknownPitchers,
            missingPitcherIdPas: d.missingPitcherIdPas,
            missingPitcherIdSamples: d.missingPitcherIdSamples,
            inferredPitcherIdPas: d.inferredPitcherIdPas,
            inferredPitcherIdFromTextPas: d.inferredPitcherIdFromTextPas,
            backfilledResultSamples: d.backfilledResultSamples,
            unparsedAtBatSamples: d.unparsedAtBatSamples,
            perGameMismatchSamples: d.perGameMismatchSamples,
            paDump: d.paDump,
          }
        })()
      : undefined

    return jsonDerivedResponse({
      hasData: true,
      year,
      payload,
      debug: debugPayload,
    } satisfies SeasonStatsApiResponse)
  } catch (error) {
    console.error("[season-stats] Error:", error)
    try {
      const { playerId } =
        context.params instanceof Promise ? await context.params : context.params
      const decoded = decodePlayerPathSegment((playerId || "").trim())
      const rosterPlayer = findRosterPlayerByPublicId(decoded)
      if (
        rosterPlayer &&
        isFielderRegistrationPosition(rosterPlayer.position, {
          rosterNpbPlayerId: rosterPlayer.npb_player_id,
        })
      ) {
        return jsonDerivedResponse({
          hasData: true,
          year: yearFromRequest(request),
          payload: fielderPlaceholderPayload(),
        } satisfies SeasonStatsApiResponse)
      }
    } catch {
      // ignore
    }
    return jsonDerivedResponse(
      {
        hasData: false,
        year: DERIVED_SEASON_YEAR_DEFAULT,
        payload: null,
        code: "SERVER_ERROR",
        message: "Failed to load season stats",
      } satisfies SeasonStatsApiResponse,
      { status: 500 }
    )
  }
}
