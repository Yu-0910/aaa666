/**
 * 週間ランキングページ URL（Phase 0 確定パス）
 */

import metricMap from "@/config/metric_map.json"
import pitchingMetricMap from "@/config/pitching_metric_map.json"
import { getPitchingSortOrderForKey } from "@/lib/ranking/pitchingSortOrder"

function normalizeBattingMetricKey(metric: string): string {
  if (metric in metricMap) {
    return metricMap[metric as keyof typeof metricMap]
  }
  const lowerMetric = metric.toLowerCase()
  for (const [key, value] of Object.entries(metricMap)) {
    if (key.toLowerCase() === lowerMetric) {
      return value
    }
  }
  return metric.toLowerCase().replace("%", "pct").replace("/", "").replace("-", "")
}

function normalizePitchingMetricKey(metric: string): string {
  const map = pitchingMetricMap as Record<string, string>
  if (metric in map && !metric.startsWith("_")) {
    return map[metric]!
  }
  const lowerMetric = metric.toLowerCase()
  for (const [key, value] of Object.entries(map)) {
    if (key.startsWith("_")) continue
    if (key.toLowerCase() === lowerMetric) {
      return value
    }
  }
  return metric.toLowerCase().replace("%", "pct").replace("/", "").replace("-", "")
}

export function getWeeklyBattingRankingUrl(
  year: string | number,
  weekKey: string,
  league: string,
  metric: string
): string {
  const metricKey = normalizeBattingMetricKey(metric)
  const order = metricKey === "kpct" || metricKey === "k%" ? "asc" : "desc"
  return `/ranking/weekly/${year}/${weekKey}/${league.toUpperCase()}?sort=${encodeURIComponent(metricKey)}&order=${order}`
}

export function getWeeklyBattingStatsListUrl(
  year: string | number,
  weekKey: string,
  league: string
): string {
  return getWeeklyBattingRankingUrl(year, weekKey, league, "OPS")
}

export function getWeeklyPitchingRankingUrl(
  year: string | number,
  weekKey: string,
  league: string,
  metric: string
): string {
  const metricKey = normalizePitchingMetricKey(metric)
  const order = getPitchingSortOrderForKey(metricKey)
  return `/ranking/pitching/weekly/${year}/${weekKey}/${league.toUpperCase()}?sort=${encodeURIComponent(metricKey)}&order=${order}`
}

export function getWeeklyPitchingStatsListUrl(
  year: string | number,
  weekKey: string,
  league: string
): string {
  return getWeeklyPitchingRankingUrl(year, weekKey, league, "防御率")
}
