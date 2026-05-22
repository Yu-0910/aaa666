/**
 * 2026 規定閾値（ブラウザ・共有ロジック）。Node fs は使わない。
 */

import { minPAFromTeamGames } from "@/lib/ranking/qualifyingPA"
import {
  QUALIFYING_IP_INNINGS_PER_TEAM_GAME,
  type PitchingQualifyingThresholds,
} from "@/lib/ranking/qualifyingPitching"
import { getRankingsUrl } from "@/lib/ranking/url"
import {
  TEAM_GAMES_JSON_SCHEMA,
  type TeamGamesJson,
} from "@/lib/ranking/teamGamesJsonTypes"

export type { TeamGamesJson }
export type QualifyingTeamEntry = {
  teamGames: number
  minPA: number
  minIp: number
}

export function buildMinPAByTeamFromTeamGames(
  teams: Record<string, number>,
  year: string
): Map<string, number> {
  const out = new Map<string, number>()
  for (const [team, games] of Object.entries(teams)) {
    if (!team.trim() || !Number.isFinite(games) || games <= 0) continue
    out.set(team, minPAFromTeamGames(games, year))
  }
  return out
}

export function buildPitchingThresholdsFromTeamGames(
  teams: Record<string, number>
): PitchingQualifyingThresholds {
  const byTeam = new Map<string, number>()
  let globalMax = 0
  for (const [team, games] of Object.entries(teams)) {
    if (!team.trim() || !Number.isFinite(games) || games <= 0) continue
    const minIp = games * QUALIFYING_IP_INNINGS_PER_TEAM_GAME
    byTeam.set(team, minIp)
    if (games > globalMax) globalMax = games
  }
  return {
    byTeam,
    fallbackMinIp: globalMax * QUALIFYING_IP_INNINGS_PER_TEAM_GAME,
  }
}

export function buildQualifyingEntriesFromTeamGames(
  teams: Record<string, number>,
  year: string
): Map<string, QualifyingTeamEntry> {
  const out = new Map<string, QualifyingTeamEntry>()
  for (const [team, teamGames] of Object.entries(teams)) {
    if (!team.trim() || !Number.isFinite(teamGames) || teamGames <= 0) continue
    out.set(team, {
      teamGames,
      minPA: minPAFromTeamGames(teamGames, year),
      minIp: teamGames * QUALIFYING_IP_INNINGS_PER_TEAM_GAME,
    })
  }
  return out
}

export function effectiveMinPAFromMaps(
  team: string,
  minPAByTeam: Map<string, number>,
  fallbackMinPA: number
): number {
  const t = team.trim()
  if (t && minPAByTeam.has(t)) return minPAByTeam.get(t)!
  return fallbackMinPA
}

export function rowPassesQualifyingPAWithMinMap(
  row: Record<string, unknown>,
  minPAByTeam: Map<string, number>,
  fallbackMinPA: number
): boolean {
  const minPA = effectiveMinPAFromMaps(
    String(row.team ?? row["チーム"] ?? ""),
    minPAByTeam,
    fallbackMinPA
  )
  if (minPA <= 0) return true
  const paRaw = row.pa ?? row.PA ?? row["打席"]
  const pa = typeof paRaw === "number" ? paRaw : Number(paRaw)
  return Number.isFinite(pa) && pa >= minPA
}

export async function fetchTeamGamesJsonClient(
  year: string,
  league: string,
  weekKey?: string
): Promise<TeamGamesJson | null> {
  if (typeof window === "undefined") return null
  const rel = weekKey
    ? `weekly/${year}/${weekKey}/${league}/team-games.json`
    : `${year}/${league}/team-games.json`
  const baseUrl = window.location.origin
  const url = `${baseUrl}${getRankingsUrl(`data/rankings/${rel}`)}`
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const raw = (await res.json()) as TeamGamesJson
    if (raw?.schemaVersion !== TEAM_GAMES_JSON_SCHEMA || !raw.teams) return null
    return raw
  } catch {
    return null
  }
}

export async function fetchMinPAByTeamClient(
  year: string,
  league: string,
  weekKey?: string
): Promise<Map<string, number>> {
  const json = await fetchTeamGamesJsonClient(year, league, weekKey)
  if (json?.teams && Object.keys(json.teams).length > 0) {
    return buildMinPAByTeamFromTeamGames(json.teams, year)
  }
  return new Map()
}

export async function fetchPitchingThresholdsClient(
  year: string,
  league: string,
  weekKey?: string
): Promise<PitchingQualifyingThresholds | null> {
  const json = await fetchTeamGamesJsonClient(year, league, weekKey)
  if (json?.teams && Object.keys(json.teams).length > 0) {
    return buildPitchingThresholdsFromTeamGames(json.teams)
  }
  return null
}
