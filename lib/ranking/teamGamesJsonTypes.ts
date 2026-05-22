/** team-games.json の型（クライアント・サーバー共通。fs なし） */

export const TEAM_GAMES_JSON_SCHEMA = "ranking-team-games-v1" as const

export type TeamGamesJson = {
  schemaVersion: typeof TEAM_GAMES_JSON_SCHEMA
  year: string
  league: "CL" | "PL"
  period: "season" | "week"
  weekKey?: string
  source: "canonical"
  generatedAt: string
  teams: Record<string, number>
}
