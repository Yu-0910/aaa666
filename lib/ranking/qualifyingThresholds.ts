/**
 * 2026 規定: Node 専用（fs）。クライアントは qualifyingThresholdsShared を import すること。
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import {
  buildMinPAByTeamFromTeamGames,
  buildPitchingThresholdsFromTeamGames,
  type QualifyingTeamEntry,
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
  const json = loadTeamGamesJsonSync(projectRoot, year, lg, weekKey)
  if (json?.teams && Object.keys(json.teams).length > 0) {
    return buildPitchingThresholdsFromTeamGames(json.teams)
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
