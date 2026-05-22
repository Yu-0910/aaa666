/**
 * 試合・Yahoo投手ID指定でコース別（対右/対左）投球成績を返す API
 * fetch_pitcher_zone_stats.py で生成した JSON を読み込む
 */

import { NextResponse } from "next/server"
import { getProjectRoot } from "@/lib/projectRoot"
import { type ZoneStat, type ZoneStatsResponse } from "@/lib/yahooGame/gamePitcherPilotFiles"
import { loadZoneStatsJsonOrCanonical } from "@/lib/yahooGame/loadZoneStatsWithCanonicalFallback"

export const dynamic = "force-dynamic"

export type { ZoneStat, ZoneStatsResponse }

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ gameId: string; pitcherId: string }> | { gameId: string; pitcherId: string }
  }
) {
  try {
    const params = context.params instanceof Promise ? await context.params : context.params
    const { gameId, pitcherId } = params
    if (!gameId || !pitcherId) {
      return NextResponse.json({ error: "gameId and pitcherId required" }, { status: 400 })
    }

    const data = loadZoneStatsJsonOrCanonical(getProjectRoot(), gameId, pitcherId)
    if (!data) {
      return NextResponse.json(
        {
          error:
            "Zone stats unavailable (no JSON under _data/yahoo_games_pilot and no canonical pitchEvents). " +
            "Run: python scripts/fetch_pitcher_zone_stats.py --game-id " +
            gameId +
            " --pitcher-id " +
            pitcherId,
        },
        { status: 404 }
      )
    }
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    })
  } catch (error) {
    console.error("[game-zone-stats] Error:", error)
    return NextResponse.json({ error: "Failed to load zone stats" }, { status: 500 })
  }
}
