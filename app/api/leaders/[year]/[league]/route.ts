/**
 * API Route: 指定年度・リーグの打撃成績リーダーを取得（動的ルート）
 * モダン年度はランキング JSON から TOP5/TOP3 を切り出し、スナップショットは補完のみ。
 */

import { hasRankingsBaseUrl } from '@/lib/displayData/rankingsBaseUrl'
import { finalizeBattingLeadersConfigForTopPageAsync } from '@/lib/ranking/leadersFromRankingsJson'
import { fetchTopLeadersSnapshotRemote } from '@/lib/topPage/fetchTopLeadersSnapshotRemote'
import { usesTopPageModernLayout } from '@/lib/topPageModernLayout'
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

    const fromSnapshot = await fetchTopLeadersSnapshotRemote(year, upperLeague, 'batting')
    const finalized = await finalizeBattingLeadersConfigForTopPageAsync(
      year,
      upperLeague,
      fromSnapshot
    )

    if (finalized && Object.keys(finalized.leaders ?? {}).length > 0) {
      return NextResponse.json(finalized)
    }

    if (!hasRankingsBaseUrl() && process.env.NODE_ENV !== 'production') {
      const { getBattingLeaders } = await import('@/lib/ranking/leaders')
      const fromCsv = getBattingLeaders(year, upperLeague)
      if (Object.keys(fromCsv.leaders ?? {}).length > 0) {
        return NextResponse.json(fromCsv)
      }
    }

    if (usesTopPageModernLayout(Number(year))) {
      return NextResponse.json(
        {
          error: `Batting leaders for ${year} not found. Run: npm run display:r2:upload (rankings JSON).`,
        },
        { status: 404 }
      )
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
