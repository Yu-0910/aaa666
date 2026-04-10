import { NextResponse } from "next/server"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { loadPitcherSeasonPitchingPeriodPayloadFromRepo } from "@/lib/pitcherSeasonPitchingPeriodLoad"
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
    const raw = (playerId || "").trim()
    let decoded = raw
    try {
      decoded = decodeURIComponent(raw).normalize("NFC")
    } catch {
      decoded = raw
    }
    const year =
      new URL(request.url).searchParams.get("year")?.trim() || DERIVED_SEASON_YEAR_DEFAULT

    const roster = findRosterPlayerByPublicId(decoded)
    let npb = roster?.npb_player_id?.trim() ?? ""
    if (!npb) {
      const pilot = resolvePilotPitcherNpbFromUrlSegment(decoded)
      if (pilot) npb = pilot
    }
    if (!npb) {
      const body: PitcherSeasonPitchingPeriodApiResponse = {
        hasData: false,
        year,
        payload: null,
      }
      return NextResponse.json(body, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      })
    }

    const payload = loadPitcherSeasonPitchingPeriodPayloadFromRepo(year, npb)
    const body: PitcherSeasonPitchingPeriodApiResponse = {
      hasData: payload != null,
      year,
      payload,
    }
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  } catch (e) {
    console.error("[season-pitching-period]", e)
    return NextResponse.json(
      {
        hasData: false,
        year: DERIVED_SEASON_YEAR_DEFAULT,
        payload: null,
      } satisfies PitcherSeasonPitchingPeriodApiResponse,
      { status: 500 }
    )
  }
}
