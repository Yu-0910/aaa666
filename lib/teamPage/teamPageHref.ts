/**
 * チームページ URL ヘルパー
 * 正本: docs/plan_team_page_phase0_spec.md §2.1
 */

import {
  TEAM_PAGE_DEFAULT_SUB_TAB,
  TEAM_PAGE_DEFAULT_YEAR,
  type TeamPageSubTabId,
} from "@/lib/teamPage/teamPageConstants"

export type TeamPageHrefOptions = {
  teamCode: string
  year?: number | string
  subTab?: TeamPageSubTabId
  sort?: string
  order?: "asc" | "desc"
  /** 指定時は `/…/{subTab}/weekly/{weekKey}` */
  weekKey?: string
}

function teamPageBasePath(teamCode: string, year: number | string): string {
  return `/teams/${encodeURIComponent(teamCode)}/${year}`
}

export function teamPageHref({
  teamCode,
  year = TEAM_PAGE_DEFAULT_YEAR,
  subTab = TEAM_PAGE_DEFAULT_SUB_TAB,
  sort,
  order,
  weekKey,
}: TeamPageHrefOptions): string {
  let base = `${teamPageBasePath(teamCode, year)}/${subTab}`
  if (weekKey) {
    base += `/weekly/${encodeURIComponent(weekKey)}`
  }
  const params = new URLSearchParams()
  if (sort) params.set("sort", sort)
  if (order) params.set("order", order)
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

/** 今週版へ（weekKey 未指定時は `/weekly` リダイレクト先） */
export function teamPageWeeklyHubHref(
  teamCode: string,
  subTab: "batting" | "pitching",
  year: number | string = TEAM_PAGE_DEFAULT_YEAR,
  sort?: string,
  order?: "asc" | "desc",
): string {
  const base = `${teamPageBasePath(teamCode, year)}/${subTab}/weekly`
  const params = new URLSearchParams()
  if (sort) params.set("sort", sort)
  if (order) params.set("order", order)
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

/** ハブ URL（リダイレクト元） */
export function teamPageHubHref(teamCode: string, year: number | string = TEAM_PAGE_DEFAULT_YEAR): string {
  return teamPageBasePath(teamCode, year)
}

export function teamPageBattingTitle(
  teamDisplay: string,
  year: number | string,
  weekLabel?: string | null,
): string {
  if (weekLabel?.trim()) {
    return `${year}年 ${teamDisplay} 週間打撃成績ランキング (${weekLabel.trim()})`
  }
  return `${year}年 ${teamDisplay} 打撃成績ランキング`
}

export function teamPagePitchingTitle(
  teamDisplay: string,
  year: number | string,
  weekLabel?: string | null,
): string {
  if (weekLabel?.trim()) {
    return `${year}年 ${teamDisplay} 週間投手成績ランキング (${weekLabel.trim()})`
  }
  return `${year}年 ${teamDisplay} 投手成績ランキング`
}

export function teamPageCatchersTitle(teamDisplay: string, year: number | string): string {
  return `${year}年 ${teamDisplay} 捕手成績`
}

export function leagueLabel(league: "CL" | "PL"): string {
  return league === "CL" ? "セ・リーグ" : "パ・リーグ"
}
