import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"
import { loadCatcherPaRoundPitchTypesFromRepoAsync } from "@/lib/catcherPaRoundPitchTypesLoad"

export const dynamic = "force-dynamic"

export type CatcherPaRoundPitchTypesApiResponse = {
  hasData: boolean
  year: string
  payload: {
    byPaRoundPitchTypes: {
      key: "1" | "2" | "3" | "4" | "5"
      pitches_total: number
      rows: { pitch_type: string; pitches: number; pct: number }[]
    }[]
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
      } satisfies CatcherPaRoundPitchTypesApiResponse)
    }

    const d = await loadCatcherPaRoundPitchTypesFromRepoAsync(year, npb)
    return jsonDerivedResponse(
      d
        ? {
            hasData: true,
            year,
            payload: { byPaRoundPitchTypes: d.byPaRoundPitchTypes },
          }
        : { hasData: false, year, payload: null } satisfies CatcherPaRoundPitchTypesApiResponse
    )
  } catch (e) {
    console.error("[catcher-pa-round-pitch-types]", e)
    return jsonDerivedResponse(
      { hasData: false, year: DERIVED_SEASON_YEAR_DEFAULT, payload: null } satisfies CatcherPaRoundPitchTypesApiResponse,
      { status: 500 }
    )
  }
}

