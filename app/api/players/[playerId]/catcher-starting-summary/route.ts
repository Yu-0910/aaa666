import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"
import { loadCatcherStartingSummaryFromRepo } from "@/lib/catcherStartingSummaryLoad"

export const dynamic = "force-dynamic"

export type CatcherStartingSummaryApiResponse = {
  hasData: boolean
  year: string
  payload: {
    starts: number
    teamWins: number
    teamLosses: number
    teamWinPct: number | null
    qsCount: number
    hqsCount: number
    sqsCount: number
    qsPct: number | null
    hqsPct: number | null
    sqsPct: number | null
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
      } satisfies CatcherStartingSummaryApiResponse)
    }

    const d = loadCatcherStartingSummaryFromRepo(year, npb)
    return jsonDerivedResponse(
      d
        ? {
            hasData: true,
            year,
            payload: {
              starts: d.starts,
              teamWins: d.teamWins,
              teamLosses: d.teamLosses,
              teamWinPct: d.teamWinPct,
              qsCount: d.qsCount,
              hqsCount: d.hqsCount,
              sqsCount: d.sqsCount,
              qsPct: d.qsPct,
              hqsPct: d.hqsPct,
              sqsPct: d.sqsPct,
            },
          }
        : { hasData: false, year, payload: null } satisfies CatcherStartingSummaryApiResponse
    )
  } catch (e) {
    console.error("[catcher-starting-summary]", e)
    return jsonDerivedResponse(
      { hasData: false, year: DERIVED_SEASON_YEAR_DEFAULT, payload: null } satisfies CatcherStartingSummaryApiResponse,
      { status: 500 }
    )
  }
}

