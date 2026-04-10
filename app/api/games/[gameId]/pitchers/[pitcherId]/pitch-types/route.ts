/**
 * 試合・Yahoo投手ID指定で球種別成績を返す API
 * fetch_game_pitch_types.py で生成した JSON を読み込む
 */

import { NextResponse } from "next/server"
import {
  type GamePitchTypeRow,
  type GamePitchTypesResponse,
} from "@/lib/yahooGame/gamePitcherPilotFiles"
import { getProjectRoot } from "@/lib/projectRoot"
import { loadPitchTypesJsonOrCanonical } from "@/lib/yahooGame/loadPitchTypesWithCanonicalFallback"

export const dynamic = "force-dynamic"

export type { GamePitchTypeRow, GamePitchTypesResponse }

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

    const data = loadPitchTypesJsonOrCanonical(getProjectRoot(), gameId, pitcherId)
    if (!data) {
      return NextResponse.json(
        {
          error:
            "Pitch type data unavailable (no JSON under _data/yahoo_games_pilot and no canonical pitchEvents). " +
            "Run: python scripts/fetch_game_pitch_types.py --game-id " +
            gameId +
            " --pitcher-id " +
            pitcherId,
        },
        { status: 404 }
      )
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error("[game-pitch-types] Error:", error)
    return NextResponse.json({ error: "Failed to load pitch types" }, { status: 500 })
  }
}
