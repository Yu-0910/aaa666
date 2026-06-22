/**
 * チームページ用: ランキング行の所属フィルタと順位再採番
 * 正本: docs/plan_team_page_phase0_spec.md §5.2
 */

import type { RankingRow } from "@/lib/ranking/types"
import { teamCodeFromShort } from "@/lib/standings/teamCodes"

export function rowMatchesTeamCode(row: RankingRow, teamCode: string): boolean {
  const target = String(teamCode ?? "").trim()
  if (!target) return false
  const rowTeam = String(row.team ?? "").trim()
  if (!rowTeam) return false
  return teamCodeFromShort(rowTeam) === target
}

export function filterRankingRowsByTeam(rows: RankingRow[], teamCode: string): RankingRow[] {
  const code = String(teamCode ?? "").trim()
  if (!code) return []
  return rows.filter((row) => rowMatchesTeamCode(row, code))
}

export function rerankRows(rows: RankingRow[]): RankingRow[] {
  return rows.map((row, i) => ({ ...row, rank: i + 1 }))
}

export function filterAndRerankRankingRowsByTeam(
  rows: RankingRow[],
  teamCode: string,
): RankingRow[] {
  return rerankRows(filterRankingRowsByTeam(rows, teamCode))
}
