/**
 * API Route: 指定年度・リーグの打撃成績リーダーを取得（動的ルート）
 */

import { getBattingLeaders } from '@/lib/ranking/leaders'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ year: string; league: string }> | { year: string; league: string } }
) {
  try {
    // paramsがPromiseかどうかをチェック
    const resolvedParams = params instanceof Promise ? await params : params
    const { year, league } = resolvedParams
    
    // リーグ名を大文字に正規化
    const upperLeague = league.toUpperCase()
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] GET /api/leaders/${year}/${upperLeague}`)
    }
    
    const data = getBattingLeaders(year, upperLeague)
    return NextResponse.json(data)
  } catch (error) {
    const resolvedParams = params instanceof Promise ? await params : params
    const { year = 'unknown', league = 'unknown' } = resolvedParams || {}
    console.error(`[API] Error fetching ${year} ${league} batting leaders:`, error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch leaders'
    console.error(`[API] Error message: ${errorMessage}`)
    if (error instanceof Error) {
      console.error(`[API] Error stack:`, error.stack)
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

