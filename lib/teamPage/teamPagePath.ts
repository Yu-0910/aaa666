/**
 * チームページのパス名からサブタブを判定
 */

import { isValidWeeklyWeekKey } from "@/lib/ranking/weeklyRankingsWeekKeys"
import type { TeamPageSubTabId } from "@/lib/teamPage/teamPageConstants"
import { TEAM_PAGE_SUB_TABS } from "@/lib/teamPage/teamPageConstants"

export function activeTeamPageSubTabFromPathname(pathname: string): TeamPageSubTabId {
  const segments = pathname.split("/").filter(Boolean)
  for (const tab of TEAM_PAGE_SUB_TABS) {
    if (segments.includes(tab.pathSuffix)) return tab.id
  }
  return "batting"
}

export function teamPageSubTabLabel(subTab: TeamPageSubTabId): string {
  return TEAM_PAGE_SUB_TABS.find((t) => t.id === subTab)?.label ?? subTab
}

export function isTeamPageWeeklyPath(pathname: string): boolean {
  return pathname.split("/").filter(Boolean).includes("weekly")
}

export function teamPageWeeklyWeekKeyFromPathname(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean)
  const weeklyIdx = segments.indexOf("weekly")
  if (weeklyIdx === -1) return null
  const weekKey = segments[weeklyIdx + 1] ?? ""
  return isValidWeeklyWeekKey(weekKey) ? weekKey : null
}

export function isTeamPageRankingSubTab(subTab: TeamPageSubTabId): subTab is "batting" | "pitching" {
  return subTab === "batting" || subTab === "pitching"
}
