/** Phase 30: 個人ページ「対戦成績」サブタブ用派生 JSON */

export const PLAYER_MATCHUP_SCHEMA_VERSION = "phase30-player-matchup-v1" as const

export type PlayerMatchupOpponentRow = {
  opponentNpbId: string
  opponentPublicId: string
  opponentName: string
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  tb: number
  pa: number
  avg: string | null
  ops: string | null
}

export type PlayerMatchupTeamBlock = {
  teamCode: string
  teamDisplay: string
  opponents: PlayerMatchupOpponentRow[]
}

export type PlayerMatchupDerived = {
  schemaVersion: typeof PLAYER_MATCHUP_SCHEMA_VERSION
  seasonYear: string
  npbPlayerId: string
  role: "batter" | "pitcher"
  generatedAt: string
  source: {
    canonicalGames: number
    plateAppearancesProcessed: number
    skippedPa: number
  }
  teams: PlayerMatchupTeamBlock[]
}

export type PlayerMatchupApiResponse = {
  hasData: boolean
  year: string
  payload: PlayerMatchupDerived | null
}
