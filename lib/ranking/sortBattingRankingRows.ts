import type { MetricDefinition, RankingRow } from "@/lib/ranking/types"
import { filterRankingRowsByTeam } from "@/lib/teamPage/filterRankingRowsByTeam"
import { shouldRequireQualifyingPA, calculateMinPA, get1950MinGames } from "@/lib/ranking/qualifyingPA"
import { computeDynamicMinPAByTeam } from "@/lib/ranking/dynamicQualifyingPA"
import { rowPassesQualifyingPAWithMinMap } from "@/lib/ranking/qualifyingThresholdsShared"
import {
  partitionQualifyingRows,
  sortAndRerankRows,
  type SortedRankingResult,
} from "@/lib/ranking/sortRankingRowsShared"

export type SortBattingRankingRowsParams = {
  rows: RankingRow[]
  metrics: MetricDefinition[]
  sortKey: string
  order: "asc" | "desc"
  season: string
  league: string
  yahooPoc?: boolean
  is2026: boolean
  minPAByTeamCanonical: Map<string, number> | null
  /** チームページ: 所属選手のみ */
  teamCode?: string
  /** チームページ今週タブ: 規定未到達も含めて一覧表示 */
  skipTeamQualifyingFilter?: boolean
}

export function sortBattingRankingRows({
  rows,
  metrics,
  sortKey,
  order,
  season,
  league,
  yahooPoc = false,
  is2026,
  minPAByTeamCanonical,
  teamCode,
  skipTeamQualifyingFilter = false,
}: SortBattingRankingRowsParams): SortedRankingResult {
  const scopedRows = teamCode ? filterRankingRowsByTeam(rows, teamCode) : rows
  const metric = metrics.find((m) => m.key === sortKey)
  if (!metric) {
    return { rows: scopedRows, qualifyingDividerAfterRank: null }
  }

  const requiresQualifyingPA = shouldRequireQualifyingPA(metric.key)
  const leagueUpper = league.toUpperCase()
  const yearNum = parseInt(season, 10)

  const usesAB =
    ((yearNum >= 1950 && yearNum <= 1958 && yearNum !== 1952) ||
      (season === "1951" && leagueUpper === "PL") ||
      (season === "1952" && leagueUpper === "PL")) &&
    !(season === "1957" && leagueUpper === "PL") &&
    !(season === "1958" && leagueUpper === "PL")

  const is1951PL = season === "1951" && leagueUpper === "PL"
  const is1952PL = season === "1952" && leagueUpper === "PL"
  const is1966PL = season === "1966" && leagueUpper === "PL"
  const is1967PL = season === "1967" && leagueUpper === "PL"
  const is1950CL = season === "1950" && leagueUpper === "CL"

  const minPA = requiresQualifyingPA ? calculateMinPA(season, leagueUpper) : 0
  const minGames1950CL = is1950CL ? get1950MinGames(season, leagueUpper) : null
  const dynamicMinPAByTeam = computeDynamicMinPAByTeam(scopedRows, season)

  const rowPassesQualifying = (row: RankingRow): boolean => {
    if (is1966PL || is1967PL) {
      const team = row["team"] || row["チーム"] || ""
      const minPAForTeam = calculateMinPA(season, leagueUpper, String(team))
      const pa = row["PA"] || row["pa"] || row["打席"]
      const paValue = typeof pa === "number" ? pa : Number(pa)
      return !isNaN(paValue) && paValue >= minPAForTeam
    }

    if (usesAB) {
      let minAB = minPA
      if (is1951PL || is1952PL) {
        const team = row["team"] || row["チーム"] || ""
        minAB = calculateMinPA(season, leagueUpper, String(team))
      }
      const ab = row["AB"] || row["ab"] || row["打数"]
      const abValue = typeof ab === "number" ? ab : Number(ab)
      let passes = !isNaN(abValue) && abValue >= minAB
      if (is1950CL && minGames1950CL !== null) {
        const games = row["games"] || row["G"] || row["試合"]
        const gamesValue = typeof games === "number" ? games : Number(games)
        passes = passes && !isNaN(gamesValue) && gamesValue >= minGames1950CL
      }
      return passes
    }

    if (is2026 && minPAByTeamCanonical && minPAByTeamCanonical.size > 0) {
      return rowPassesQualifyingPAWithMinMap(
        row as Record<string, unknown>,
        minPAByTeamCanonical,
        minPA,
      )
    }

    const team = String(row["team"] || row["チーム"] || "").trim()
    const dynamicMinPA = team ? dynamicMinPAByTeam.get(team) : undefined
    const effectiveMinPA = dynamicMinPA ?? minPA
    const pa = row["PA"] || row["pa"] || row["打席"]
    const paValue = typeof pa === "number" ? pa : Number(pa)
    return !isNaN(paValue) && paValue >= effectiveMinPA
  }

  const applyQualifying = requiresQualifyingPA && minPA > 0 && !yahooPoc

  if (applyQualifying && teamCode && !skipTeamQualifyingFilter) {
    return partitionQualifyingRows(scopedRows, rowPassesQualifying, metric.key, order)
  }

  let targetRows = scopedRows
  if (applyQualifying) {
    targetRows = scopedRows.filter(rowPassesQualifying)
  }

  return sortAndRerankRows(targetRows, metric.key, order)
}
