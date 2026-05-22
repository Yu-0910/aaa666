/**
 * Phase 4: 2026 ビルド時に率系ランキング JSON を規定到達者に絞る（team-games.json 同源）。
 * 公開 `.json` は規定適用済み、`*_all.json`（通算のみ）は全選手のまま。
 */

import { calculateMinPA, shouldRequireQualifyingPA } from "@/lib/ranking/qualifyingPA"
import {
  rowMeetsPitchingQualifyingIp,
  shouldRequireQualifyingPitching,
} from "@/lib/ranking/qualifyingPitching"
import {
  buildMinPAByTeamFromTeamGames,
  buildPitchingThresholdsFromTeamGames,
  rowPassesQualifyingPAWithMinMap,
} from "@/lib/ranking/qualifyingThresholdsShared"

export function assignRanks(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((raw, idx) => ({ ...raw, rank: idx + 1 }))
}

/** 率系かつ 2026・teamGames ありのときだけ行を絞る（ソート済み行を渡す） */
export function filterBattingRowsForQualifyingAtBuild(
  rows: Record<string, unknown>[],
  metricKey: string,
  year: string,
  league: string,
  teamGames: Record<string, number> | undefined
): Record<string, unknown>[] {
  if (!shouldRequireQualifyingPA(metricKey)) return rows
  if (year !== "2026") return rows
  if (!teamGames || Object.keys(teamGames).length === 0) return rows
  const minPAByTeam = buildMinPAByTeamFromTeamGames(teamGames, year)
  const fallback = calculateMinPA(year, league)
  return rows.filter((row) => rowPassesQualifyingPAWithMinMap(row, minPAByTeam, fallback))
}

export function filterPitchingRowsForQualifyingAtBuild(
  rows: Record<string, unknown>[],
  metricKey: string,
  year: string,
  teamGames: Record<string, number> | undefined
): Record<string, unknown>[] {
  if (!shouldRequireQualifyingPitching(metricKey)) return rows
  if (year !== "2026") return rows
  if (!teamGames || Object.keys(teamGames).length === 0) return rows
  const thresholds = buildPitchingThresholdsFromTeamGames(teamGames)
  return rows.filter((row) =>
    rowMeetsPitchingQualifyingIp(row as Parameters<typeof rowMeetsPitchingQualifyingIp>[0], thresholds)
  )
}
