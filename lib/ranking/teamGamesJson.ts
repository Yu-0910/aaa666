/**
 * 球団別取得試合数 JSON（team-games.json）のパス・読み書き。
 */

import { existsSync, mkdirSync, readFileSync } from "fs"
import { join } from "path"
import { writeJsonFileWithRetrySync } from "@/lib/fs/writeFileWithRetry"
import type { TeamGamesByLeague } from "@/lib/yahooGame/aggregateTeamGamesFromCanonical"
import {
  TEAM_GAMES_JSON_SCHEMA,
  type TeamGamesJson,
} from "@/lib/ranking/teamGamesJsonTypes"

export { TEAM_GAMES_JSON_SCHEMA, type TeamGamesJson }

export function seasonTeamGamesJsonPath(
  projectRoot: string,
  year: string,
  league: "CL" | "PL"
): string {
  return join(projectRoot, "public", "data", "rankings", year, league, "team-games.json")
}

export function weeklyTeamGamesJsonPath(
  projectRoot: string,
  year: string,
  weekKey: string,
  league: "CL" | "PL"
): string {
  return join(
    projectRoot,
    "public",
    "data",
    "rankings",
    "weekly",
    year,
    weekKey,
    league,
    "team-games.json"
  )
}

export function buildTeamGamesJson(
  year: string,
  league: "CL" | "PL",
  teams: Record<string, number>,
  period: "season" | "week",
  weekKey?: string
): TeamGamesJson {
  return {
    schemaVersion: TEAM_GAMES_JSON_SCHEMA,
    year,
    league,
    period,
    ...(weekKey ? { weekKey } : {}),
    source: "canonical",
    generatedAt: new Date().toISOString(),
    teams,
  }
}

export function writeTeamGamesJsonFile(path: string, payload: TeamGamesJson): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeJsonFileWithRetrySync(path, payload)
}

export function readTeamGamesJsonFile(path: string): TeamGamesJson | null {
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as TeamGamesJson
    if (raw?.schemaVersion !== TEAM_GAMES_JSON_SCHEMA) return null
    if (!raw.teams || typeof raw.teams !== "object") return null
    return raw
  } catch {
    return null
  }
}

export function writeSeasonTeamGamesFromAggregate(
  projectRoot: string,
  year: string,
  byLeague: TeamGamesByLeague
): void {
  for (const lg of ["CL", "PL"] as const) {
    const payload = buildTeamGamesJson(year, lg, byLeague[lg], "season")
    writeTeamGamesJsonFile(seasonTeamGamesJsonPath(projectRoot, year, lg), payload)
  }
}

export function writeWeeklyTeamGamesFromAggregate(
  projectRoot: string,
  year: string,
  weekKey: string,
  byLeague: TeamGamesByLeague
): void {
  for (const lg of ["CL", "PL"] as const) {
    const payload = buildTeamGamesJson(year, lg, byLeague[lg], "week", weekKey)
    writeTeamGamesJsonFile(weeklyTeamGamesJsonPath(projectRoot, year, weekKey, lg), payload)
  }
}

/** クライアント fetch 用の URL パス（/data/rankings/...） */
export function teamGamesJsonRelativeUrl(
  year: string,
  league: string,
  weekKey?: string
): string {
  if (weekKey) {
    return `data/rankings/weekly/${year}/${weekKey}/${league}/team-games.json`
  }
  return `data/rankings/${year}/${league}/team-games.json`
}
