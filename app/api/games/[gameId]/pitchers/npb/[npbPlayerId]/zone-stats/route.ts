/**
 * Phase 6: gameId + NPB選手ID でゾーン別 JSON を返す
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { NextResponse } from "next/server"
import { getProjectRoot } from "@/lib/projectRoot"
import { loadZoneStatsJsonOrCanonical } from "@/lib/yahooGame/loadZoneStatsWithCanonicalFallback"
import { parseRosterCsv } from "@/lib/yahooGame/rosterCsv"
import { resolveYahooPitcherIdForGame } from "@/lib/yahooGame/pitcherForNpbPlayer"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: {
    params:
      | Promise<{ gameId: string; npbPlayerId: string }>
      | { gameId: string; npbPlayerId: string }
  }
) {
  try {
    const { gameId, npbPlayerId: rawNpb } =
      context.params instanceof Promise ? await context.params : context.params
    let npbPlayerId = rawNpb
    try {
      npbPlayerId = decodeURIComponent(rawNpb).normalize("NFC")
    } catch {
      npbPlayerId = rawNpb
    }
    npbPlayerId = npbPlayerId.replace(/^player-/, "").trim()

    const root = getProjectRoot()
    const rosterPath = join(root, "_data", "npb_roster_2026.csv")
    if (!existsSync(rosterPath)) {
      return NextResponse.json({ error: "Roster file not found" }, { status: 503 })
    }
    const roster = parseRosterCsv(readFileSync(rosterPath, "utf-8"))

    const yahooId = resolveYahooPitcherIdForGame(root, gameId, npbPlayerId, roster)
    if (!yahooId) {
      return NextResponse.json(
        {
          error:
            "Yahoo pitcher id could not be resolved for this game and npb_player_id (ingest canonical or add pilot override).",
        },
        { status: 404 }
      )
    }

    const data = loadZoneStatsJsonOrCanonical(root, gameId, yahooId)
    if (!data) {
      return NextResponse.json(
        {
          error:
            "Zone stats unavailable: no yahoo_games_pilot JSON and canonical has no pitchEvents for this pitcher. " +
            "Check gameId / roster, or run: python scripts/fetch_pitcher_zone_stats.py --game-id " +
            gameId +
            " --pitcher-id " +
            yahooId,
        },
        { status: 404 }
      )
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error("[npb zone-stats] Error:", error)
    return NextResponse.json({ error: "Failed to load zone stats" }, { status: 500 })
  }
}
