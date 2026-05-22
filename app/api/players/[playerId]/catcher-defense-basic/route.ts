import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"
import { loadCatcherDefenseBasicFromRepo } from "@/lib/catcherDefenseBasicLoad"

export const dynamic = "force-dynamic"

export type CatcherDefenseBasicApiResponse = {
  hasData: boolean
  year: string
  payload: {
    sbAttempts: number
    sb: number
    cs: number
    csPct: number | null
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
      } satisfies CatcherDefenseBasicApiResponse)
    }

    const d = loadCatcherDefenseBasicFromRepo(year, npb)
    return jsonDerivedResponse(
      d
        ? {
            hasData: true,
            year,
            payload: { sbAttempts: d.sbAttempts, sb: d.sb, cs: d.cs, csPct: d.csPct },
          }
        : { hasData: false, year, payload: null } satisfies CatcherDefenseBasicApiResponse
    )
  } catch (e) {
    console.error("[catcher-defense-basic]", e)
    return jsonDerivedResponse(
      { hasData: false, year: DERIVED_SEASON_YEAR_DEFAULT, payload: null } satisfies CatcherDefenseBasicApiResponse,
      { status: 500 }
    )
  }
}

