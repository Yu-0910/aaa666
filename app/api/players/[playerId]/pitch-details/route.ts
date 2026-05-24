/**
 * Phase 4: 投球詳細パイロット API（`{ hasData, year, payload }`）
 */

import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { getYahooIdForPilotAsync } from "@/lib/seasonStatsPilot"
import {
  loadPhase14PitchBundleAsync,
  loadPitchDetails,
  loadPitchTypeStatsAsync,
  loadZoneStatsAsync,
} from "@/lib/pitchDetailsPilot"
import type { PlateAppearancePitches, PitchTypeStats, ZoneStats } from "@/lib/pitchDetailsPilot"

export const dynamic = "force-dynamic"

export type PitchDetailsApiPayload = {
  plateAppearances: PlateAppearancePitches[]
  pitchTypeStats: PitchTypeStats[]
  zoneStats: ZoneStats[]
  isPilot: boolean
}

export type PitchDetailsApiResponse = {
  hasData: boolean
  year: string
  payload: PitchDetailsApiPayload | null
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
    const decoded = decodePlayerPathSegment((playerId || "").trim())
    const year = yearFromRequest(request)
    const yahooId = await getYahooIdForPilotAsync(decoded)
    if (!yahooId) {
      return jsonDerivedResponse({
        hasData: false,
        year,
        payload: null,
        code: "NO_YAHOO_ID",
      } satisfies PitchDetailsApiResponse)
    }
    const [pitchTypeStats, zoneStats, fromCanonical] = await Promise.all([
      loadPitchTypeStatsAsync(yahooId, year),
      loadZoneStatsAsync(yahooId, year),
      loadPhase14PitchBundleAsync(yahooId, year),
    ])
    const plateAppearances = loadPitchDetails(yahooId)
    const isPilot =
      plateAppearances.length > 0 ||
      fromCanonical != null ||
      pitchTypeStats.length > 0 ||
      zoneStats.length > 0
    const payload: PitchDetailsApiPayload = {
      plateAppearances,
      pitchTypeStats,
      zoneStats,
      isPilot,
    }
    return jsonDerivedResponse({
      hasData: isPilot,
      year,
      payload: isPilot ? payload : null,
    } satisfies PitchDetailsApiResponse)
  } catch (error) {
    console.error("[pitch-details] Error:", error)
    return jsonDerivedResponse(
      {
        hasData: false,
        year: yearFromRequest(request),
        payload: null,
        code: "SERVER_ERROR",
        message: "Failed to load pitch details",
      } satisfies PitchDetailsApiResponse,
      { status: 500 }
    )
  }
}
