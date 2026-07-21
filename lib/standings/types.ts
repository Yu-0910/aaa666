/**
 * チーム順位表 JSON の型（Phase 0 固定）。
 * 仕様: docs/plan_team_standings_phase0_spec.md
 */

export const TEAM_STANDINGS_JSON_SCHEMA = "team-standings-v1" as const

export type StandingsLeague = "CL" | "PL"

export type StandingsSource = "canonical" | "master_csv" | "npb_official_yearly"

/** 1 球団の順位表行（指標キーは metricColumns と一致） */
export type TeamStandingRow = {
  rank: number
  team: string
  teamName: string
  /** NPB 年度別順位表では当時のチーム名を残す */
  npbLabel?: string
  g: number
  w: number
  l: number
  t: number
  pct: number | null
  gb: string
  runs: number
  ops: number | null
  avg: number | null
  hr: number
  h: number
  singles: number
  doubles: number
  triples: number
  obp: number | null
  slg: number | null
  risp_avg: number | null
  isod: number | null
  isop: number | null
  bb_pct: number | null
  k_pct: number | null
  era: number | null
  /** 失点（リーグ内戦で相手が取った得点の合計） */
  runs_allowed: number
  era_starter: number | null
  era_relief: number | null
  avg_allowed: number | null
  cg: number
  bb_pct_pitch: number | null
  k_pct_pitch: number | null
  k_bb_pct: number | null
  qs_rate: number | null
  hqs_rate: number | null
  /** NPB 年度別: 打数 */
  ab?: number
  /** NPB 年度別: 打点 */
  rbi?: number
  /** NPB 年度別: 盗塁 */
  sb?: number
  /** NPB 年度別: 完封勝 */
  sho?: number
  /** NPB 年度別: 投球回（表示用。例: "1182.2"） */
  ip?: string | null
  /** NPB 年度別: 奪三振 */
  so?: number
  /** NPB 年度別: K/9（計算値） */
  k9?: number | null
  /** 2026 canonical: セーブ */
  sv?: number
  /** 2026 canonical: ホールド */
  hld?: number
  /** 2026 canonical: HP（暫定: HLD） */
  hp?: number
  /** 2026 canonical: 投球数 */
  pitches?: number
  /** 2026 canonical: 対戦打者 */
  bf?: number
  /** 2026 canonical: 被安打 */
  h_allowed?: number
  /** 2026 canonical: 被本塁打 */
  hr_allowed?: number
  /** 2026 canonical: 与四球 */
  bb_allowed?: number
  /** 2026 canonical: 敬遠四球 */
  ibb_allowed?: number
  /** 2026 canonical: 与死球 */
  hbp_allowed?: number
  /** 2026 canonical: 自責点 */
  er?: number
  /** 2026 canonical: WHIP */
  whip?: number | null
}

export type TeamStandingsJson = {
  schemaVersion: typeof TEAM_STANDINGS_JSON_SCHEMA
  year: string
  league: StandingsLeague
  source: StandingsSource
  generatedAt: string
  rows: TeamStandingRow[]
}

export function isTeamStandingsJson(raw: unknown): raw is TeamStandingsJson {
  if (!raw || typeof raw !== "object") return false
  const o = raw as TeamStandingsJson
  return (
    o.schemaVersion === TEAM_STANDINGS_JSON_SCHEMA &&
    typeof o.year === "string" &&
    (o.league === "CL" || o.league === "PL") &&
    Array.isArray(o.rows)
  )
}
