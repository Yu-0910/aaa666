export type CatcherStartingSummaryTeamTotals = {
  starts: number
  teamWins: number
  teamLosses: number
  teamDraws?: number
  teamWinPct: number | null
  qsCount: number
  hqsCount: number
  sqsCount: number
  qsPct: number | null
  hqsPct: number | null
  sqsPct: number | null
}

export type CatcherStartingSummaryDerived = {
  schemaVersion: "player-catcher-starting-summary-v1"
  seasonYear: string
  npbCatcherId: string
  teams?: Record<string, CatcherStartingSummaryTeamTotals>
} & CatcherStartingSummaryTeamTotals

export function selectCatcherStartingSummaryForTeam(
  summary: CatcherStartingSummaryDerived | null,
  teamCode: string | null | undefined,
): CatcherStartingSummaryDerived | null {
  if (!summary) return null
  const key = String(teamCode ?? "").trim()
  const team = key ? summary.teams?.[key] : null
  if (!team) return summary
  return {
    ...summary,
    starts: team.starts,
    teamWins: team.teamWins,
    teamLosses: team.teamLosses,
    teamDraws: team.teamDraws,
    teamWinPct: team.teamWinPct,
    qsCount: team.qsCount,
    hqsCount: team.hqsCount,
    sqsCount: team.sqsCount,
    qsPct: team.qsPct,
    hqsPct: team.hqsPct,
    sqsPct: team.sqsPct,
  }
}

