import type { Metadata } from "next"
import { permanentRedirect } from "next/navigation"
import {
  playerPagePath,
  playerPageSectionDescription,
  playerPageSectionHeading,
  playerPageSectionTitle,
  resolvePlayerPageSectionFromLegacyTab,
  type PlayerPageSection,
} from "@/lib/playerSlug"
import {
  resolvePlayerSlugEntry,
  supportsPitchTypeRoute,
  type PlayerSlugEntry,
} from "@/lib/playerSlug.server"

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

function advancedPageUsesDedicatedContent(_resolved: PlayerRouteResolved): boolean {
  return false
}

function normalizeRestSection(rest: string[] | undefined): PlayerPageSection {
  const section = String(rest?.[rest.length - 1] ?? "").trim().toLowerCase()
  switch (section) {
    case "":
      return "basic"
    case "advanced":
      return "advanced"
    case "splits":
      return "splits"
    case "game-log":
      return "game-log"
    case "pitch-types":
      return "pitch-types"
    default:
      return "basic"
  }
}

function redirectIfNeeded(
  rawPlayerId: string,
  entry: PlayerSlugEntry,
  pageSection: PlayerPageSection,
  searchParams?: Record<string, string | string[] | undefined>,
): void {
  const currentTab = String(searchParams?.tab ?? "").trim()
  const targetSection =
    currentTab && pageSection === "basic"
      ? resolvePlayerPageSectionFromLegacyTab(currentTab)
      : pageSection
  const targetPath = playerPagePath(entry.slug, targetSection)
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
  if (isCanonicalSegment && !hasLegacySearchTab && !droppedLegacyParam) return
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
  const section = normalizeRestSection(rest)
  const entry =
    resolvePlayerSlugEntry(legacyRoot) ??
    resolvePlayerSlugEntry(legacyAlias) ??
    buildFallbackEntry(legacyRoot || legacyAlias)
  if (entry.npbPlayerId && section === "pitch-types" && !supportsPitchTypeRoute(entry)) {
    permanentRedirect(playerPagePath(entry.slug))
  }
  if (entry.npbPlayerId) {
    redirectIfNeeded(legacyRoot || legacyAlias, entry, section, searchParams)
  }
  return { entry, pageSection: section }
}

export function metadataForResolvedPlayerRoute(resolved: PlayerRouteResolved): Metadata {
  const advancedIsDuplicate =
    resolved.pageSection === "advanced" && !advancedPageUsesDedicatedContent(resolved)
  const canonicalSection = advancedIsDuplicate ? "basic" : resolved.pageSection
  return {
    title: playerPageSectionTitle(resolved.entry.nameJa, resolved.pageSection),
    description: playerPageSectionDescription(resolved.entry.nameJa, resolved.pageSection),
    alternates: {
      canonical: `https://short-stop.jp${playerPagePath(resolved.entry.slug, canonicalSection)}`,
    },
    robots: advancedIsDuplicate
      ? {
          index: false,
          follow: true,
        }
      : undefined,
  }
}

export function headingForResolvedPlayerRoute(resolved: PlayerRouteResolved): string {
  return playerPageSectionHeading(resolved.entry.nameJa, resolved.pageSection)
}
