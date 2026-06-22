import type { MetricDefinition, RankingRow } from "@/lib/ranking/types"
import { filterRankingRowsByTeam } from "@/lib/teamPage/filterRankingRowsByTeam"
import {
  shouldRequireQualifyingPitching,
  rowMeetsPitchingQualifyingIp,
  type PitchingQualifyingThresholds,
} from "@/lib/ranking/qualifyingPitching"
import {
  partitionQualifyingRows,
  sortAndRerankRows,
  type SortedRankingResult,
} from "@/lib/ranking/sortRankingRowsShared"

export type SortPitchingRankingRowsParams = {
  rows: RankingRow[]
  metrics: MetricDefinition[]
  sortKey: string
  order: "asc" | "desc"
  pitchingQualifyingThresholds: PitchingQualifyingThresholds
  teamCode?: string
}

export function sortPitchingRankingRows({
  rows,
  metrics,
  sortKey,
  order,
  pitchingQualifyingThresholds,
  teamCode,
}: SortPitchingRankingRowsParams): SortedRankingResult {
  const scopedRows = teamCode ? filterRankingRowsByTeam(rows, teamCode) : rows
  const metric = metrics.find((m) => m.key === sortKey)
  if (!metric) {
    return { rows: scopedRows, qualifyingDividerAfterRank: null }
  }

  const requiresQ = shouldRequireQualifyingPitching(metric.key)
  const canApply =
    requiresQ && scopedRows.length > 0 && pitchingQualifyingThresholds.fallbackMinIp > 0

  const passesQualifying = (row: RankingRow) =>
    rowMeetsPitchingQualifyingIp(row, pitchingQualifyingThresholds)

  if (canApply && teamCode) {
    return partitionQualifyingRows(scopedRows, passesQualifying, metric.key, order)
  }

  let targetRows = scopedRows
  if (canApply) {
    targetRows = scopedRows.filter(passesQualifying)
  }

  return sortAndRerankRows(targetRows, metric.key, order)
}
