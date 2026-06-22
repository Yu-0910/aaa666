import type { RankingRow } from "@/lib/ranking/types"

export type SortedRankingResult = {
  rows: RankingRow[]
  /** 規定到達ブロック末尾の順位。未到達ブロックがあるときのみ（黄線の直前） */
  qualifyingDividerAfterRank: number | null
}

export function compareRankingRowsByMetric(
  a: RankingRow,
  b: RankingRow,
  metricKey: string,
  order: "asc" | "desc",
): number {
  const aValue = a[metricKey]
  const bValue = b[metricKey]
  if (aValue === null || aValue === undefined) return 1
  if (bValue === null || bValue === undefined) return -1
  if (isNaN(Number(aValue))) return 1
  if (isNaN(Number(bValue))) return -1
  if (order === "asc") return Number(aValue) - Number(bValue)
  return Number(bValue) - Number(aValue)
}

export function sortRowsByMetric(
  rows: RankingRow[],
  metricKey: string,
  order: "asc" | "desc",
): RankingRow[] {
  return [...rows].sort((a, b) => compareRankingRowsByMetric(a, b, metricKey, order))
}

export function rerankRows(rows: RankingRow[]): RankingRow[] {
  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
}

export function sortAndRerankRows(
  rows: RankingRow[],
  metricKey: string,
  order: "asc" | "desc",
): SortedRankingResult {
  return {
    rows: rerankRows(sortRowsByMetric(rows, metricKey, order)),
    qualifyingDividerAfterRank: null,
  }
}

/** チームページ: 規定到達者を上位に、未到達者を下位にそれぞれ指標順で並べる */
export function partitionQualifyingRows(
  rows: RankingRow[],
  passesQualifying: (row: RankingRow) => boolean,
  metricKey: string,
  order: "asc" | "desc",
): SortedRankingResult {
  const qualified = rows.filter(passesQualifying)
  const nonQualified = rows.filter((row) => !passesQualifying(row))
  const sortedQualified = sortRowsByMetric(qualified, metricKey, order)
  const sortedNonQualified = sortRowsByMetric(nonQualified, metricKey, order)
  const combined = [...sortedQualified, ...sortedNonQualified]
  return {
    rows: rerankRows(combined),
    qualifyingDividerAfterRank:
      sortedQualified.length > 0 && sortedNonQualified.length > 0
        ? sortedQualified.length
        : null,
  }
}
