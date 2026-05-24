/**
 * API Route: 指定年度・リーグの投球成績リーダー（ランキング JSON から抽出）
 * 2026 は R2 スナップショット直読み（fs 入りモジュールを API で直接 import しない）
 */

import { hasRankingsBaseUrl } from '@/lib/displayData/rankingsBaseUrl'
import { fetchTopLeadersSnapshotRemote } from '@/lib/topPage/fetchTopLeadersSnapshotRemote'
import { TOP_LEADERS_SNAPSHOT_YEAR } from '@/lib/topPage/leadersSnapshotShared'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ year: string; league: string }> | { year: string; league: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const { year, league } = resolvedParams
    const upperLeague = league.toUpperCase()

    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] GET /api/pitching-leaders/${year}/${upperLeague}`)
    }

    if (year === TOP_LEADERS_SNAPSHOT_YEAR) {
      const data = await fetchTopLeadersSnapshotRemote(year, upperLeague, 'pitching')
      if (!data || Object.keys(data.leaders ?? {}).length === 0) {
        const hasR2 = hasRankingsBaseUrl()
        return NextResponse.json(
          {
            error: hasR2
              ? '2026 pitching leaders could not be loaded from R2'
              : 'RANKINGS_BASE_URL is not set on Vercel (enable Production and Redeploy)',
          },
          { status: 503 }
        )
      }
      return NextResponse.json(data)
    }

    const { getPitchingLeadersAsync } = await import('@/lib/ranking/leadersFromPitchingRankingsJson')
    const data = await getPitchingLeadersAsync(year, upperLeague)
    if (Object.keys(data.leaders ?? {}).length > 0) {
      return NextResponse.json(data)
    }

    return NextResponse.json(
      {
        error: `Pitching leaders for ${year} not found on R2. Run: npm run display:r2:upload (all years).`,
      },
      { status: 404 }
    )
  } catch (error) {
    const resolvedParams = params instanceof Promise ? await params : params
    const { year = 'unknown', league = 'unknown' } = resolvedParams || {}
    console.error(`[API] Error fetching ${year} ${league} pitching leaders:`, error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch pitching leaders'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
