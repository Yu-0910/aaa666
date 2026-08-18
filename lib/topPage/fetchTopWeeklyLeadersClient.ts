/**
 * トップ「今週」タブ用リーダー取得（週間スナップショット JSON）
 */

import type { LeadersConfig } from "@/lib/ranking/leadersTypes"
import type { TopLeadersCategory } from "@/lib/topPage/leadersSnapshotShared"
import {
  topWeeklyCurrentWeekPublicUrl,
  topWeeklyLeadersSnapshotPublicUrl,
  TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR,
} from "@/lib/topPage/weeklyLeadersSnapshotShared"
import { fetchJsonCached } from "@/lib/topPage/fetchJsonCached"
import { weekLabelForKey } from "@/lib/ranking/weeklyRankingsWeekKeys"

export type WeeklyLeadersFetchResult = {
  config: LeadersConfig
  weekKey: string
  weekLabel: string
  calendarWeekKey?: string
  calendarWeekLabel?: string
  isFallbackWeek?: boolean
}

type CurrentWeekJson = {
  weekKey?: string
  weekLabel?: string
  calendarWeekKey?: string
  calendarWeekLabel?: string
  isFallbackWeek?: boolean
  availableWeekKeys?: string[]
}

type WeeklySnapshotJson = LeadersConfig & {
  meta?: { weekKey?: string; weekLabel?: string }
}

export type WeeklyTabWeekMeta = {
  weekKey: string
  weekLabel: string
  calendarWeekKey: string
  calendarWeekLabel: string
  isFallbackWeek: boolean
  availableWeekKeys: string[]
}

export async function fetchCurrentWeekMeta(
  year: string | number = TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR
): Promise<WeeklyTabWeekMeta> {
  const raw = await fetchJsonCached<CurrentWeekJson>(topWeeklyCurrentWeekPublicUrl(String(year)))
  if (!raw.weekKey) {
    throw new Error("current-week.json に weekKey がありません")
  }
  const calendarWeekKey = raw.calendarWeekKey ?? raw.weekKey
  return {
    weekKey: raw.weekKey,
    weekLabel: raw.weekLabel ?? weekLabelForKey(raw.weekKey),
    calendarWeekKey,
    calendarWeekLabel: raw.calendarWeekLabel ?? weekLabelForKey(calendarWeekKey),
    isFallbackWeek: raw.isFallbackWeek ?? false,
    availableWeekKeys: Array.isArray(raw.availableWeekKeys) ? raw.availableWeekKeys : [raw.weekKey],
  }
}

export async function fetchTopWeeklyLeadersForPage(
  year: string | number,
  league: string,
  category: TopLeadersCategory,
  weekKey: string
): Promise<WeeklyLeadersFetchResult> {
  const yearStr = String(year)
  const upperLeague = league.toUpperCase()

  if (yearStr !== TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR) {
    throw new Error("週間リーダーは 2026 のみ対応しています")
  }

  const url = topWeeklyLeadersSnapshotPublicUrl(yearStr, weekKey, upperLeague, category)
  const data = await fetchJsonCached<WeeklySnapshotJson>(url)

  if (!data.leaders || Object.keys(data.leaders).length === 0) {
    throw new Error("週間リーダーデータが空です")
  }

  const config: LeadersConfig = {
    top3Metrics: data.top3Metrics,
    miniMetrics: data.miniMetrics,
    leaders: data.leaders,
  }

  return {
    config,
    weekKey: data.meta?.weekKey ?? weekKey,
    weekLabel: data.meta?.weekLabel ?? weekLabelForKey(weekKey),
  }
}
