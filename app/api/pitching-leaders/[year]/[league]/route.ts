/**
 * API Route: 指定年度・リーグの投球成績リーダー。
 * 2026 も最新のランキング JSON 補完を通して返し、古いスナップショット固定を避ける。
 */

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
