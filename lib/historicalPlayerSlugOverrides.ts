import { compactPlayerName, rosterNameMatchKey } from "@/lib/playerNameNormalize"
import { HISTORICAL_PLAYER_DISAMBIGUATED_SLUGS } from "@/lib/historicalPlayerSlugDisambiguation.generated"
import historicalPlayerSlugOverrides from "@/lib/historicalPlayerSlugOverrides.generated.json"

export type HistoricalPlayerSlugOverride = {
  npbPlayerId: string
  nameJa: string
  romanFull: string
  position: string
  teamCode: string
  slug: string
  legacySlugs: string[]
}

type HistoricalPlayerSlugOverrideTuple = [
  npbPlayerId: string,
  nameJa: string,
  romanFull: string,
  position: string,
  slug: string,
  legacySlugs: string[],
]

const historicalOverridesBase = (historicalPlayerSlugOverrides as HistoricalPlayerSlugOverrideTuple[]).map(
  ([npbPlayerId, nameJa, romanFull, position, slug, legacySlugs]) => ({
    npbPlayerId,
    nameJa,
    romanFull,
    position,
    teamCode: "",
    slug,
    legacySlugs,
  }),
)

export const HISTORICAL_PLAYER_SLUG_OVERRIDES = historicalOverridesBase.map(
  (override): HistoricalPlayerSlugOverride => {
    const slug = HISTORICAL_PLAYER_DISAMBIGUATED_SLUGS[override.npbPlayerId] ?? override.slug
    return {
      ...override,
      slug,
    }
  },
)

function romanSlug(value: string): string {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’]/g, " ")
    .replace(/[^A-Za-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!normalized) return ""
  const tokens = normalized.split(" ").filter(Boolean)
  if (tokens.length === 0) return ""
  if (tokens.length === 1) return tokens[0]!.toLowerCase()
  const [family, ...givenParts] = tokens
  return [...givenParts, family].map((token) => token.toLowerCase()).join("-")
}

const byNpbPlayerId = new Map<string, HistoricalPlayerSlugOverride>()
const byNameKey = new Map<string, HistoricalPlayerSlugOverride>()
const bySlug = new Map<string, HistoricalPlayerSlugOverride>()
const byRomanKey = new Map<string, HistoricalPlayerSlugOverride>()

for (const [index, override] of HISTORICAL_PLAYER_SLUG_OVERRIDES.entries()) {
  byNpbPlayerId.set(override.npbPlayerId, override)
  byNameKey.set(rosterNameMatchKey(override.nameJa), override)
  byNameKey.set(compactPlayerName(override.nameJa), override)
  bySlug.set(override.slug, override)
  for (const legacySlug of override.legacySlugs) {
    bySlug.set(legacySlug, override)
  }
  const fullRomanSlug = romanSlug(override.romanFull)
  if (fullRomanSlug && !bySlug.has(fullRomanSlug)) bySlug.set(fullRomanSlug, override)
  const originalSlug = historicalOverridesBase[index]?.slug ?? ""
  if (originalSlug && !bySlug.has(originalSlug)) bySlug.set(originalSlug, override)
  const romanKey = compactPlayerName(override.romanFull).toLowerCase()
  if (romanKey) byRomanKey.set(romanKey, override)
}

export function historicalSlugOverrideById(id: string | undefined): HistoricalPlayerSlugOverride | undefined {
  const clean = String(id ?? "").trim()
  if (!clean) return undefined
  return byNpbPlayerId.get(clean)
}

export function historicalSlugOverrideByName(name: string | undefined): HistoricalPlayerSlugOverride | undefined {
  const clean = String(name ?? "").trim()
  if (!clean) return undefined
  return byNameKey.get(rosterNameMatchKey(clean)) ?? byNameKey.get(compactPlayerName(clean))
}

export function historicalSlugOverrideBySlug(slug: string | undefined): HistoricalPlayerSlugOverride | undefined {
  const clean = String(slug ?? "").trim().toLowerCase()
  if (!clean) return undefined
  return bySlug.get(clean)
}

export function historicalSlugOverrideByRoman(romanName: string | undefined): HistoricalPlayerSlugOverride | undefined {
  const clean = String(romanName ?? "").trim()
  if (!clean) return undefined
  return bySlug.get(romanSlug(clean)) ?? byRomanKey.get(compactPlayerName(clean).toLowerCase())
}

export function historicalSlugOverrideForLink(link: {
  npbPlayerId?: string
  playerId?: string
  name?: string
  romanName?: string
}): string | undefined {
  return (
    historicalSlugOverrideById(link.npbPlayerId)?.slug ??
    historicalSlugOverrideByName(link.name)?.slug ??
    historicalSlugOverrideByRoman(link.romanName)?.slug
  )
}
