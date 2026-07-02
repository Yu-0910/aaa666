import { CURRENT_ROSTER_PLAYER_ENTRIES } from "@/lib/currentRosterPlayerEntries"
import { compactPlayerName, rosterNameMatchKey } from "@/lib/playerNameNormalize"
import { type PlayerPageSection, playerPagePath } from "@/lib/playerSlug"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"

export type PlayerSlugEntry = {
  npbPlayerId: string
  nameJa: string
  romanFull: string
  position: string
  teamCode: string
  slug: string
}

type PlayerSlugIndex = {
  entries: PlayerSlugEntry[]
  bySlug: Map<string, PlayerSlugEntry>
  byNpbId: Map<string, PlayerSlugEntry>
  byNameKey: Map<string, PlayerSlugEntry>
  byRomanKey: Map<string, PlayerSlugEntry>
}

let cachedIndex: PlayerSlugIndex | null = null

function buildSlugIndex(): PlayerSlugIndex {
  if (cachedIndex) return cachedIndex
  const entries = [...CURRENT_ROSTER_PLAYER_ENTRIES]
  const bySlug = new Map<string, PlayerSlugEntry>()
  const byNpbId = new Map<string, PlayerSlugEntry>()
  const byNameKey = new Map<string, PlayerSlugEntry>()
  const byRomanKey = new Map<string, PlayerSlugEntry>()
  for (const entry of entries) {
    bySlug.set(entry.slug, entry)
    byNpbId.set(entry.npbPlayerId, entry)
    byNameKey.set(rosterNameMatchKey(entry.nameJa), entry)
    byNameKey.set(compactPlayerName(entry.nameJa), entry)
    const romanKey = compactPlayerName(entry.romanFull).toLowerCase()
    if (romanKey) byRomanKey.set(romanKey, entry)
  }
  cachedIndex = { entries, bySlug, byNpbId, byNameKey, byRomanKey }
  return cachedIndex
}

export function getAllPlayerSlugEntries(): PlayerSlugEntry[] {
  return buildSlugIndex().entries
}

export function getPlayerSlugEntryBySlug(slug: string): PlayerSlugEntry | null {
  const clean = String(slug ?? "").trim().toLowerCase()
  if (!clean) return null
  return buildSlugIndex().bySlug.get(clean) ?? null
}

export function getPlayerSlugEntryByNpbId(npbPlayerId: string): PlayerSlugEntry | null {
  const clean = String(npbPlayerId ?? "").trim()
  if (!clean) return null
  return buildSlugIndex().byNpbId.get(clean) ?? null
}

export function resolvePlayerSlugEntry(raw: string): PlayerSlugEntry | null {
  let decoded = String(raw ?? "").trim()
  if (!decoded) return null
  try {
    decoded = decodeURIComponent(decoded).normalize("NFC")
  } catch {
    decoded = decoded.normalize("NFC")
  }
  const bySlug = getPlayerSlugEntryBySlug(decoded)
  if (bySlug) return bySlug
  if (/^\d+$/.test(decoded)) {
    const npbPlayerId = resolveNpbPlayerIdFromPublicId(decoded)
    return getPlayerSlugEntryByNpbId(npbPlayerId) ?? getPlayerSlugEntryByNpbId(decoded)
  }
  const index = buildSlugIndex()
  const nameKey = rosterNameMatchKey(decoded)
  const byName = index.byNameKey.get(nameKey) ?? index.byNameKey.get(compactPlayerName(decoded))
  if (byName) return byName
  const romanKey = compactPlayerName(decoded).toLowerCase()
  if (romanKey) {
    const byRoman = index.byRomanKey.get(romanKey)
    if (byRoman) return byRoman
  }
  return null
}

export function playerCanonicalPathFromPublicId(
  raw: string,
  section: PlayerPageSection = "basic",
): string | null {
  const entry = resolvePlayerSlugEntry(raw)
  if (!entry) return null
  return playerPagePath(entry.slug, section)
}

export function supportsPitchTypeRoute(entry: PlayerSlugEntry): boolean {
  return entry.position.trim().includes("投")
}
