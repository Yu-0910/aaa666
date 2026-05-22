import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"
import { loadCatcherPitcherSplitsFromRepo } from "@/lib/catcherPitcherSplitsLoad"

export const dynamic = "force-dynamic"

export type CatcherPitchersApiResponse = {
  hasData: boolean
  year: string
  payload: {
    rows: {
      pitcherNpbId: string
      pitcherName: string
      pitcherTeam: string
      bf: number
      ab: number
      h: number
      hr: number
      so: number
      bb: number
      hbp: number
      ipOuts: number
      era: number | null
      ip: string
      wl: string
      kPct: number | null
      kBbPct: number | null
      whip: number | null
      qsPct: number | null
      games?: number
      wins?: number
      losses?: number
      qsCount?: number
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
      } satisfies CatcherPitchersApiResponse)
    }

    const d = loadCatcherPitcherSplitsFromRepo(year, npb)
    return jsonDerivedResponse(
      d
        ? { hasData: true, year, payload: { rows: d.rows } }
        : { hasData: false, year, payload: null } satisfies CatcherPitchersApiResponse
    )
  } catch (e) {
    console.error("[catcher-pitchers]", e)
    return jsonDerivedResponse(
      { hasData: false, year: DERIVED_SEASON_YEAR_DEFAULT, payload: null } satisfies CatcherPitchersApiResponse,
      { status: 500 }
    )
  }
}

