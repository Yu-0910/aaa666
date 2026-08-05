import type { Metadata } from "next"
import { permanentRedirect } from "next/navigation"
import {
  playerPageSectionDescription,
  playerPageSectionHeading,
  playerPageSectionTitle,
  type PlayerPageSection,
} from "@/lib/playerSlug"
import {
  isPlayerPageTabUrlSegmentSupportedForAudience,
  playerPageTabUrlPath,
  resolvePlayerPageTabUrlSegment,
  resolvePlayerPageTabUrlSegmentFromLegacy,
  type PlayerPageTabUrlSegment,
} from "@/lib/playerPageTabUrlPhase2"
import {
  resolvePlayerSlugEntry,
  type PlayerSlugEntry,
} from "@/lib/playerSlug.server"
import {
  isCatcherRegistrationPosition,
  isPitcherRegistrationPosition,
} from "@/lib/rosterPitcher"

export type PlayerRouteResolved = {
  entry: PlayerSlugEntry
  pageSection: PlayerPageSection
}

function buildFallbackEntry(rawPlayerId: string): PlayerSlugEntry {
  const raw = String(rawPlayerId ?? "").trim()
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw).normalize("NFC")
  } catch {
    decoded = raw.normalize("NFC")
  }
  return {
    npbPlayerId: "",
    nameJa: decoded || "選手",
    romanFull: "",
    position: "",
    teamCode: "",
    slug: raw || "unknown-player",
  }
}

function resolveAudienceForEntry(entry: PlayerSlugEntry): "pitcher" | "fielder" | "catcher" {
  if (isPitcherRegistrationPosition(entry.position, { rosterNpbPlayerId: entry.npbPlayerId })) {
    return "pitcher"
  }
  if (isCatcherRegistrationPosition(entry.position)) {
    return "catcher"
  }
  return "fielder"
}

function normalizeCanonicalSegmentForEntry(
  entry: PlayerSlugEntry,
  segment: PlayerPageTabUrlSegment,
): PlayerPageTabUrlSegment {
  return isPlayerPageTabUrlSegmentSupportedForAudience(resolveAudienceForEntry(entry), segment)
    ? segment
    : "basic"
}

function redirectIfNeeded(
  rawPlayerId: string,
  entry: PlayerSlugEntry,
  pageSection: PlayerPageSection,
  rest?: string[],
  searchParams?: Record<string, string | string[] | undefined>,
): void {
  const currentTab = String(searchParams?.tab ?? "").trim()
  const restKey = String(rest?.[rest.length - 1] ?? "").trim().toLowerCase()
  const fromLegacyQuery = currentTab && pageSection === "basic"
  const targetSectionRaw = fromLegacyQuery
    ? resolvePlayerPageTabUrlSegmentFromLegacy(currentTab)
    : restKey
      ? resolvePlayerPageTabUrlSegmentFromLegacy(restKey)
      : (pageSection as PlayerPageTabUrlSegment)
  const targetSection = normalizeCanonicalSegmentForEntry(entry, targetSectionRaw)
  const targetPath = playerPageTabUrlPath(entry.slug, targetSection)
  const search = new URLSearchParams()
  let droppedLegacyParam = false
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (key === "tab" || key === "roman" || key === "name" || key === "publicId") {
      droppedLegacyParam = true
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item)
    } else if (value != null && value !== "") {
      search.set(key, value)
    }
  }
  let rawClean = String(rawPlayerId ?? "").trim()
  try {
    rawClean = decodeURIComponent(rawClean)
  } catch {
    rawClean = String(rawPlayerId ?? "").trim()
  }
  const isCanonicalSegment = rawClean === entry.slug
  const hasLegacySearchTab = Boolean(currentTab)
  const hasRest = restKey.length > 0
  const isCanonicalRest = !hasRest || restKey === targetSection
  const usedLegacyRest = hasRest && resolvePlayerPageTabUrlSegment(rest) !== restKey
  if (isCanonicalSegment && isCanonicalRest && !hasLegacySearchTab && !droppedLegacyParam && !usedLegacyRest) {
    return
  }
  const suffix = search.toString()
  permanentRedirect(suffix ? `${targetPath}?${suffix}` : targetPath)
}

export function resolvePlayerRouteOrRedirect(options: {
  /** Next route param name is still `playerId`, but it now receives a slug or a legacy player URL segment. */
  playerId: string
  rest?: string[]
  searchParams?: Record<string, string | string[] | undefined>
}): PlayerRouteResolved {
  const { playerId, rest, searchParams } = options
  const legacyRoot = String(playerId ?? "").trim()
  const legacyAlias = String(rest?.[0] ?? "").trim()
  const section = resolvePlayerPageTabUrlSegment(rest)
  const entry =
    resolvePlayerSlugEntry(legacyRoot) ??
    resolvePlayerSlugEntry(legacyAlias) ??
    buildFallbackEntry(legacyRoot || legacyAlias)
  const normalizedSection = entry.npbPlayerId
    ? normalizeCanonicalSegmentForEntry(entry, section)
    : section
  if (entry.npbPlayerId) {
    redirectIfNeeded(legacyRoot || legacyAlias, entry, normalizedSection, rest, searchParams)
  }
  return { entry, pageSection: normalizedSection }
}

export function metadataForResolvedPlayerRoute(resolved: PlayerRouteResolved): Metadata {
  const indexesAsDedicatedPage = resolved.pageSection === "basic"
  const canonicalSection = indexesAsDedicatedPage ? resolved.pageSection : "basic"
  return {
    title: playerPageSectionTitle(resolved.entry.nameJa, resolved.pageSection),
    description: playerPageSectionDescription(resolved.entry.nameJa, resolved.pageSection),
    alternates: {
      canonical: `https://short-stop.jp${playerPageTabUrlPath(
        resolved.entry.slug,
        canonicalSection as PlayerPageTabUrlSegment,
      )}`,
    },
    robots: indexesAsDedicatedPage
      ? undefined
      : {
          index: false,
          follow: true,
        },
  }
}

export function headingForResolvedPlayerRoute(resolved: PlayerRouteResolved): string {
  return playerPageSectionHeading(resolved.entry.nameJa, resolved.pageSection)
}
