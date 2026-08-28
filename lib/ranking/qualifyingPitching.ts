import type { RankingRow } from './types'
import { ipToOuts } from "@/lib/careerPitchingEnrich"

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

export const QUALIFYING_IP_INNINGS_PER_TEAM_GAME = 1.0

type PitchingLeague = "CL" | "PL"

export type PitchingQualifyingContext = {
  teamGames: number
  teamRank?: number | null
}

export function shouldRequireQualifyingPitching(metricKey: string): boolean {
  const n = metricKey.toLowerCase().trim()
  return RATE_KEYS.has(n)
}

function normalizeLeague(league: string): PitchingLeague | null {
  const upper = league.toUpperCase().trim()
  return upper === "CL" || upper === "PL" ? upper : null
}

function getRowGames(row: RankingRow): number {
  const r = row as Record<string, unknown>
  const v = r['g'] ?? r['games'] ?? r['試合']
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function normalizeGames(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export function getRequiredInningsFromContext(
  yearInput: string | number,
  leagueInput: string,
  context: PitchingQualifyingContext
): number | null {
  const year = Number(yearInput)
  const league = normalizeLeague(leagueInput)
  if (!Number.isFinite(year) || league === null) return null

  const teamGames = normalizeGames(context.teamGames)
  const teamRank = context.teamRank ?? null

  if (year >= 1964) return teamGames * QUALIFYING_IP_INNINGS_PER_TEAM_GAME

  switch (year) {
    case 1950:
      return league === "CL" ? 180 : 135
    case 1951:
      return 135
    case 1952:
      if (league === "CL") return 180
      if (teamRank == null) return null
      return teamRank <= 4 ? 180 : 162
    case 1953:
      return league === "CL" ? 176 : 180
    case 1954:
      return league === "CL" ? 198 : 210
    case 1955:
      return league === "CL" ? 190 : 210
    case 1956:
      return league === "CL" ? 190 : 230
    case 1957:
      return league === "CL" ? 195 : 198
    case 1958:
      return 190
    case 1959:
      return league === "CL" ? 182 : teamGames * 1.4
    case 1960:
      return league === "CL" ? 182 : teamGames * 1.4
    case 1961:
      return league === "CL" ? 182 : 196
    case 1962:
      return teamGames * 1.4
    case 1963:
      return league === "CL" ? 196 : 210
    default:
      return null
  }
}

export function inningsToRequiredOuts(innings: number): number {
  if (!Number.isFinite(innings) || innings <= 0) return 0
  return Math.ceil(innings * 3 - 1e-9)
}

export function normalizeIpToOuts(ip: unknown): number {
  const asString = typeof ip === "string" ? ip.trim() : ""
  if (asString) {
    const npbOuts = ipToOuts(asString)
    if (npbOuts !== null) return npbOuts
    const parsed = Number(asString)
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 3)) : 0
  }

  const n = typeof ip === "number" ? ip : Number(ip)
  if (!Number.isFinite(n)) return 0
  const whole = Math.trunc(n)
  const frac = Math.abs(n - whole)
  const tenth = Math.round(frac * 10)
  if (Math.abs(frac * 10 - tenth) < 1e-9 && [0, 1, 2].includes(tenth)) {
    return whole * 3 + tenth
  }
  return Math.max(0, Math.round(n * 3))
}

export function getRowIpDecimal(row: RankingRow): number {
  const r = row as Record<string, unknown>
  return normalizeIpToOuts(r['ip']) / 3
}

export type PitchingQualifyingThresholds = {
  /** チーム略称 → 要求最低投球回（十進イニング） */
  byTeam: Map<string, number>
  /** チーム名欠損などでチームキーが無い行向け */
  fallbackMinIp: number
}

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

export function rowMeetsPitchingQualifyingIp(
  row: RankingRow,
  thresholds: PitchingQualifyingThresholds
): boolean {
  const ipOuts = normalizeIpToOuts((row as Record<string, unknown>)['ip'])
  const team = String(row.team ?? '').trim()
  const minIp = team ? (thresholds.byTeam.get(team) ?? thresholds.fallbackMinIp) : thresholds.fallbackMinIp
  return ipOuts >= inningsToRequiredOuts(minIp)
}
