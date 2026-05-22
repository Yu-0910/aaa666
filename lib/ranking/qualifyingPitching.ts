/**
 * 投手ランキングの規定（クオリファイ）フィルタ。
 *
 * 野手の「チーム試合数 × 3.1 打席」に倣い、**チームごとの当該データ上の最大試合数 × 係数（投球回）**
 * をそのチーム所属選手の最低投球回（十進イニング）とする。
 * 係数は NPB 公式の年次ルールと 1:1 ではないが、`QUALIFYING_IP_INNINGS_PER_TEAM_GAME` で調整可能。
 */

import type { RankingRow } from './types'

/** 率・指標系: 規定到達を要求 */
const RATE_KEYS = new Set([
  'era',
  'whip',
  'k_pct',
  'bb_pct',
  'k_bb_pct',
  'wpct',
  'avg_against',
  'babip_against',
  'obp_against',
  'slg_against',
  'p_ip',
  'qs_rate',
  'hqs_rate',
  'sqs_rate',
])

/**
 * チームがこなした試合数（データ上の最大）あたりの規定として要求する投球回（十進イニング）。
 * 例: 1.0 かつチーム最大試合数が 143 なら 143 回相当まで要求（フルシーズン想定）。
 * PoC の 1 試合のみのデータでは 1.0 × 1 = 1 回未満の投手は率系から除外される。
 */
export const QUALIFYING_IP_INNINGS_PER_TEAM_GAME = 1.0

export function shouldRequireQualifyingPitching(metricKey: string): boolean {
  const n = metricKey.toLowerCase().trim()
  return RATE_KEYS.has(n)
}

function getRowGames(row: RankingRow): number {
  const r = row as Record<string, unknown>
  const v = r['g'] ?? r['games'] ?? r['試合']
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

export function getRowIpDecimal(row: RankingRow): number {
  const r = row as Record<string, unknown>
  const v = r['ip']
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

export type PitchingQualifyingThresholds = {
  /** チーム略称 → 要求最低投球回（十進） */
  byTeam: Map<string, number>
  /** チーム名欠損などでチームキーが無い行向け（全行の最大試合数ベース） */
  fallbackMinIp: number
}

/**
 * 行集合からチーム別の「規定最低投球回（十進）」を算出。
 * 各チームでは、そのチームの行のうち **試合数 g の最大値** × 係数。
 */
export function computePitchingQualifyingMinIpByTeam(rows: RankingRow[]): PitchingQualifyingThresholds {
  const byTeamMaxG = new Map<string, number>()
  let globalMaxG = 0

  for (const row of rows) {
    const g = getRowGames(row)
    if (g > globalMaxG) globalMaxG = g
    const team = String(row.team ?? '').trim()
    if (!team) continue
    byTeamMaxG.set(team, Math.max(byTeamMaxG.get(team) ?? 0, g))
  }

  const byTeam = new Map<string, number>()
  for (const [team, games] of byTeamMaxG.entries()) {
    byTeam.set(team, games * QUALIFYING_IP_INNINGS_PER_TEAM_GAME)
  }

  const maxGFromNamedTeams = [...byTeamMaxG.values()].reduce((a, b) => Math.max(a, b), 0)
  const baseG = Math.max(globalMaxG, maxGFromNamedTeams)
  const fallbackMinIp = baseG * QUALIFYING_IP_INNINGS_PER_TEAM_GAME

  return { byTeam, fallbackMinIp }
}

/**
 * 率系指標用フィルタ: 投球回がチーム規定以上か
 */
export function rowMeetsPitchingQualifyingIp(
  row: RankingRow,
  thresholds: PitchingQualifyingThresholds
): boolean {
  const ip = getRowIpDecimal(row)
  const team = String(row.team ?? '').trim()
  const minIp = team ? (thresholds.byTeam.get(team) ?? thresholds.fallbackMinIp) : thresholds.fallbackMinIp
  return ip >= minIp
}
