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

export const dynamic = "force-dynamic"

export type PitcherSeasonPitchTypesApiResponse =
  DerivedPlayerApiEnvelope<PitcherSeasonPitchTypesPayload>

function needsPitchTypeSplitRefresh(payload: PitcherSeasonPitchTypesPayload | null): boolean {
  if (!payload?.rows?.length) return false
  return payload.rows.some(
    (row) =>
      typeof row.whiff_pct_vs_left !== "string" ||
      typeof row.whiff_pct_vs_right !== "string" ||
      typeof row.strike_pct_vs_left !== "string" ||
      typeof row.strike_pct_vs_right !== "string" ||
      typeof row.avg_vs_left !== "string" ||
      typeof row.avg_vs_right !== "string" ||
      typeof row.hr_vs_left !== "number" ||
      typeof row.hr_vs_right !== "number",
  )
}

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
    let payload =
      npb ? await loadPitcherSeasonPitchTypesAsync(year, npb) : null
    if (!payload && /^\d+$/.test(decoded)) {
      payload = await loadPitcherSeasonPitchTypesAsync(year, decoded)
      if (payload) npb = decoded
    }

    if (!npb) {
      return jsonDerivedResponse({
        hasData: false,
        year,
        payload: null,
        code: "NO_NPB_ID",
        message: "Could not resolve npb_player_id for this URL.",
      } satisfies PitcherSeasonPitchTypesApiResponse)
    }

    if (!payload || needsPitchTypeSplitRefresh(payload)) {
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
