import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { fetchDerivedJsonServer } from "@/lib/derived/fetchDerivedJsonServer"
import type { FaEstimateDomestic } from "@/lib/faEstimate"
import { loadDomesticFaEstimateForPlayer } from "@/lib/loadPlayerFaEstimate"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"

export const dynamic = "force-dynamic"

export type PlayerProfileMergedFaEstimate = {
  seasonYear: string
  domesticFa: FaEstimateDomestic | null
}

export type PlayerProfileMergedApiPayload = Record<string, unknown> & {
  faEstimate?: PlayerProfileMergedFaEstimate
}

export type PlayerProfileMergedApiResponse = {
  hasData: boolean
  year: "all"
  payload: PlayerProfileMergedApiPayload | null
  code?: string
  message?: string
}

async function readMergedByNpbId(
  npbPlayerId: string,
): Promise<PlayerProfileMergedApiPayload | null> {
  const id = (npbPlayerId || "").trim()
  if (!/^\d+$/.test(id)) return null
  return fetchDerivedJsonServer<PlayerProfileMergedApiPayload>(
    "player_profile",
    "merged",
    `${id}.json`,
  )
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
    const faSeasonYear = yearFromRequest(request)
    const payload = await readMergedByNpbId(npbId)
    if (!payload) {
      return jsonDerivedResponse<PlayerProfileMergedApiPayload>({
        hasData: false,
        year: "all",
        payload: null,
        code: "not_found",
        message: "merged player profile not found",
      } satisfies PlayerProfileMergedApiResponse)
    }
    const domesticFa = await loadDomesticFaEstimateForPlayer(npbId, faSeasonYear)
    const enriched: PlayerProfileMergedApiPayload = {
      ...payload,
      faEstimate: { seasonYear: faSeasonYear, domesticFa },
    }
    return jsonDerivedResponse<PlayerProfileMergedApiPayload>({
      hasData: true,
      year: "all",
      payload: enriched,
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
