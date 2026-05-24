import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { loadPitcherSeasonPitchingPeriodPayloadFromRepoAsync } from "@/lib/pitcherSeasonPitchingPeriodLoad"
import { resolvePilotPitcherNpbFromUrlSegment } from "@/lib/pitcherSeasonPocPilotFallback"
import type { PitcherSeasonPitchingPeriodApiResponse } from "@/lib/pitcherSeasonPocTypes"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  context: { params: Promise<{ playerId: string }> | { playerId: string } }
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
    // 名簿照合が外れるケースでも、URL セグメント自体が NPB player_id で派生ファイルが存在するなら直接読む。
    let payload =
      npb ? await loadPitcherSeasonPitchingPeriodPayloadFromRepoAsync(year, npb) : null
    if (!payload && /^\d+$/.test(decoded)) {
      payload = await loadPitcherSeasonPitchingPeriodPayloadFromRepoAsync(year, decoded)
      if (payload) npb = decoded
    }
    return jsonDerivedResponse({
      hasData: payload != null,
      year,
      payload,
    } satisfies PitcherSeasonPitchingPeriodApiResponse)
  } catch (e) {
    console.error("[season-pitching-period]", e)
    return jsonDerivedResponse(
      {
        hasData: false,
        year: DERIVED_SEASON_YEAR_DEFAULT,
        payload: null,
      } satisfies PitcherSeasonPitchingPeriodApiResponse,
      { status: 500 }
    )
  }
}
