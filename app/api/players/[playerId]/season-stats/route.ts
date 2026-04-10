/**
 * Phase 4: パイロット今季成績 API
 * Yahoo pilot 連携選手は実データ。名簿の野手で未連携のときは通算行プレースホルダー（UI 用）。
 */

import { NextResponse } from 'next/server'
import { findRosterPlayerByPublicId } from '@/lib/npbRoster'
import { isFielderRegistrationPosition } from '@/lib/rosterPitcher'
import {
  createPlaceholderTotalSeasonRow,
  DERIVED_SEASON_YEAR_DEFAULT,
  getYahooIdForPilot,
  loadPilotBlocksData,
  loadPilotRispStats,
  mergePilotSeasonStatsWithDerived,
} from '@/lib/seasonStatsPilot'
import { loadPitchTypeStats, loadSpeedBandStats } from '@/lib/pitchDetailsPilot'

export const dynamic = 'force-dynamic'

function fielderPlaceholderJson() {
  return {
    stats: [createPlaceholderTotalSeasonRow()],
    isPilot: true,
    blocks: null,
    pitchTypeStats: [],
    speedBandStats: {},
  }
}

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
      const rosterPlayer = findRosterPlayerByPublicId(playerId)
      if (
        rosterPlayer &&
        isFielderRegistrationPosition(rosterPlayer.position, {
          rosterNpbPlayerId: rosterPlayer.npb_player_id,
        })
      ) {
        return NextResponse.json(fielderPlaceholderJson())
      }
      return NextResponse.json({
        stats: [],
        isPilot: false,
        blocks: null,
        pitchTypeStats: [],
        speedBandStats: {},
      })
    }
    let stats = mergePilotSeasonStatsWithDerived(yahooId, year)
    const blocks = loadPilotBlocksData(yahooId)
    if (blocks?.meta?.date && blocks.blocks?.F) {
      const byRispStats = loadPilotRispStats(yahooId, blocks.meta.date)
      if (byRispStats) {
        blocks.blocks.F.by_risp_stats = byRispStats
      }
    }
    const pitchTypeStats = loadPitchTypeStats(yahooId, year)
    const speedBandStats = loadSpeedBandStats(yahooId, year)

    // 打撃行が空でも Phase 14 のみあるケースがある。旧ロジックはここで return して球種を読めなかった。
    if (stats.length === 0) {
      const rosterPlayer = findRosterPlayerByPublicId(playerId)
      if (
        rosterPlayer &&
        isFielderRegistrationPosition(rosterPlayer.position, {
          rosterNpbPlayerId: rosterPlayer.npb_player_id,
        })
      ) {
        stats = [createPlaceholderTotalSeasonRow()]
      }
    }

    return NextResponse.json(
      { stats, isPilot: true, blocks, pitchTypeStats, speedBandStats },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    )
  } catch (error) {
    console.error('[season-stats] Error:', error)
    try {
      const { playerId } =
        context.params instanceof Promise ? await context.params : context.params
      const raw = (playerId || '').trim()
      const decoded = (() => {
        try {
          return decodeURIComponent(raw).normalize('NFC')
        } catch {
          return raw
        }
      })()
      const rosterPlayer = findRosterPlayerByPublicId(decoded)
      if (
        rosterPlayer &&
        isFielderRegistrationPosition(rosterPlayer.position, {
          rosterNpbPlayerId: rosterPlayer.npb_player_id,
        })
      ) {
        return NextResponse.json(fielderPlaceholderJson())
      }
    } catch {
      // ignore
    }
    return NextResponse.json(
      {
        error: 'Failed to load season stats',
        stats: [],
        blocks: null,
        pitchTypeStats: [],
        speedBandStats: {},
      },
      { status: 500 }
    )
  }
}
