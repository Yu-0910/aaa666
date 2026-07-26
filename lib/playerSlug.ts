import { CURRENT_ROSTER_PLAYER_SLUGS } from "@/lib/currentRosterPlayerSlugs"
import { CURRENT_ROSTER_PLAYER_ENTRIES } from "@/lib/currentRosterPlayerEntries"
import {
  historicalSlugOverrideById,
  historicalSlugOverrideByName,
  historicalSlugOverrideByRoman,
} from "@/lib/historicalPlayerSlugOverrides"
import { compactPlayerName, rosterNameMatchKey } from "@/lib/playerNameNormalize"
import { MANUAL_YAHOO_TO_NPB } from "@/lib/yahooNpbBatterIdMap.manual"

export type PlayerPageSection =
  | "basic"
  | "pitch"
  | "situation"
  | "matchup"
  | "vs-team"
  | "catcher"
  | "advanced"
  | "splits"
  | "game-log"
  | "pitch-types"

export type PlayerLinkIds = {
  npbPlayerId?: string
  playerId?: string
  name?: string
  romanName?: string
}

function romanSlugTokens(romanName: string): string[] {
  const normalized = String(romanName ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’]/g, " ")
    .replace(/[^A-Za-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!normalized) return []
  const tokens = normalized.split(" ").filter(Boolean)
  if (tokens.length === 0) return []
  if (tokens.length === 1) return [tokens[0]!]
  const [family, ...givenParts] = tokens
  return [...givenParts, family]
}

export function slugifyPlayerRomanName(romanName: string): string {
  const tokens = romanSlugTokens(romanName)
  if (tokens.length === 0) return ""
  return tokens.map((token) => token.toLowerCase()).join("-")
}

export function formatPlayerRomanSlug(romanName: string): string {
  const tokens = romanSlugTokens(romanName)
  if (tokens.length === 0) return ""
  return tokens
    .map((token) => {
      const lower = token.toLowerCase()
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`
    })
    .join("-")
}

const currentRosterSlugByName = new Map<string, string>()
const currentRosterSlugByRoman = new Map<string, string>()
const currentRosterSlugByNpbId = new Map<string, string>()

for (const entry of CURRENT_ROSTER_PLAYER_ENTRIES) {
  const npbPlayerId = String(entry.npbPlayerId ?? "").trim()
  if (npbPlayerId && entry.slug) currentRosterSlugByNpbId.set(npbPlayerId, entry.slug)
  const name = String(entry.nameJa ?? "").trim()
  if (name) {
    currentRosterSlugByName.set(rosterNameMatchKey(name), entry.slug)
    currentRosterSlugByName.set(compactPlayerName(name), entry.slug)
  }
  const romanSlug = slugifyPlayerRomanName(entry.romanFull)
  if (romanSlug) currentRosterSlugByRoman.set(romanSlug, entry.slug)
}

export function playerPagePath(slug: string, section: PlayerPageSection = "basic"): string {
  const cleanSlug = String(slug ?? "").trim().replace(/^\/+|\/+$/g, "")
  if (!cleanSlug) return "/players/unknown-player"
  const base = `/players/${encodeURIComponent(cleanSlug)}`
  if (section === "basic") return base
  return `${base}/${section}`
}

export function playerPagePathSegment(link: PlayerLinkIds): string {
  const publicId = String(link.playerId ?? "").trim()
  const npbIdCandidates = [
    String(link.npbPlayerId ?? "").trim(),
    MANUAL_YAHOO_TO_NPB[publicId]?.trim() ?? "",
    publicId,
  ].filter(Boolean)
  for (const npbId of npbIdCandidates) {
    const rosterSlug = CURRENT_ROSTER_PLAYER_SLUGS[npbId] ?? currentRosterSlugByNpbId.get(npbId)
    if (rosterSlug) return rosterSlug
  }
  const currentRosterNameSlug =
    currentRosterSlugByName.get(rosterNameMatchKey(link.name ?? "")) ??
    currentRosterSlugByName.get(compactPlayerName(link.name ?? ""))
  if (currentRosterNameSlug) return currentRosterNameSlug
  const currentRosterRomanSlug = currentRosterSlugByRoman.get(slugifyPlayerRomanName(link.romanName || ""))
  if (currentRosterRomanSlug) return currentRosterRomanSlug
  const historicalSlug =
    historicalSlugOverrideByName(link.name)?.slug ?? historicalSlugOverrideByRoman(link.romanName)?.slug
  if (historicalSlug) return historicalSlug
  for (const npbId of npbIdCandidates) {
    const historicalIdSlug = historicalSlugOverrideById(npbId)?.slug
    if (historicalIdSlug) return historicalIdSlug
  }
  const slug = slugifyPlayerRomanName(link.romanName || "")
  if (slug) return slug
  return String(link.name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .trim() || "unknown-player"
}

export function playerPageHref(
  link: PlayerLinkIds,
  section: PlayerPageSection = "basic",
): string {
  return playerPagePath(playerPagePathSegment(link), section)
}

export function resolvePlayerPageSectionFromLegacyTab(tab: string | null | undefined): PlayerPageSection {
  switch (String(tab ?? "").trim().toLowerCase()) {
    case "advanced":
      return "advanced"
    case "splits":
    case "situation":
      return "splits"
    case "game-log":
    case "gamelog":
    case "game_log":
      return "game-log"
    case "pitch-types":
    case "pitch":
      return "pitch-types"
    default:
      return "basic"
  }
}

export function playerPageSectionHeading(nameJa: string, section: PlayerPageSection): string {
  switch (section) {
    case "pitch":
      return `${nameJa} 球種情報 2026`
    case "situation":
      return `${nameJa} 状況別成績 2026`
    case "matchup":
      return `${nameJa} 対戦成績 2026`
    case "vs-team":
      return `${nameJa} 球団別成績 2026`
    case "catcher":
      return `${nameJa} 捕手成績 2026`
    case "advanced":
      return `${nameJa} 詳細成績 2026`
    case "splits":
      return `${nameJa} 状況別成績 2026`
    case "game-log":
      return `${nameJa} 試合別成績 2026`
    case "pitch-types":
      return `${nameJa} 球種情報 2026`
    default:
      return `${nameJa} 2026 成績`
  }
}

export function playerPageSectionTitle(nameJa: string, section: PlayerPageSection): string {
  switch (section) {
    case "pitch":
      return `${nameJa} 球種情報 2026 | Short-Stop`
    case "situation":
      return `${nameJa} 状況別成績 2026 | Short-Stop`
    case "matchup":
      return `${nameJa} 対戦成績 2026 | Short-Stop`
    case "vs-team":
      return `${nameJa} 球団別成績 2026 | Short-Stop`
    case "catcher":
      return `${nameJa} 捕手成績 2026 | Short-Stop`
    case "advanced":
      return `${nameJa} 詳細成績 2026 | Short-Stop`
    case "splits":
      return `${nameJa} 状況別成績 2026 | Short-Stop`
    case "game-log":
      return `${nameJa} 試合別成績 2026 | Short-Stop`
    case "pitch-types":
      return `${nameJa} 球種情報 2026 | Short-Stop`
    default:
      return `${nameJa} 成績 2026 | Short-Stop`
  }
}

export function playerPageSectionDescription(nameJa: string, section: PlayerPageSection): string {
  switch (section) {
    case "pitch":
      return `${nameJa}の2026年球種情報を掲載。球種割合、平均球速、球種別成績、空振り率などを確認できます。`
    case "situation":
      return `${nameJa}の2026年状況別成績を掲載。対右、対左、得点圏、月別成績などを確認できます。`
    case "matchup":
      return `${nameJa}の2026年対戦成績を掲載。対戦相手別の成績を確認できます。`
    case "vs-team":
      return `${nameJa}の2026年球団別成績を掲載。相手球団ごとの成績を確認できます。`
    case "catcher":
      return `${nameJa}の2026年捕手成績を掲載。捕手関連の派生成績を確認できます。`
    case "advanced":
      return `${nameJa}の2026年詳細成績を掲載。OPS、出塁率、長打率、K-BB%、WHIPなどの指標を確認できます。`
    case "splits":
      return `${nameJa}の2026年状況別成績を掲載。対右、対左、得点圏、月別成績などを確認できます。`
    case "game-log":
      return `${nameJa}の2026年試合別成績を掲載。日付ごとの成績推移を確認できます。`
    case "pitch-types":
      return `${nameJa}の2026年球種情報を掲載。球種割合、平均球速、球種別成績、空振り率などを確認できます。`
    default:
      return `${nameJa}の2026年プロ野球成績を掲載。打率、本塁打、打点、OPS、防御率、奪三振などを確認できます。`
  }
}
