import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { fetchPlayerMatchupPayload } from "@/lib/playerMatchupApi"
import type { PlayerMatchupApiResponse } from "@/lib/playerMatchupTypes"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"

export const dynamic = "force-dynamic"

export type MatchupBattingApiResponse = PlayerMatchupApiResponse

export async function GET(
  request: Request,
  context: { params: Promise<{ playerId: string }> | { playerId: string } },
) {
  try {
    const { playerId } =
      context.params instanceof Promise ? await context.params : context.params
    const decoded = decodePlayerPathSegment((playerId || "").trim())
    const year = yearFromRequest(request)

    const { payload } = await fetchPlayerMatchupPayload(year, decoded, "batter")
    return jsonDerivedResponse(
      payload
        ? { hasData: true, year, payload }
        : ({ hasData: false, year, payload: null } satisfies MatchupBattingApiResponse),
    )
  } catch (e) {
    console.error("[matchup-batting]", e)
    return jsonDerivedResponse(
      { hasData: false, year: DERIVED_SEASON_YEAR_DEFAULT, payload: null } satisfies MatchupBattingApiResponse,
      { status: 500 },
    )
  }
}
