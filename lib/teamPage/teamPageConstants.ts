/**
 * チームページ v1 定数（Phase 0 確定）
 * 正本: docs/plan_team_page_phase0_spec.md
 */

import { PLAYER_MATCHUP_TEAM_ORDER } from "@/lib/playerMatchupTeamOrder"

/** v1 でチームページを提供する年度（URL セグメントは文字列） */
export const TEAM_PAGE_V1_YEARS = ["2026"] as const

export type TeamPageV1Year = (typeof TEAM_PAGE_V1_YEARS)[number]

export const TEAM_PAGE_DEFAULT_YEAR: TeamPageV1Year = "2026"

export function isTeamPageYearSupported(year: string | number): year is TeamPageV1Year {
  const y = String(year ?? "").trim()
  return (TEAM_PAGE_V1_YEARS as readonly string[]).includes(y as TeamPageV1Year)
}

/** サブタブ id（URL パス suffix と一致） */
export const TEAM_PAGE_SUB_TABS = [
  { id: "batting", label: "打撃ランキング", pathSuffix: "batting" },
  { id: "pitching", label: "投手ランキング", pathSuffix: "pitching" },
  { id: "catchers", label: "捕手成績", pathSuffix: "catchers" },
] as const

export type TeamPageSubTabId = (typeof TEAM_PAGE_SUB_TABS)[number]["id"]

/** 12 球団の canonical team_code 順（PLAYER_MATCHUP_TEAM_ORDER と整合） */
export const ORDERED_TEAM_CODES = PLAYER_MATCHUP_TEAM_ORDER.map((t) => t.teamCode)

export const TEAM_PAGE_DEFAULT_SUB_TAB: TeamPageSubTabId = "batting"
