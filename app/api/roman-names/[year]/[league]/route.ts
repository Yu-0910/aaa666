/**
 * 英字名マップAPI
 * CSV（player_name_en列）を参照し、「名前|チーム」→ 英字名 のマップを返す
 * ランキングページでJSONにromanNameが無い場合の補完に使用
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  context: { params: Promise<{ year: string; league: string }> }
) {
  try {
    const { year, league } = await context.params
    if (!year || !league) {
      return NextResponse.json({ error: 'year and league are required' }, { status: 400 })
    }
    const upperLeague = league.toUpperCase()
    if (upperLeague !== 'CL' && upperLeague !== 'PL') {
      return NextResponse.json({ error: 'league must be CL or PL' }, { status: 400 })
    }
    return NextResponse.json({}, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (e) {
    console.error('[roman-names]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
