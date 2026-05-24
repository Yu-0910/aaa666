/**
 * API Route: 指定年度・リーグの打撃成績リーダーを取得（動的ルート）
 * 2026 は fs 非依存の R2 直読みのみ（leaders.ts 経由だと本番バンドルで壊れることがある）
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
      console.log(`[API] GET /api/leaders/${year}/${upperLeague}`)
    }

    if (year === TOP_LEADERS_SNAPSHOT_YEAR) {
      const data = await fetchTopLeadersSnapshotRemote(year, upperLeague, 'batting')
      if (!data || Object.keys(data.leaders ?? {}).length === 0) {
        const hasR2 = hasRankingsBaseUrl()
        return NextResponse.json(
          {
            error: hasR2
              ? '2026 batting leaders could not be loaded from R2'
              : 'RANKINGS_BASE_URL is not set on Vercel (enable Production and Redeploy)',
          },
          { status: 503 }
        )
      }
      return NextResponse.json(data)
    }

    const { buildBattingLeadersConfigFromRankingsAsync } = await import(
      '@/lib/ranking/leadersFromRankingsJson'
    )
    const fromRankings = await buildBattingLeadersConfigFromRankingsAsync(year, upperLeague)
    if (fromRankings && Object.keys(fromRankings.leaders ?? {}).length > 0) {
      return NextResponse.json(fromRankings)
    }

    if (!hasRankingsBaseUrl() && process.env.NODE_ENV !== 'production') {
      const { getBattingLeaders } = await import('@/lib/ranking/leaders')
      return NextResponse.json(getBattingLeaders(year, upperLeague))
    }

    return NextResponse.json(
      {
        error: `Batting leaders for ${year} not found on R2. Run: npm run display:r2:upload (all years).`,
      },
      { status: 404 }
    )
  } catch (error) {
    const resolvedParams = params instanceof Promise ? await params : params
    const { year = 'unknown', league = 'unknown' } = resolvedParams || {}
    console.error(`[API] Error fetching ${year} ${league} batting leaders:`, error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch leaders'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
