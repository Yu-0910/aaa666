/**
 * 投手シーズン球種別（投球データ表）
 * データ元: phase25 派生 or canonical ライブ集計
 */

import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
  type DerivedPlayerApiEnvelope,
} from "@/lib/api/derivedPlayerApiShared"
import { buildPitcherSeasonPitchTypesLive } from "@/lib/yahooGame/buildPitcherSeasonPitchTypesLive"
import { loadPitcherSeasonPitchTypesAsync } from "@/lib/yahooGame/loadPitcherSeasonPitchTypes"
import type { PitcherSeasonPitchTypesPayload } from "@/lib/yahooGame/pitcherSeasonPitchTypes"
import { resolvePilotPitcherNpbFromUrlSegment } from "@/lib/pitcherSeasonPocPilotFallback"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"

export const dynamic = "force-dynamic"

export type PitcherSeasonPitchTypesApiResponse =
  DerivedPlayerApiEnvelope<PitcherSeasonPitchTypesPayload>

export async function GET(
  request: Request,
  context: { params: Promise<{ playerId: string }> | { playerId: string } },
) {
  try {
    const { playerId } =
      context.params instanceof Promise ? await context.params : context.params
    const decoded = decodePlayerPathSegment((playerId || "").trim())
    const year = yearFromRequest(request)

    const roster = findRosterPlayerByPublicId(decoded)
    let npb = roster?.npb_player_id?.trim() ?? ""
    if (!npb) {
      const pilot = resolvePilotPitcherNpbFromUrlSegment(decoded)
      if (pilot) npb = pilot
    }
    if (!npb && /^\d+$/.test(decoded)) npb = decoded

    if (!npb) {
      return jsonDerivedResponse({
        hasData: false,
        year,
        payload: null,
        code: "NO_NPB_ID",
        message: "Could not resolve npb_player_id for this URL.",
      } satisfies PitcherSeasonPitchTypesApiResponse)
    }

    let payload = await loadPitcherSeasonPitchTypesAsync(year, npb)
    if (!payload) {
      payload = buildPitcherSeasonPitchTypesLive(npb, year)
    }

    if (!payload) {
      return jsonDerivedResponse({
        hasData: false,
        year,
        payload: null,
        code: "NO_PITCH_DATA",
        message:
          "No pitchEvents for this pitcher in canonical games. Run npm run phase25:build:pitcher-season-pitch-types after ingest.",
      } satisfies PitcherSeasonPitchTypesApiResponse)
    }

    return jsonDerivedResponse({
      hasData: true,
      year,
      payload,
    } satisfies PitcherSeasonPitchTypesApiResponse)
  } catch (error) {
    console.error("[season-pitch-types]", error)
    return jsonDerivedResponse(
      {
        hasData: false,
        year: yearFromRequest(request),
        payload: null,
        code: "SERVER_ERROR",
        message: "Failed to load pitcher season pitch types",
      } satisfies PitcherSeasonPitchTypesApiResponse,
      { status: 500 },
    )
  }
}
