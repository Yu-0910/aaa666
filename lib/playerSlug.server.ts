import fs from "node:fs"
import path from "node:path"
import { getProjectRoot } from "@/lib/projectRoot"
import { compactPlayerName, rosterNameMatchKey } from "@/lib/playerNameNormalize"
import { slugifyPlayerRomanName, type PlayerPageSection, playerPagePath } from "@/lib/playerSlug"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"

type RawPlayerSeed = {
  npbPlayerId: string
  nameJa: string
  romanFull: string
  birthYear: string
  position: string
  teamCode: string
  hasCareerPitching: boolean
  hasCareerBatting: boolean
}

export type PlayerSlugEntry = RawPlayerSeed & {
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

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === "\"") {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && char === ",") {
      out.push(current)
      current = ""
      continue
    }
    current += char
  }
  out.push(current)
  return out
}

function readRosterSeeds(): Map<string, RawPlayerSeed> {
  const rosterPath = path.join(getProjectRoot(), "_data", "npb_roster_2026.csv")
  const map = new Map<string, RawPlayerSeed>()
  if (!fs.existsSync(rosterPath)) return map
  const lines = fs.readFileSync(rosterPath, "utf8").split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return map
  const header = splitCsvLine(lines[0]!).map((value) => value.trim().replace(/^\ufeff/, ""))
  const idx = (name: string) => header.indexOf(name)
  const iId = idx("npb_player_id")
  const iJa = idx("name_ja")
  const iEn = idx("name_en")
  const iEnFull = idx("name_en_full")
  const iTeamCode = idx("team_code")
  const iPosition = idx("position")
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line)
    const npbPlayerId = String(cols[iId] ?? "").trim()
    const nameJa = String(cols[iJa] ?? "").trim()
    if (!npbPlayerId || !nameJa) continue
    map.set(npbPlayerId, {
      npbPlayerId,
      nameJa,
      romanFull: String(cols[iEnFull] ?? cols[iEn] ?? "").trim(),
      birthYear: "",
      position: String(cols[iPosition] ?? "").trim(),
      teamCode: String(cols[iTeamCode] ?? "").trim(),
      hasCareerPitching: false,
      hasCareerBatting: false,
    })
  }
  return map
}

function readMergedSeeds(existing: Map<string, RawPlayerSeed>): Map<string, RawPlayerSeed> {
  const mergedDir = path.join(getProjectRoot(), "_data", "derived", "player_profile", "merged")
  const metaDir = path.join(getProjectRoot(), "_data", "derived", "npb_player_meta")
  if (!fs.existsSync(mergedDir)) return existing
  for (const fileName of fs.readdirSync(mergedDir)) {
    if (!fileName.endsWith(".json")) continue
    const fullPath = path.join(mergedDir, fileName)
    try {
      const json = JSON.parse(fs.readFileSync(fullPath, "utf8")) as Record<string, unknown>
      const npbPlayerId = String(
        json.npb_player_id ??
          fileName.replace(/^npb_/, "").replace(/\.json$/, ""),
      ).trim()
      if (!/^\d+$/.test(npbPlayerId)) continue
      const current = existing.get(npbPlayerId) ?? {
        npbPlayerId,
        nameJa: "",
        romanFull: "",
        birthYear: "",
        position: "",
        teamCode: "",
        hasCareerPitching: false,
        hasCareerBatting: false,
      }
      const metaFile = path.join(metaDir, `${npbPlayerId}.json`)
      let romanFull = current.romanFull
      if (fs.existsSync(metaFile)) {
        const meta = JSON.parse(fs.readFileSync(metaFile, "utf8")) as {
          roman?: { name_en_full?: string }
        }
        romanFull = String(meta.roman?.name_en_full ?? romanFull).trim()
      }
      const birthDateRaw = String(
        (json.profile as { birth_date_raw?: string } | undefined)?.birth_date_raw ?? "",
      ).trim()
      const birthYear = birthDateRaw.match(/^(\d{4})年/)?.[1] ?? current.birthYear
      existing.set(npbPlayerId, {
        ...current,
        npbPlayerId,
        nameJa: String(json.name_ja ?? current.nameJa).trim(),
        romanFull,
        birthYear,
        hasCareerPitching:
          current.hasCareerPitching ||
          Array.isArray((json.career_pitching as { rows?: unknown[] } | null | undefined)?.rows),
        hasCareerBatting:
          current.hasCareerBatting ||
          Array.isArray((json.career_batting as { rows?: unknown[] } | null | undefined)?.rows),
      })
    } catch {
      // ignore malformed profile
    }
  }
  return existing
}

function buildSlugIndex(): PlayerSlugIndex {
  if (cachedIndex) return cachedIndex
  const seeds = readMergedSeeds(readRosterSeeds())
  const grouped = new Map<string, RawPlayerSeed[]>()
  for (const seed of seeds.values()) {
    const baseSlug = slugifyPlayerRomanName(seed.romanFull)
    if (!baseSlug || !seed.nameJa) continue
    const bucket = grouped.get(baseSlug) ?? []
    bucket.push(seed)
    grouped.set(baseSlug, bucket)
  }
  const entries: PlayerSlugEntry[] = []
  for (const [baseSlug, bucket] of grouped) {
    if (bucket.length === 1) {
      entries.push({ ...bucket[0]!, slug: baseSlug })
      continue
    }
    const byBirth = new Map<string, RawPlayerSeed[]>()
    for (const seed of bucket) {
      const key = seed.birthYear || ""
      const list = byBirth.get(key) ?? []
      list.push(seed)
      byBirth.set(key, list)
    }
    for (const [birthYear, birthBucket] of byBirth) {
      if (birthBucket.length === 1 && birthYear) {
        entries.push({ ...birthBucket[0]!, slug: `${baseSlug}-${birthYear}` })
        continue
      }
      for (const seed of birthBucket) {
        const suffix = seed.npbPlayerId.slice(-2)
        const slug = birthYear ? `${baseSlug}-${birthYear}-${suffix}` : `${baseSlug}-${suffix}`
        entries.push({ ...seed, slug })
      }
    }
  }
  entries.sort((a, b) => a.slug.localeCompare(b.slug, "en"))
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
  const position = entry.position.trim()
  if (position.includes("投")) return true
  return entry.hasCareerPitching && !entry.hasCareerBatting
}
