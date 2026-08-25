import type { LeaderRow, LeadersConfig } from "@/lib/ranking/leadersTypes"
import { usesTopPageModernLayout } from "@/lib/topPageModernLayout"

/** 2026 TOP 投球 1段目: 各1〜5位 */
export const PITCHING_TOP_2026_SEASON_TOP5_METRICS = ["防御率", "勝利", "K-BB％"] as const
/** 2026 TOP 投球 2段目: 各1〜3位 */
export const PITCHING_TOP_2026_SEASON_ROW2_METRICS = ["K％", "HLD", "Ｓ"] as const
/** 2026 TOP 投球 3段目: 各1〜3位 */
export const PITCHING_TOP_2026_SEASON_ROW3_METRICS = ["WHIP", "QS率", "P/IP"] as const
/** 2026 TOP 投球 4段目: 各1〜3位 */
export const PITCHING_TOP_2026_EXTRA_ROW4_METRICS = ["回数", "BB％", "四球"] as const
export const PITCHING_TOP_2026_SEASON_TOP3_METRICS = [
  ...PITCHING_TOP_2026_SEASON_ROW2_METRICS,
  ...PITCHING_TOP_2026_SEASON_ROW3_METRICS,
  ...PITCHING_TOP_2026_EXTRA_ROW4_METRICS,
] as const

// NOTE: ランキング JSON のファイル名は「セーブ」ではなく「Ｓ」（pitching_metric_map.json で同義）。
// UI 表示は topPagePitchingMetricTitle で「セーブ」に置換する。
export const PITCHING_TOP_2026_GRID_METRICS = [
  ...PITCHING_TOP_2026_SEASON_TOP5_METRICS,
  ...PITCHING_TOP_2026_SEASON_TOP3_METRICS,
] as const

export const PITCHING_TOP_2026_SEASON_TOP5_N = 5
export const PITCHING_TOP_2026_SEASON_TOP3_N = 3

/** 2026 TOP 投球：mini（1位のみ）は使わない */
export const PITCHING_TOP_2026_MINI_METRICS = [] as const

export function pitchingTop2026SeasonTopN(metricLabel: string): number | null {
  if ((PITCHING_TOP_2026_SEASON_TOP5_METRICS as readonly string[]).includes(metricLabel)) {
    return PITCHING_TOP_2026_SEASON_TOP5_N
  }
  if ((PITCHING_TOP_2026_SEASON_TOP3_METRICS as readonly string[]).includes(metricLabel)) {
    return PITCHING_TOP_2026_SEASON_TOP3_N
  }
  return null
}

/** スナップショット等の古いデータを 2026 投手グリッド定義に揃える（TOP5/TOP3・9指標） */
export function normalizePitchingLeadersConfigFor2026(
  config: LeadersConfig,
  supplement?: LeadersConfig | null
): LeadersConfig {
  const merged: Record<string, LeaderRow[]> = { ...config.leaders }
  if (supplement?.leaders) {
    for (const metric of PITCHING_TOP_2026_GRID_METRICS) {
      if (!merged[metric]?.length && supplement.leaders[metric]?.length) {
        merged[metric] = supplement.leaders[metric]!
      }
    }
  }

  const leaders: Record<string, LeaderRow[]> = {}
  for (const metric of PITCHING_TOP_2026_GRID_METRICS) {
    const topN = pitchingTop2026SeasonTopN(metric) ?? 1
    const rows = (merged[metric] ?? []).slice(0, topN)
    if (rows.length === 0) continue
    leaders[metric] = rows.map((row, i) => ({
      ...row,
      rank: Math.min(topN, i + 1) as LeaderRow["rank"],
    }))
  }

  return {
    top3Metrics: [...PITCHING_TOP_2026_GRID_METRICS],
    miniMetrics: [...PITCHING_TOP_2026_MINI_METRICS],
    leaders,
  }
}

export function pitchingMiniMetricsForTopTab(isWeeklyTab: boolean): readonly string[] {
  return isWeeklyTab ? PITCHING_TOP_2026_MINI_METRICS : PITCHING_TOP_2026_MINI_METRICS
}

export function pitchingTop2026TopN(metricLabel: string, isWeeklyTab = false): number | null {
  const seasonTopN = pitchingTop2026SeasonTopN(metricLabel)
  if (seasonTopN != null) return seasonTopN
  if (isWeeklyTab && (PITCHING_TOP_2026_EXTRA_ROW4_METRICS as readonly string[]).includes(metricLabel)) {
    return PITCHING_TOP_2026_SEASON_TOP3_N
  }
  return null
}

/** モダン TOP・今週タブで投球もモダンUI（3×3 グリッド） */
export function usesTopPitchingModernLayout(year: number, _isWeeklyTab = false): boolean {
  return usesTopPageModernLayout(year)
}

export function shouldShowTopPitchingSeasonGrid(leaders: Record<string, unknown[] | undefined>): boolean {
  return PITCHING_TOP_2026_GRID_METRICS.some((m) => (leaders[m]?.length ?? 0) > 0)
}

/** @deprecated 旧名。TopPagePanels 等の既存 import 用 */
export const shouldShowTopPitchingFourGrid = shouldShowTopPitchingSeasonGrid
