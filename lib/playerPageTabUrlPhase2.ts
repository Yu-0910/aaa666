import type { PlayerPageSection } from "@/lib/playerSlug"
import type {
  FielderSeasonDetailTab,
  PitcherSeasonSubTab,
} from "@/lib/playerMatchupSeasonTab"
import {
  getPlayerPagePhase1RowsForAudience,
  type PlayerPageTabUrlAudience,
  type PlayerPageUrlTargetTab,
} from "@/lib/playerPageTabUrlPhase1"

export type PlayerPageTabUrlSegment = PlayerPageUrlTargetTab

export const PLAYER_PAGE_TAB_URL_SEGMENTS = [
  "basic",
  "pitch",
  "situation",
  "matchup",
  "vs-team",
  "catcher",
] as const satisfies readonly PlayerPageTabUrlSegment[]

export const PLAYER_PAGE_TAB_URL_LEGACY_SEGMENT_ALIASES = {
  pitch: "pitch",
  "pitch-types": "pitch",
  situation: "situation",
  splits: "situation",
  matchup: "matchup",
  "vs-team": "vs-team",
  vs_team: "vs-team",
  vsteam: "vs-team",
  catcher: "catcher",
  basic: "basic",
  advanced: "basic",
  "game-log": "basic",
  gamelog: "basic",
  game_log: "basic",
} as const satisfies Record<string, PlayerPageTabUrlSegment>

/**
 * Phase 2:
 * 新 URL セグメントは既存の今季タブ state にだけ対応づける。
 * 無効セグメントは base URL 扱いで "basic" に戻す。
 */
export function resolvePlayerPageTabUrlSegment(
  rest: string[] | undefined,
): PlayerPageTabUrlSegment {
  const key = String(rest?.[rest.length - 1] ?? "")
    .trim()
    .toLowerCase()
  if (!key) return "basic"
  return PLAYER_PAGE_TAB_URL_SEGMENTS.includes(key as PlayerPageTabUrlSegment)
    ? (key as PlayerPageTabUrlSegment)
    : "basic"
}

/**
 * 旧クエリ・旧パスの互換読み替え。
 * "advanced" や "game-log" は新規 canonical にはせず、basic に吸収する。
 */
export function resolvePlayerPageTabUrlSegmentFromLegacy(
  value: string | null | undefined,
): PlayerPageTabUrlSegment {
  const key = String(value ?? "").trim().toLowerCase()
  if (!key) return "basic"
  return PLAYER_PAGE_TAB_URL_LEGACY_SEGMENT_ALIASES[key] ?? "basic"
}

export function playerPageTabUrlPath(
  slug: string,
  segment: PlayerPageTabUrlSegment = "basic",
): string {
  const cleanSlug = String(slug ?? "").trim().replace(/^\/+|\/+$/g, "")
  if (!cleanSlug) return "/players/unknown-player"
  const base = `/players/${encodeURIComponent(cleanSlug)}`
  return segment === "basic" ? base : `${base}/${segment}`
}

export function isPlayerPageTabUrlSegmentSupportedForAudience(
  audience: PlayerPageTabUrlAudience,
  segment: PlayerPageTabUrlSegment,
): boolean {
  return getPlayerPagePhase1RowsForAudience(audience).some((row) => row.urlTarget === segment)
}

export function resolvePitcherSeasonSubTabFromUrlSegment(
  segment: PlayerPageTabUrlSegment,
): PitcherSeasonSubTab {
  switch (segment) {
    case "pitch":
      return "pitch"
    case "situation":
      return "situation"
    case "matchup":
      return "matchup"
    default:
      return "basic"
  }
}

export function resolveUrlSegmentFromPitcherSeasonSubTab(
  tab: PitcherSeasonSubTab,
): PlayerPageTabUrlSegment {
  switch (tab) {
    case "pitch":
      return "pitch"
    case "situation":
      return "situation"
    case "matchup":
      return "matchup"
    default:
      return "basic"
  }
}

export function resolveFielderSeasonDetailTabFromUrlSegment(
  segment: PlayerPageTabUrlSegment,
  showCatcherSeasonTab: boolean,
): FielderSeasonDetailTab {
  switch (segment) {
    case "pitch":
      return "pitch"
    case "situation":
      return "situation"
    case "matchup":
      return "matchup"
    case "vs-team":
      return "vs_team_pitch"
    case "catcher":
      return showCatcherSeasonTab ? "catcher" : "basic"
    default:
      return "basic"
  }
}

export function resolveUrlSegmentFromFielderSeasonDetailTab(
  tab: FielderSeasonDetailTab,
): PlayerPageTabUrlSegment {
  switch (tab) {
    case "pitch":
      return "pitch"
    case "situation":
      return "situation"
    case "matchup":
      return "matchup"
    case "vs_team_pitch":
      return "vs-team"
    case "catcher":
      return "catcher"
    default:
      return "basic"
  }
}

/**
 * Phase 4:
 * ルーティングで受理した section 名を、今季サブタブ同期用の canonical セグメントへ寄せる。
 */
export function normalizePlayerPageSectionForTabSync(
  section: PlayerPageSection,
): PlayerPageTabUrlSegment {
  switch (section) {
    case "pitch":
    case "situation":
    case "matchup":
    case "vs-team":
    case "catcher":
      return section
    case "pitch-types":
      return "pitch"
    case "splits":
      return "situation"
    default:
      return "basic"
  }
}
