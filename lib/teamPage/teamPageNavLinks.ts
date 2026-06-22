/**
 * チームページ導線（ドロワー・順位表）
 * 正本: docs/plan_team_page_phase0_spec.md
 */

import {
  isTeamPageYearSupported,
  TEAM_PAGE_DEFAULT_YEAR,
  type TeamPageV1Year,
} from "@/lib/teamPage/teamPageConstants"
import { teamDisplayNameFromCode } from "@/lib/standings/teamCodes"
import { teamPageHubHref } from "@/lib/teamPage/teamPageHref"

export type TeamPageNavLink = {
  teamCode: string
  label: string
}

/** モバイルドロワー「記事」配下の表示順（公式球団名） */
export const TEAM_PAGE_DRAWER_NAV: {
  CL: TeamPageNavLink[]
  PL: TeamPageNavLink[]
} = {
  CL: [
    { teamCode: "G", label: "読売ジャイアンツ" },
    { teamCode: "H", label: "阪神タイガース" },
    { teamCode: "DB", label: "横浜DeNAベイスターズ" },
    { teamCode: "D", label: "中日ドラゴンズ" },
    { teamCode: "C", label: "広島東洋カープ" },
    { teamCode: "S", label: "東京ヤクルトスワローズ" },
  ],
  PL: [
    { teamCode: "Hs", label: "福岡ソフトバンクホークス" },
    { teamCode: "Bs", label: "オリックス・バファローズ" },
    { teamCode: "L", label: "埼玉西武ライオンズ" },
    { teamCode: "M", label: "千葉ロッテマリーンズ" },
    { teamCode: "F", label: "北海道日本ハムファイターズ" },
    { teamCode: "E", label: "東北楽天ゴールデンイーグルス" },
  ],
}

export function teamPageYearForNav(selectedYear: number | string): TeamPageV1Year {
  const y = String(selectedYear)
  return isTeamPageYearSupported(y) ? y : TEAM_PAGE_DEFAULT_YEAR
}

export function teamPageNavHref(teamCode: string, selectedYear: number | string): string {
  return teamPageHubHref(teamCode, teamPageYearForNav(selectedYear))
}

export function teamPageNavEnabledForYear(year: number | string): boolean {
  return isTeamPageYearSupported(String(year))
}

/** 現在の球団以外（セ・パ各 1 行、ドロワーと同じ球団順） */
export function teamPagePeerNavByLeague(currentTeamCode: string): {
  CL: TeamPageNavLink[]
  PL: TeamPageNavLink[]
} {
  const current = String(currentTeamCode ?? "").trim()
  const filterPeers = (items: readonly TeamPageNavLink[]): TeamPageNavLink[] =>
    items
      .filter((t) => t.teamCode !== current)
      .map(({ teamCode }) => ({
        teamCode,
        label: teamDisplayNameFromCode(teamCode),
      }))
  return {
    CL: filterPeers(TEAM_PAGE_DRAWER_NAV.CL),
    PL: filterPeers(TEAM_PAGE_DRAWER_NAV.PL),
  }
}
