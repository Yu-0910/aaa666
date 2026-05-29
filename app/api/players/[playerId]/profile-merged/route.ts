import { readFileSync } from "fs"
import { join } from "path"

import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { decodePlayerPathSegment, jsonDerivedResponse } from "@/lib/api/derivedPlayerApiShared"
import { getProjectRoot } from "@/lib/projectRoot"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"

export const dynamic = "force-dynamic"

export type PlayerProfileMergedApiPayload = Record<string, unknown>
export type PlayerProfileMergedApiResponse = {
  hasData: boolean
  year: "all"
  payload: PlayerProfileMergedApiPayload | null
  code?: string
  message?: string
}

function readMergedByNpbId(npbPlayerId: string): PlayerProfileMergedApiPayload | null {
  const id = (npbPlayerId || "").trim()
  if (!/^\d+$/.test(id)) return null
  const path = join(getProjectRoot(), "_data", "derived", "player_profile", "merged", `${id}.json`)
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PlayerProfileMergedApiPayload
  } catch {
    return null
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ playerId: string }> | { playerId: string } },
) {
  try {
    const { playerId } = context.params instanceof Promise ? await context.params : context.params
    const decoded = decodePlayerPathSegment((playerId || "").trim())
    const rosterPlayer = findRosterPlayerByPublicId(decoded)
    const npbId =
      rosterPlayer?.npb_player_id ??
      (/^\d+$/.test(decoded) ? resolveNpbPlayerIdFromPublicId(decoded) : decoded)
    const payload = readMergedByNpbId(npbId)
    if (!payload) {
      return jsonDerivedResponse<PlayerProfileMergedApiPayload>({
        hasData: false,
        year: "all",
        payload: null,
        code: "not_found",
        message: "merged player profile not found",
      } satisfies PlayerProfileMergedApiResponse)
    }
    return jsonDerivedResponse<PlayerProfileMergedApiPayload>({
      hasData: true,
      year: "all",
      payload,
    } satisfies PlayerProfileMergedApiResponse)
  } catch {
    return jsonDerivedResponse<PlayerProfileMergedApiPayload>(
      {
        hasData: false,
        year: "all",
        payload: null,
        code: "error",
        message: "failed to load merged player profile",
      } satisfies PlayerProfileMergedApiResponse,
      { status: 500 },
    )
  }
}

