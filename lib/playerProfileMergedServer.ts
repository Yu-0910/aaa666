import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import {
  fetchDerivedJsonServer,
  readDerivedJsonLocalSync,
} from "@/lib/derived/fetchDerivedJsonServer"
import { resolvePlayerSlugEntry } from "@/lib/playerSlug.server"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"

export type PlayerProfileMergedFaEstimate = {
  seasonYear: string
  domesticFa: unknown | null
}

export type PlayerProfileMergedPayload = Record<string, unknown> & {
  npb_player_id?: string
  name_ja?: string
  name_en_full?: string
  profile?: { birth_date_raw?: string; pro_debut_raw?: string; career_raw?: string }
  career_total_salary_display?: string | null
  career_batting?: { rows?: Array<Record<string, unknown>>; total?: Record<string, unknown> }
  career_pitching?: { rows?: Array<Record<string, unknown>>; total?: Record<string, unknown> } | null
  faEstimate?: PlayerProfileMergedFaEstimate
}

async function fetchDerivedJsonServerWithTimeout<T>(
  category: string,
  ...parts: string[]
): Promise<T | null> {
  return Promise.race([
    fetchDerivedJsonServer<T>(category, ...parts),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
  ])
}

async function readDerivedJsonForInitialHtml<T>(
  category: string,
  ...parts: string[]
): Promise<T | null> {
  if (process.env.NODE_ENV === "development") {
    const local = readDerivedJsonLocalSync<T>(category, ...parts)
    if (local) return local
  }
  return fetchDerivedJsonServerWithTimeout<T>(category, ...parts)
}

function stripNonRosterPageKindForRosterPlayer(
  payload: PlayerProfileMergedPayload,
): PlayerProfileMergedPayload {
  const meta = payload.meta
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return payload
  const nextMeta = { ...(meta as Record<string, unknown>) }
  if (nextMeta.page_kind === "career_only_non_roster") {
    delete nextMeta.page_kind
  }
  return { ...payload, meta: nextMeta }
}

async function readMergedByNpbId(npbPlayerId: string): Promise<PlayerProfileMergedPayload | null> {
  const id = (npbPlayerId || "").trim()
  if (!/^\d+$/.test(id)) return null

  const byNpbFileName = await readDerivedJsonForInitialHtml<PlayerProfileMergedPayload>(
    "player_profile",
    "merged",
    `npb_${id}.json`,
  )
  if (byNpbFileName) return byNpbFileName

  return readDerivedJsonForInitialHtml<PlayerProfileMergedPayload>("player_profile", "merged", `${id}.json`)
}

export async function loadPlayerProfileMergedForInitialHtml(options: {
  playerId: string
  npbPlayerId?: string
}): Promise<PlayerProfileMergedPayload | null> {
  const decoded = String(options.playerId ?? "").trim()
  const slugEntry = resolvePlayerSlugEntry(decoded)
  const rosterPlayer =
    (slugEntry?.npbPlayerId ? findRosterPlayerByPublicId(slugEntry.npbPlayerId) : null) ??
    findRosterPlayerByPublicId(decoded)
  const resolvedNpbId = /^\d+$/.test(decoded) ? resolveNpbPlayerIdFromPublicId(decoded) : null
  const npbId =
    options.npbPlayerId?.trim() ||
    slugEntry?.npbPlayerId ||
    rosterPlayer?.npb_player_id ||
    resolvedNpbId ||
    decoded

  const payload = await readMergedByNpbId(npbId)
  if (!payload) return null

  const effectivePayload = rosterPlayer ? stripNonRosterPageKindForRosterPlayer(payload) : payload

  return effectivePayload
}
