/**
 * 規定閾値（ブラウザ・共有ロジック）。Node fs は使わない。
 */

import { minPAFromTeamGames } from "@/lib/ranking/qualifyingPA"
import {
  QUALIFYING_IP_INNINGS_PER_TEAM_GAME,
  getRequiredInningsFromContext,
  type PitchingQualifyingThresholds,
} from "@/lib/ranking/qualifyingPitching"
import { getRankingsUrl } from "@/lib/ranking/url"
import {
  TEAM_GAMES_JSON_SCHEMA,
  type TeamGamesJson,
} from "@/lib/ranking/teamGamesJsonTypes"

export type { TeamGamesJson }
export type StandingsThresholdRow = {
  rank?: number | null
  team?: string | null
  teamName?: string | null
  npbLabel?: string | null
  g?: number | null
}

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
  teams: Record<string, number>,
  year: string,
  league: string
): PitchingQualifyingThresholds {
  const byTeam = new Map<string, number>()
  let globalMax = 0
  for (const [team, games] of Object.entries(teams)) {
    if (!team.trim() || !Number.isFinite(games) || games <= 0) continue
    const minIp =
      getRequiredInningsFromContext(year, league, { teamGames: games }) ??
      games * QUALIFYING_IP_INNINGS_PER_TEAM_GAME
    byTeam.set(team, minIp)
    if (games > globalMax) globalMax = games
  }
  const fallbackMinIp =
    getRequiredInningsFromContext(year, league, { teamGames: globalMax }) ??
    globalMax * QUALIFYING_IP_INNINGS_PER_TEAM_GAME
  return {
    byTeam,
    fallbackMinIp,
  }
}

export function buildPitchingThresholdsFromStandingsRows(
  rows: StandingsThresholdRow[],
  year: string,
  league: string
): PitchingQualifyingThresholds {
  const byTeam = new Map<string, number>()
  let globalMaxGames = 0
  const setThreshold = (key: string, minIp: number) => {
    const normalized = key.trim()
    if (!normalized) return
    byTeam.set(normalized, Math.max(byTeam.get(normalized) ?? 0, minIp))
  }

  for (const row of rows) {
    const team = String(row.team ?? "").trim()
    const teamName = String(row.teamName ?? "").trim()
    const npbLabel = String(row.npbLabel ?? "").trim()
    const games = Number(row.g ?? 0)
    const rankRaw = Number(row.rank ?? NaN)
    if (!Number.isFinite(games) || games <= 0) continue
    if (games > globalMaxGames) globalMaxGames = games
    const minIp =
      getRequiredInningsFromContext(year, league, {
        teamGames: games,
        teamRank: Number.isFinite(rankRaw) ? rankRaw : null,
      }) ??
      games * QUALIFYING_IP_INNINGS_PER_TEAM_GAME
    setThreshold(team, minIp)
    setThreshold(teamName, minIp)
    setThreshold(npbLabel, minIp)
  }

  const fallbackMinIp =
    getRequiredInningsFromContext(year, league, { teamGames: globalMaxGames }) ??
    globalMaxGames * QUALIFYING_IP_INNINGS_PER_TEAM_GAME

  return { byTeam, fallbackMinIp }
}

export function buildQualifyingEntriesFromTeamGames(
  teams: Record<string, number>,
  year: string,
  league = "CL"
): Map<string, QualifyingTeamEntry> {
  const out = new Map<string, QualifyingTeamEntry>()
  for (const [team, teamGames] of Object.entries(teams)) {
    if (!team.trim() || !Number.isFinite(teamGames) || teamGames <= 0) continue
    const minIp =
      getRequiredInningsFromContext(year, league, { teamGames }) ??
      teamGames * QUALIFYING_IP_INNINGS_PER_TEAM_GAME
    out.set(team, {
      teamGames,
      minPA: minPAFromTeamGames(teamGames, year),
      minIp,
    })
  }
  return out
}

export async function fetchStandingsThresholdRowsClient(
  year: string,
  league: string,
  weekKey?: string
): Promise<StandingsThresholdRow[] | null> {
  if (typeof window === "undefined") return null
  const rel = weekKey
    ? `data/standings/weekly/${year}/${weekKey}/${league}.json`
    : `data/standings/${year}/${league}.json`
  const fallbackRel = weekKey
    ? null
    : `standings-json/${year}/${league}.json`
  const baseUrl = window.location.origin
  const candidates = [rel, fallbackRel].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    try {
      const res = await fetch(`${baseUrl}${getRankingsUrl(candidate)}`, { cache: "no-store" })
      if (!res.ok) continue
      const raw = (await res.json()) as { rows?: unknown[] }
      if (!Array.isArray(raw?.rows)) continue
      return raw.rows as StandingsThresholdRow[]
    } catch {
      continue
    }
  }

  return null
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
  const standingsRows = await fetchStandingsThresholdRowsClient(year, league, weekKey)
  if (standingsRows && standingsRows.length > 0) {
    return buildPitchingThresholdsFromStandingsRows(standingsRows, year, league)
  }
  const json = await fetchTeamGamesJsonClient(year, league, weekKey)
  if (json?.teams && Object.keys(json.teams).length > 0) {
    return buildPitchingThresholdsFromTeamGames(json.teams, year, league)
  }
  return null
}
