export type CatcherStartingSummaryDerived = {
  schemaVersion: "player-catcher-starting-summary-v1"
  seasonYear: string
  npbCatcherId: string
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

