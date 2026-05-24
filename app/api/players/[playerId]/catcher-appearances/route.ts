import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"
import { loadCatcherAppearancesFromRepoAsync } from "@/lib/catcherAppearancesLoad"

export const dynamic = "force-dynamic"

export type CatcherAppearancesApiResponse = {
  hasData: boolean
  year: string
  payload: {
    gamesAsCatcher: number
    gameIds: string[]
  } | null
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

    const roster = findRosterPlayerByPublicId(decoded)
    const npb = roster?.npb_player_id?.trim() ?? ""
    if (!npb) {
      return jsonDerivedResponse({
        hasData: false,
        year,
        payload: null,
      } satisfies CatcherAppearancesApiResponse)
    }

    const d = await loadCatcherAppearancesFromRepoAsync(year, npb)
    return jsonDerivedResponse(
      d
        ? {
            hasData: true,
            year,
            payload: {
              gamesAsCatcher: d.gamesAsCatcher,
              gameIds: d.gameIds,
            },
          }
        : { hasData: false, year, payload: null } satisfies CatcherAppearancesApiResponse
    )
  } catch (e) {
    console.error("[catcher-appearances]", e)
    return jsonDerivedResponse(
      { hasData: false, year: DERIVED_SEASON_YEAR_DEFAULT, payload: null } satisfies CatcherAppearancesApiResponse,
      { status: 500 }
    )
  }
}

