/**
 * チームページシェル見出し（クライアント安全）
 */

import battingMetricMap from "@/config/metric_map.json"
import pitchingMetricMap from "@/config/pitching_metric_map.json"
import type { TeamPageSubTabId } from "@/lib/teamPage/teamPageConstants"
import { TEAM_CATCHER_DEFAULT_SORT_KEY } from "@/lib/teamPage/teamCatcherColumns"

/** 公式英字球団名（NPB 表記） */
export const TEAM_CODE_TO_ENGLISH_OFFICIAL: Record<string, string> = {
  G: "Yomiuri Giants",
  H: "Hanshin Tigers",
  DB: "Yokohama DeNA BayStars",
  D: "Chunichi Dragons",
  C: "Hiroshima Toyo Carp",
  S: "Tokyo Yakult Swallows",
  Hs: "Fukuoka SoftBank Hawks",
  Bs: "Orix Buffaloes",
  L: "Saitama Seibu Lions",
  M: "Chiba Lotte Marines",
  F: "Hokkaido Nippon-Ham Fighters",
  E: "Tohoku Rakuten Golden Eagles",
}

const DEFAULT_SORT_BY_SUB_TAB: Record<TeamPageSubTabId, string> = {
  batting: "ops",
  pitching: "era",
  catchers: TEAM_CATCHER_DEFAULT_SORT_KEY,
}

function invertMetricMap(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [label, key] of Object.entries(raw)) {
    if (label.startsWith("_") || !key) continue
    if (!out[key]) out[key] = label
  }
  return out
}

const BATTING_KEY_TO_LABEL = invertMetricMap(battingMetricMap as Record<string, string>)
const PITCHING_KEY_TO_LABEL = invertMetricMap(pitchingMetricMap as Record<string, string>)

export function teamEnglishOfficialName(teamCode: string): string {
  return TEAM_CODE_TO_ENGLISH_OFFICIAL[teamCode.trim()] ?? teamCode
}

export function teamPageShellMetricLabel(subTab: TeamPageSubTabId, sortKey: string): string {
  if (subTab === "catchers") return "捕手成績"
  const key = sortKey.trim()
  if (subTab === "pitching") {
    return PITCHING_KEY_TO_LABEL[key] ?? key.toUpperCase()
  }
  return BATTING_KEY_TO_LABEL[key] ?? key.toUpperCase()
}

export function teamPageShellTitle(
  teamDisplay: string,
  year: string | number,
  subTab: TeamPageSubTabId,
  sortKey?: string | null,
  options?: { isWeekly?: boolean; weekLabel?: string | null },
): string {
  const sk = (sortKey ?? "").trim() || DEFAULT_SORT_BY_SUB_TAB[subTab]
  const metricLabel = teamPageShellMetricLabel(subTab, sk)
  const weekSuffix = options?.isWeekly && options.weekLabel?.trim()
    ? ` (${options.weekLabel.trim()})`
    : ""
  if (subTab === "catchers") {
    return `${teamDisplay}　${metricLabel} (${year}年)${weekSuffix}`
  }
  if (options?.isWeekly) {
    return `${teamDisplay}　週間${metricLabel}ランキング${weekSuffix}`
  }
  return `${teamDisplay}　${metricLabel}ランキング (${year}年)`
}

export function parseTeamPageSortFromSearch(
  search: string,
  subTab: TeamPageSubTabId,
): string {
  const sp = new URLSearchParams(search.replace(/^\?/, ""))
  const sort = sp.get("sort")?.trim()
  return sort || DEFAULT_SORT_BY_SUB_TAB[subTab]
}
