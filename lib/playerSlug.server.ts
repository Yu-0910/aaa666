import fs from "node:fs"
import { CURRENT_ROSTER_PLAYER_ENTRIES } from "@/lib/currentRosterPlayerEntries"
import { derivedLocalPath, readDerivedJsonLocalSync } from "@/lib/derived/fetchDerivedJsonServer"
import { compactPlayerName, rosterNameMatchKey } from "@/lib/playerNameNormalize"
import { resolveNonRosterNameEnFull } from "@/lib/playerRomanFromKana"
import { type PlayerPageSection, playerPagePath, slugifyPlayerRomanName } from "@/lib/playerSlug"
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

const LEGACY_PLAYER_SLUG_ALIASES: Record<string, string> = {
  "sato-t": "teruaki-sato",
}

type NonRosterMergedPayload = {
  npb_player_id?: string
  name_ja?: string
  meta?: { registration_position?: string }
}

type NonRosterMetaRoman = {
  player_id?: string
  npb_player_id?: string
  name_ja?: string
  name_kana?: string
  roman?: { name_en_full?: string; name_en_short?: string }
}

function abbreviatedRomanFromFull(romanFull: string): string {
  const slug = slugifyPlayerRomanName(romanFull)
  const parts = slug.split("-").filter(Boolean)
  if (parts.length < 2) return ""
  const given = parts[0] ?? ""
  const surname = parts[parts.length - 1] ?? ""
  if (!given || !surname) return ""
  return `${surname}-${given[0]}`
}

function buildSlugIndex(): PlayerSlugIndex {
  if (cachedIndex) return cachedIndex
  const entries = [...CURRENT_ROSTER_PLAYER_ENTRIES]
  const byKnownNpbId = new Set(entries.map((entry) => entry.npbPlayerId))
  try {
    const mergedDir = derivedLocalPath("player_profile", "merged")
    const fileNames = fs.readdirSync(mergedDir)
    for (const fileName of fileNames) {
      if (!fileName.endsWith(".json")) continue
      const rawId = fileName.replace(/^npb_/, "").replace(/\.json$/i, "").trim()
      if (!/^\d+$/.test(rawId) || byKnownNpbId.has(rawId)) continue
      const merged =
        readDerivedJsonLocalSync<NonRosterMergedPayload>("player_profile", "merged", fileName) ?? null
      const meta =
        readDerivedJsonLocalSync<NonRosterMetaRoman>("npb_player_meta", `${rawId}.json`) ??
        readDerivedJsonLocalSync<NonRosterMetaRoman>("npb_player_meta", `npb_${rawId}.json`)
      const nameJa = String(merged?.name_ja ?? meta?.name_ja ?? "").trim()
      const romanFull = resolveNonRosterNameEnFull(meta).trim()
      const slug = slugifyPlayerRomanName(romanFull)
      if (!nameJa || !slug) continue
      entries.push({
        npbPlayerId: rawId,
        nameJa,
        romanFull,
        position: String(merged?.meta?.registration_position ?? "").trim(),
        teamCode: "",
        slug,
      })
    }
  } catch {
    // local derived data が無い環境では 2026名簿のみで継続
  }
  const bySlug = new Map<string, PlayerSlugEntry>()
  const byNpbId = new Map<string, PlayerSlugEntry>()
  const byNameKey = new Map<string, PlayerSlugEntry>()
  const byRomanKey = new Map<string, PlayerSlugEntry>()
  for (const entry of entries) {
    bySlug.set(entry.slug, entry)
    const abbreviatedSlug = slugifyPlayerRomanName(abbreviatedRomanFromFull(entry.romanFull))
    if (abbreviatedSlug && !bySlug.has(abbreviatedSlug)) {
      bySlug.set(abbreviatedSlug, entry)
    }
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
  const aliasSlug = LEGACY_PLAYER_SLUG_ALIASES[decoded.toLowerCase()]?.trim()
  if (aliasSlug) {
    const aliased = getPlayerSlugEntryBySlug(aliasSlug)
    if (aliased) return aliased
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
