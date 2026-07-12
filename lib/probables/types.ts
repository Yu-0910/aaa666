/** トップ「予想投手」タブ用 JSON スキーマ */

export const TOP_PROBABLES_SCHEMA_VERSION = "top-probables-v1" as const

export type TopProbablesOpponentBatter = {
  opponentName: string
  opponentNpbId?: string | null
  opponentPublicId: string | null
  ops: string | null
  avg: string | null
  hr: number
  ab: number
}

export type TopProbablesPitcherSlot = {
  teamCode: string
  pitcherNameJa: string | null
  pitcherNpbId: string | null
  pitcherPublicId: string | null
  source: "sportingnews" | "yahoo-schedule"
  topOpponentBatters: TopProbablesOpponentBatter[]
  /** 楽天 vs ロッテなどで表示する今季成績（防御率） */
  seasonEra?: string | null
  /** 今季勝利数 */
  seasonWins?: number | null
  /** 今季敗戦数 */
  seasonLosses?: number | null
  /** 今季 K-BB%（例: "24.7"） */
  seasonKbbPct?: string | null
}

export type TopProbablesGame = {
  dateJst: string
  gameId: string | null
  homeTeamCode: string
  awayTeamCode: string
  homeProbable: TopProbablesPitcherSlot | null
  awayProbable: TopProbablesPitcherSlot | null
}

export type TopProbablesCard = {
  cardKey: string
  teamCodes: [string, string]
  teamNames: [string, string]
  seriesStart: string
  seriesEnd: string
  games: TopProbablesGame[]
}

export type TopProbablesSnapshot = {
  schemaVersion: typeof TOP_PROBABLES_SCHEMA_VERSION
  seasonYear: string
  generatedAt: string
  asOfDateJst: string
  source: {
    sportingNewsFetchedAt: string | null
    scheduleIndexBuiltAt: string | null
    matchupDerivedPhase: "phase30"
  }
  cards: TopProbablesCard[]
  warnings: string[]
}

export type ScheduleDayGame = {
  dateJst: string
  gameId: string
  homeTeamCode: string
  awayTeamCode: string
  homeTeamShort?: string
  awayTeamShort?: string
  statusText?: string
  gameState?: "completed" | "cancelled" | "no_game" | "scheduled" | "in_progress" | "unknown"
}

export type ThreeGameSeriesCard = {
  cardKey: string
  teamCodes: [string, string]
  seriesStart: string
  seriesEnd: string
  games: ScheduleDayGame[]
}
