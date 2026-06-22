import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { fetchBatterVsTeamCountPitchTypesPayload } from "@/lib/batterVsTeamCountPitchTypesApi"
import type { BatterVsTeamCountPitchTypesFile } from "@/lib/batterVsTeamCountPitchTypesTypes"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"

export const dynamic = "force-dynamic"

export type BatterVsTeamCountPitchTypesApiResponse = {
  hasData: boolean
  year: string
  payload: BatterVsTeamCountPitchTypesFile | null
  code?: string
  message?: string
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

    const { yahooBatterId, payload } = await fetchBatterVsTeamCountPitchTypesPayload(
      year,
      decoded,
    )

    if (!yahooBatterId) {
      return jsonDerivedResponse({
        hasData: false,
        year,
        payload: null,
        code: "NO_YAHOO_ID",
      } satisfies BatterVsTeamCountPitchTypesApiResponse)
    }

    const hasData = payload != null && payload.teams.length > 0
    return jsonDerivedResponse({
      hasData,
      year,
      payload: hasData ? payload : null,
    } satisfies BatterVsTeamCountPitchTypesApiResponse)
  } catch (e) {
    console.error("[batter-vs-team-count-pitch-types]", e)
    return jsonDerivedResponse(
      {
        hasData: false,
        year: DERIVED_SEASON_YEAR_DEFAULT,
        payload: null,
        code: "SERVER_ERROR",
        message: "Failed to load batter vs team count pitch types",
      } satisfies BatterVsTeamCountPitchTypesApiResponse,
      { status: 500 },
    )
  }
}
