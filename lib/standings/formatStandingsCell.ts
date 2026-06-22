/**
 * 順位表セルの表示フォーマット。
 */

import type { StandingsMetricKey } from "@/lib/standings/metricColumns"
import type { TeamStandingRow } from "@/lib/standings/types"

function stripLeadingZeroDecimal(s: string): string {
  return s.startsWith("0.") ? s.slice(1) : s
}

export function formatStandingsCell(key: StandingsMetricKey, row: TeamStandingRow): string {
  const value = row[key]

  if (key === "gb") {
    return String(value ?? "—")
  }

  if (value == null) {
    return "—"
  }

  if (typeof value === "string") {
    return value
  }

  switch (key) {
    case "pct":
    case "ops":
    case "avg":
    case "obp":
    case "slg":
    case "risp_avg":
    case "isod":
    case "isop":
    case "avg_allowed":
      return stripLeadingZeroDecimal(value.toFixed(3))
    case "era":
    case "era_starter":
    case "era_relief":
    case "k9":
      return value.toFixed(2)
    case "bb_pct":
    case "k_pct":
    case "bb_pct_pitch":
    case "k_bb_pct":
    case "qs_rate":
    case "hqs_rate":
      return `${value.toFixed(1)}%`
    case "k_pct_pitch":
      return value.toFixed(2)
    default:
      return String(value)
  }
}
