import fs from "node:fs"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { derivedLocalPath, readDerivedJsonLocalSync } from "@/lib/derived/fetchDerivedJsonServer"
import { slugifyPlayerRomanName } from "@/lib/playerSlug"
import { resolvePlayerSlugEntry } from "@/lib/playerSlug.server"
import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { fetchDerivedJsonServer } from "@/lib/derived/fetchDerivedJsonServer"
import type { FaEstimateDomestic } from "@/lib/faEstimate"
import { loadDomesticFaEstimateForPlayer } from "@/lib/loadPlayerFaEstimate"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"
import { resolveNonRosterNameEnFull } from "@/lib/playerRomanFromKana"

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

type NonRosterMetaRoman = {
  player_id?: string
  npb_player_id?: string
  name_ja?: string
  roman?: { name_en_full?: string; name_en_short?: string }
}

let nonRosterSlugToNpbIdCache: Map<string, string> | null = null

function abbreviatedRomanFromFull(romanFull: string): string {
  const slug = slugifyPlayerRomanName(romanFull)
  const tokens = slug.split("-").filter(Boolean)
  if (tokens.length < 2) return ""
  const given = tokens[0] ?? ""
  const surname = tokens[tokens.length - 1] ?? ""
  if (!given || !surname) return ""
  return `${surname}-${given[0]}`
}

function buildNonRosterSlugToNpbIdMap(): Map<string, string> {
  if (nonRosterSlugToNpbIdCache) return nonRosterSlugToNpbIdCache
  const map = new Map<string, string>()
  const mergedDir = derivedLocalPath("player_profile", "merged")
  let fileNames: string[] = []
  try {
    fileNames = fs.readdirSync(mergedDir)
  } catch {
    nonRosterSlugToNpbIdCache = map
    return map
  }
  for (const fileName of fileNames) {
    if (!fileName.endsWith(".json")) continue
    const id = fileName.replace(/^npb_/, "").replace(/\.json$/i, "").trim()
    if (!/^\d+$/.test(id)) continue
    const meta =
      readDerivedJsonLocalSync<NonRosterMetaRoman>("npb_player_meta", `${id}.json`) ??
      readDerivedJsonLocalSync<NonRosterMetaRoman>("npb_player_meta", `npb_${id}.json`)
    const full = resolveNonRosterNameEnFull(meta).trim()
    const abbreviated = abbreviatedRomanFromFull(full)
    const short = String(meta?.roman?.name_en_short ?? "").trim()
    const ja = String(meta?.name_ja ?? "").trim()
    for (const candidate of [full, abbreviated, short, ja]) {
      const slug = slugifyPlayerRomanName(candidate)
      if (slug) map.set(slug, id)
    }
  }
  nonRosterSlugToNpbIdCache = map
  return map
}

function resolveNonRosterNpbIdFromSlug(slug: string): string | null {
  const clean = String(slug ?? "").trim().toLowerCase()
  if (!clean || /^\d+$/.test(clean)) return null
  return buildNonRosterSlugToNpbIdMap().get(clean) ?? null
}

async function readMetaForRoman(npbPlayerId: string) {
  const id = (npbPlayerId || "").trim()
  if (!/^\d+$/.test(id)) return null
  for (const fileName of [`${id}.json`, `npb_${id}.json`]) {
    const meta = await fetchDerivedJsonServer<{
      name_kana?: string
      roman?: { name_en_full?: string; name_en_short?: string }
    }>("npb_player_meta", fileName)
    if (meta) return meta
  }
  return null
}

async function readMergedByNpbId(
  npbPlayerId: string,
): Promise<PlayerProfileMergedApiPayload | null> {
  const id = (npbPlayerId || "").trim()
  if (!/^\d+$/.test(id)) return null

  // Phase4-B:
  // merged の正本は npb_{npb_player_id}.json。
  // 2026名簿外の過去選手も NPB ID 直指定で読めるようにする。
  const byNpbFileName = await fetchDerivedJsonServer<PlayerProfileMergedApiPayload>(
    "player_profile",
    "merged",
    `npb_${id}.json`,
  )
  if (byNpbFileName) return byNpbFileName

  // 既存互換: もし {id}.json 形式が残っている場合も読む。
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
    const slugEntry = resolvePlayerSlugEntry(decoded)
    const rosterPlayer = slugEntry
      ? null
      : findRosterPlayerByPublicId(decoded)
    const resolvedNpbId = /^\d+$/.test(decoded)
      ? resolveNpbPlayerIdFromPublicId(decoded)
      : null
    const nonRosterNpbId = resolveNonRosterNpbIdFromSlug(decoded)
    const npbId =
      slugEntry?.npbPlayerId ??
      rosterPlayer?.npb_player_id ??
      resolvedNpbId ??
      nonRosterNpbId ??
      decoded
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
    const meta = rosterPlayer ? null : await readMetaForRoman(npbId)
    const nameEnFull = rosterPlayer ? "" : resolveNonRosterNameEnFull(meta)
    const enriched: PlayerProfileMergedApiPayload = {
      ...payload,
      ...(nameEnFull ? { name_en_full: nameEnFull } : {}),
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
