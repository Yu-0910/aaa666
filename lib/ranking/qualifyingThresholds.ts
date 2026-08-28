/**
 * 規定閾値: Node 専用（fs）。クライアントは qualifyingThresholdsShared を import すること。
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import {
  buildMinPAByTeamFromTeamGames,
  buildPitchingThresholdsFromStandingsRows,
  buildPitchingThresholdsFromTeamGames,
  type QualifyingTeamEntry,
  type StandingsThresholdRow,
  type TeamGamesJson,
} from "@/lib/ranking/qualifyingThresholdsShared"
import type { PitchingQualifyingThresholds } from "@/lib/ranking/qualifyingPitching"
import {
  readTeamGamesJsonFile,
  seasonTeamGamesJsonPath,
  weeklyTeamGamesJsonPath,
} from "@/lib/ranking/teamGamesJson"

export type { QualifyingTeamEntry, TeamGamesJson }
export {
  buildMinPAByTeamFromTeamGames,
  buildPitchingThresholdsFromTeamGames,
  buildQualifyingEntriesFromTeamGames,
  effectiveMinPAFromMaps,
  rowPassesQualifyingPAWithMinMap,
  fetchTeamGamesJsonClient,
  fetchMinPAByTeamClient,
  fetchPitchingThresholdsClient,
} from "@/lib/ranking/qualifyingThresholdsShared"

export function loadTeamGamesJsonSync(
  projectRoot: string,
  year: string,
  league: "CL" | "PL",
  weekKey?: string
): TeamGamesJson | null {
  const path = weekKey
    ? weeklyTeamGamesJsonPath(projectRoot, year, weekKey, league)
    : seasonTeamGamesJsonPath(projectRoot, year, league)
  return readTeamGamesJsonFile(path)
}

function loadStandingsThresholdRowsSync(
  projectRoot: string,
  year: string,
  league: "CL" | "PL",
  weekKey?: string
): StandingsThresholdRow[] | null {
  const relPaths = weekKey
    ? [join("public", "data", "standings", "weekly", year, weekKey, `${league}.json`)]
    : [
        join("public", "data", "standings", year, `${league}.json`),
        join("public", "standings-json", year, `${league}.json`),
      ]

  for (const relPath of relPaths) {
    const fullPath = join(projectRoot, relPath)
    if (!existsSync(fullPath)) continue
    try {
      const raw = JSON.parse(readFileSync(fullPath, "utf-8")) as { rows?: unknown[] }
      if (Array.isArray(raw?.rows)) return raw.rows as StandingsThresholdRow[]
    } catch {
      continue
    }
  }

  return null
}

export function resolveMinPAByTeamForRanking(
  projectRoot: string,
  year: string,
  league: string,
  weekKey?: string
): Map<string, number> {
  const lg = league.toUpperCase() as "CL" | "PL"
  const json = loadTeamGamesJsonSync(projectRoot, year, lg, weekKey)
  if (json?.teams && Object.keys(json.teams).length > 0) {
    return buildMinPAByTeamFromTeamGames(json.teams, year)
  }
  return new Map()
}

export function resolvePitchingThresholdsForRanking(
  projectRoot: string,
  year: string,
  league: string,
  weekKey?: string
): PitchingQualifyingThresholds | null {
  const lg = league.toUpperCase() as "CL" | "PL"
  const standingsRows = loadStandingsThresholdRowsSync(projectRoot, year, lg, weekKey)
  if (standingsRows && standingsRows.length > 0) {
    return buildPitchingThresholdsFromStandingsRows(standingsRows, year, lg)
  }
  const json = loadTeamGamesJsonSync(projectRoot, year, lg, weekKey)
  if (json?.teams && Object.keys(json.teams).length > 0) {
    return buildPitchingThresholdsFromTeamGames(json.teams, year, lg)
  }
  return null
}

export function tryReadTeamGamesFromPublicDir(
  year: string,
  league: "CL" | "PL",
  weekKey?: string
): TeamGamesJson | null {
  const rel = weekKey
    ? join("public", "data", "rankings", "weekly", year, weekKey, league, "team-games.json")
    : join("public", "data", "rankings", year, league, "team-games.json")
  const path = join(process.cwd(), rel)
  if (!existsSync(path)) return null
  return readTeamGamesJsonFile(path)
}

export function getRequiredInnings(
  projectRoot: string,
  year: string,
  league: string,
  team: string,
  weekKey?: string
): number | null {
  const thresholds = resolvePitchingThresholdsForRanking(projectRoot, year, league, weekKey)
  if (!thresholds) return null
  const key = team.trim()
  return key ? (thresholds.byTeam.get(key) ?? thresholds.fallbackMinIp) : thresholds.fallbackMinIp
}
