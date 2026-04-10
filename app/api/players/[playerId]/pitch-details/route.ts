/**
 * Phase 4: 投球詳細パイロット API
 * 菊池涼介のみ、打席別の球種・コース（25マス）情報を返す
 */

import { NextResponse } from 'next/server'
import { DERIVED_SEASON_YEAR_DEFAULT, getYahooIdForPilot } from '@/lib/seasonStatsPilot'
import {
  loadPhase14PitchBundle,
  loadPitchDetails,
  loadPitchTypeStats,
  loadZoneStats,
} from '@/lib/pitchDetailsPilot'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ playerId: string }> | { playerId: string } }
) {
  try {
    const { playerId } =
      context.params instanceof Promise ? await context.params : context.params
    const year =
      new URL(request.url).searchParams.get('year')?.trim() || DERIVED_SEASON_YEAR_DEFAULT
    const yahooId = getYahooIdForPilot(playerId)
    if (!yahooId) {
      return NextResponse.json({
        plateAppearances: [],
        pitchTypeStats: [],
        zoneStats: [],
        isPilot: false,
      })
    }
    const plateAppearances = loadPitchDetails(yahooId)
    const pitchTypeStats = loadPitchTypeStats(yahooId, year)
    const zoneStats = loadZoneStats(yahooId, year)
    const fromCanonical = loadPhase14PitchBundle(yahooId, year)
    const isPilot =
      plateAppearances.length > 0 ||
      fromCanonical != null ||
      pitchTypeStats.length > 0 ||
      zoneStats.length > 0
    return NextResponse.json({
      plateAppearances,
      pitchTypeStats,
      zoneStats,
      isPilot,
    })
  } catch (error) {
    console.error('[pitch-details] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load pitch details' },
      { status: 500 }
    )
  }
}
