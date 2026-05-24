/**
 * トップ／API 用リーダー型（fs 非依存。クライアントから import 可）
 */

export type LeaderRow = {
  rank: 1 | 2 | 3 | 4 | 5
  name: string
  team: string
  teamName: string
  value: string | number
  romanName?: string
  /** ランキング JSON の Yahoo playerId */
  playerId?: string
  /** 名簿 NPB player_id（個人ページ URL 用） */
  npbPlayerId?: string
}

export type LeadersConfig = {
  top3Metrics: string[]
  miniMetrics: string[]
  leaders: Record<string, LeaderRow[]>
}

/** リーダー一覧の React key（同率・規定除外で rank が重複し得る） */
export function leaderListReactKey(leader: LeaderRow, index: number): string {
  return `${leader.team}-${leader.name}-${index}`
}
