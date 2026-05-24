/**
 * Phase 2 / Phase 4: 投手のシーズン横断コース別投球成績（対右／対左 25 ゾーン）
 * データ元: `npm run phase20:build:pitcher-zones` → `_data/derived/pitcher_zone_from_canonical/{year}/`
 * 応答: `{ hasData, year, payload }`（従来のフラット JSON 互換は unwrap で吸収）
 */

import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { loadPitcherZoneSeasonDerivedAsync } from "@/lib/yahooGame/gamePitcherPilotFiles"
import type { ZoneStat } from "@/lib/yahooGame/gamePitcherPilotFiles"

export const dynamic = "force-dynamic"

export type PitcherZoneStatsApiPayload = {
  schemaVersion: string
  seasonYear: string
  generatedAt?: string
  source: { canonicalGames: string[] }
  yahooPitcherId: string
  game_id: string
  pitcher_id: string
  vsRight: ZoneStat[]
  vsLeft: ZoneStat[]
}

export type PitcherZoneStatsApiResponse = {
  hasData: boolean
  year: string
  payload: PitcherZoneStatsApiPayload | null
  code?: string
  message?: string
}

export async function GET(
  request: Request,
  context: { params: Promise<{ playerId: string }> | { playerId: string } }
) {
  try {
    const { playerId } =
      context.params instanceof Promise ? await context.params : context.params
    const decoded = decodePlayerPathSegment((playerId || "").trim()).replace(/^player-/, "").trim()
    const year = yearFromRequest(request)
    const yahooId = getYahooIdForPilot(decoded)
    if (!yahooId) {
      return jsonDerivedResponse({
        hasData: false,
        year,
        payload: null,
        code: "NO_YAHOO_ID",
        message:
          "Yahoo player id could not be resolved for this public id (roster / pilot bridge).",
      } satisfies PitcherZoneStatsApiResponse)
    }

    const derived = await loadPitcherZoneSeasonDerivedAsync(yahooId, year)
    if (!derived) {
      return jsonDerivedResponse({
        hasData: false,
        year,
        payload: null,
        code: "NO_DERIVED_DATA",
        message:
          "No pitcher zone season file. Run: npm run phase20:build:pitcher-zones (and ensure canonical games exist).",
      } satisfies PitcherZoneStatsApiResponse)
    }

    const { zoneStats, seasonYear, schemaVersion, generatedAt, canonicalGames } = derived

    const payload: PitcherZoneStatsApiPayload = {
      schemaVersion,
      seasonYear,
      generatedAt,
      source: { canonicalGames },
      yahooPitcherId: yahooId,
      game_id: zoneStats.game_id,
      pitcher_id: zoneStats.pitcher_id,
      vsRight: zoneStats.vsRight,
      vsLeft: zoneStats.vsLeft,
    }

    return jsonDerivedResponse({
      hasData: true,
      year,
      payload,
    } satisfies PitcherZoneStatsApiResponse)
  } catch (error) {
    console.error("[pitcher-zone-stats] Error:", error)
    return jsonDerivedResponse(
      {
        hasData: false,
        year: yearFromRequest(request),
        payload: null,
        code: "SERVER_ERROR",
        message: "Failed to load pitcher zone stats",
      } satisfies PitcherZoneStatsApiResponse,
      { status: 500 }
    )
  }
}
