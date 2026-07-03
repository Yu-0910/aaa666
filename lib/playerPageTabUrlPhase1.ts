import type { PlayerPageSection } from "@/lib/playerSlug"

export type PlayerPageUrlTargetTab =
  | "basic"
  | "pitch"
  | "situation"
  | "matchup"
  | "vs-team"
  | "catcher"

export type PlayerPageTabUrlAudience = "pitcher" | "fielder" | "catcher"

export type PlayerPagePhase1UrlRow = {
  audience: PlayerPageTabUrlAudience
  urlTarget: PlayerPageUrlTargetTab
  label: string
  currentUiState: string
  plannedPath: string
}

/**
 * Phase 1 棚卸し:
 * 現行 UI で正とする「今季」サブタブと、計画書上の将来 URL セグメント名を固定する。
 * ここでは UI を変えず、対応表だけを単一ソース化する。
 */
export const PLAYER_PAGE_PHASE1_URL_ROWS: readonly PlayerPagePhase1UrlRow[] = [
  {
    audience: "pitcher",
    urlTarget: "basic",
    label: "基本成績",
    currentUiState: "pitcherSeasonSubTab=basic",
    plannedPath: "/players/{slug}",
  },
  {
    audience: "pitcher",
    urlTarget: "pitch",
    label: "球種情報",
    currentUiState: "pitcherSeasonSubTab=pitch",
    plannedPath: "/players/{slug}/pitch",
  },
  {
    audience: "pitcher",
    urlTarget: "situation",
    label: "状況別",
    currentUiState: "pitcherSeasonSubTab=situation",
    plannedPath: "/players/{slug}/situation",
  },
  {
    audience: "pitcher",
    urlTarget: "matchup",
    label: "対戦成績",
    currentUiState: "pitcherSeasonSubTab=matchup",
    plannedPath: "/players/{slug}/matchup",
  },
  {
    audience: "fielder",
    urlTarget: "basic",
    label: "基本成績",
    currentUiState: "kikuchiSeasonDetailTab=basic",
    plannedPath: "/players/{slug}",
  },
  {
    audience: "fielder",
    urlTarget: "pitch",
    label: "球種情報",
    currentUiState: "kikuchiSeasonDetailTab=pitch",
    plannedPath: "/players/{slug}/pitch",
  },
  {
    audience: "fielder",
    urlTarget: "situation",
    label: "状況別",
    currentUiState: "kikuchiSeasonDetailTab=situation",
    plannedPath: "/players/{slug}/situation",
  },
  {
    audience: "fielder",
    urlTarget: "matchup",
    label: "対戦成績",
    currentUiState: "kikuchiSeasonDetailTab=matchup",
    plannedPath: "/players/{slug}/matchup",
  },
  {
    audience: "fielder",
    urlTarget: "vs-team",
    label: "球団別",
    currentUiState: "kikuchiSeasonDetailTab=vs_team_pitch",
    plannedPath: "/players/{slug}/vs-team",
  },
  {
    audience: "catcher",
    urlTarget: "basic",
    label: "基本成績",
    currentUiState: "kikuchiSeasonDetailTab=basic",
    plannedPath: "/players/{slug}",
  },
  {
    audience: "catcher",
    urlTarget: "pitch",
    label: "球種情報",
    currentUiState: "kikuchiSeasonDetailTab=pitch",
    plannedPath: "/players/{slug}/pitch",
  },
  {
    audience: "catcher",
    urlTarget: "situation",
    label: "状況別",
    currentUiState: "kikuchiSeasonDetailTab=situation",
    plannedPath: "/players/{slug}/situation",
  },
  {
    audience: "catcher",
    urlTarget: "matchup",
    label: "対戦成績",
    currentUiState: "kikuchiSeasonDetailTab=matchup",
    plannedPath: "/players/{slug}/matchup",
  },
  {
    audience: "catcher",
    urlTarget: "vs-team",
    label: "球団別",
    currentUiState: "kikuchiSeasonDetailTab=vs_team_pitch",
    plannedPath: "/players/{slug}/vs-team",
  },
  {
    audience: "catcher",
    urlTarget: "catcher",
    label: "捕手成績",
    currentUiState: "kikuchiSeasonDetailTab=catcher",
    plannedPath: "/players/{slug}/catcher",
  },
] as const

export const PLAYER_PAGE_PHASE1_LEGACY_QUERY_ALIASES = {
  advanced: "advanced",
  splits: "splits",
  situation: "splits",
  "game-log": "game-log",
  gamelog: "game-log",
  game_log: "game-log",
  "pitch-types": "pitch-types",
  pitch: "pitch-types",
} as const satisfies Record<string, PlayerPageSection>

export const PLAYER_PAGE_PHASE1_LEGACY_REST_ALIASES = {
  advanced: "advanced",
  splits: "splits",
  "game-log": "game-log",
  "pitch-types": "pitch-types",
} as const satisfies Record<string, PlayerPageSection>

export function resolvePlayerPageLegacyTabQuery(
  tab: string | null | undefined,
): PlayerPageSection {
  const key = String(tab ?? "").trim().toLowerCase()
  return PLAYER_PAGE_PHASE1_LEGACY_QUERY_ALIASES[key] ?? "basic"
}

export function resolvePlayerPageLegacyRestSection(
  rest: string[] | undefined,
): PlayerPageSection {
  const key = String(rest?.[rest.length - 1] ?? "").trim().toLowerCase()
  if (!key) return "basic"
  return PLAYER_PAGE_PHASE1_LEGACY_REST_ALIASES[key] ?? "basic"
}

export function getPlayerPagePhase1RowsForAudience(
  audience: PlayerPageTabUrlAudience,
): PlayerPagePhase1UrlRow[] {
  return PLAYER_PAGE_PHASE1_URL_ROWS.filter((row) => row.audience === audience)
}
