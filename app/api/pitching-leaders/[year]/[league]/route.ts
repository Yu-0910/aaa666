/**
 * API Route: 指定年度・リーグの投球成績リーダー（ランキング JSON から抽出）
 */

import { getPitchingLeaders } from "@/lib/ranking/leadersFromPitchingRankingsJson"
import { NextResponse } from "next/server"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ year: string; league: string }> | { year: string; league: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const { year, league } = resolvedParams
    const upperLeague = league.toUpperCase()

    if (process.env.NODE_ENV === "development") {
      console.log(`[API] GET /api/pitching-leaders/${year}/${upperLeague}`)
    }

    const data = getPitchingLeaders(year, upperLeague)
    return NextResponse.json(data)
  } catch (error) {
    const resolvedParams = params instanceof Promise ? await params : params
    const { year = "unknown", league = "unknown" } = resolvedParams || {}
    console.error(`[API] Error fetching ${year} ${league} pitching leaders:`, error)
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch pitching leaders"
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
