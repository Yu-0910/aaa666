/**
 * Phase 5: 2026 ランキング規定（team-games / minPA / minIp / ビルド絞り込み）の受け入れ検証。
 *
 *   npx tsx scripts/validate_ranking_qualifying_2026.ts [--year 2026] [--fail]
 */

import { existsSync, readFileSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { minPAFromTeamGames } from "../lib/ranking/qualifyingPA"
import { QUALIFYING_IP_INNINGS_PER_TEAM_GAME } from "../lib/ranking/qualifyingPitching"
import {
  readTeamGamesJsonFile,
  seasonTeamGamesJsonPath,
  weeklyTeamGamesJsonPath,
} from "../lib/ranking/teamGamesJson"
import {
  rowPassesQualifyingPAWithMinMap,
  buildMinPAByTeamFromTeamGames,
  buildPitchingThresholdsFromTeamGames,
} from "../lib/ranking/qualifyingThresholds"
import { rowMeetsPitchingQualifyingIp } from "../lib/ranking/qualifyingPitching"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; fail: boolean } {
  const args = process.argv.slice(2)
  let year = "2026"
  let fail = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    } else if (args[i] === "--fail") {
      fail = true
    }
  }
  return { year, fail }
}

type Row = Record<string, unknown>

function loadJsonArray(path: string): Row[] | null {
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown
    return Array.isArray(raw) ? (raw as Row[]) : null
  } catch {
    return null
  }
}

function listWeekKeys(year: string): string[] {
  const dir = join(projectRoot, "public", "data", "rankings", "weekly", year)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
    .sort()
}

function main(): void {
  const { year, fail } = parseArgs()
  const errors: string[] = []
  const warnings: string[] = []

  console.log(`[validate:ranking-qualifying] year=${year}`)

  for (const lg of ["CL", "PL"] as const) {
    const tgPath = seasonTeamGamesJsonPath(projectRoot, year, lg)
    const tg = readTeamGamesJsonFile(tgPath)
    if (!tg?.teams || Object.keys(tg.teams).length === 0) {
      warnings.push(`${lg}: team-games.json missing or empty (${tgPath})`)
      continue
    }

    const games = Object.values(tg.teams)
    const uniqueGames = new Set(games)
    const minPAByTeam = buildMinPAByTeamFromTeamGames(tg.teams, year)
    const thresholds = buildPitchingThresholdsFromTeamGames(tg.teams)

    console.log(`[${lg}] team-games: ${JSON.stringify(tg.teams)}`)
    for (const [team, g] of Object.entries(tg.teams)) {
      const minPA = minPAFromTeamGames(g, year)
      const minIp = g * QUALIFYING_IP_INNINGS_PER_TEAM_GAME
      console.log(`  ${team}: games=${g} minPA=${minPA} minIp=${minIp}`)
    }

    if (uniqueGames.size < 2 && games.length >= 2) {
      warnings.push(`${lg}: all teams have same teamGames (${games[0]}) — minPA/minIp uniform (OK if schedule even)`)
    }

    const opsPath = join(projectRoot, "public", "data", "rankings", year, lg, "OPS.json")
    const opsAllPath = join(projectRoot, "public", "data", "rankings", year, lg, "OPS_all.json")
    const ops = loadJsonArray(opsPath)
    const opsAll = loadJsonArray(opsAllPath)

    if (!ops) {
      warnings.push(`${lg}: OPS.json missing`)
    } else if (opsAll && ops.length > opsAll.length) {
      errors.push(`${lg}: OPS.json rows (${ops.length}) > OPS_all.json (${opsAll.length})`)
    } else if (opsAll && ops.length > 0 && ops.length === opsAll.length) {
      warnings.push(
        `${lg}: OPS.json row count equals OPS_all — Phase 4 filter may be no-op (no sub-minPA players in source)`
      )
    }

    if (ops && minPAByTeam.size > 0) {
      const fallback = minPAFromTeamGames(Math.max(...games), year)
      for (const row of ops) {
        if (!rowPassesQualifyingPAWithMinMap(row, minPAByTeam, fallback)) {
          errors.push(
            `${lg}: OPS.json row fails minPA (team=${row.team} pa=${row.pa ?? row.PA})`
          )
          break
        }
      }
    }

    const eraPath = join(projectRoot, "public", "data", "rankings", "pitching", year, lg, "防御率.json")
    const eraAllPath = join(
      projectRoot,
      "public",
      "data",
      "rankings",
      "pitching",
      year,
      lg,
      "防御率_all.json"
    )
    const era = loadJsonArray(eraPath)
    const eraAll = loadJsonArray(eraAllPath)
    if (era && thresholds.byTeam.size > 0) {
      for (const row of era) {
        if (!rowMeetsPitchingQualifyingIp(row as Parameters<typeof rowMeetsPitchingQualifyingIp>[0], thresholds)) {
          errors.push(`${lg}: 防御率.json row fails minIp (team=${row.team} ip=${row.ip})`)
          break
        }
      }
      if (eraAll && era.length > eraAll.length) {
        errors.push(`${lg}: 防御率.json rows > 防御率_all.json`)
      }
    }

    const hitsPath = join(projectRoot, "public", "data", "rankings", year, lg, "安打_all.json")
    const hits = loadJsonArray(hitsPath) ?? loadJsonArray(join(projectRoot, "public", "data", "rankings", year, lg, "安打.json"))
    if (!hits?.length) {
      warnings.push(`${lg}: 安打 JSON missing (count metric)`)
    }
  }

  const weekKeys = listWeekKeys(year)
  const sampleWeek = weekKeys[weekKeys.length - 1]
  if (sampleWeek) {
    console.log(`[weekly] sample weekKey=${sampleWeek}`)
    for (const lg of ["CL", "PL"] as const) {
      const wp = weeklyTeamGamesJsonPath(projectRoot, year, sampleWeek, lg)
      const wtg = readTeamGamesJsonFile(wp)
      if (!wtg?.teams || Object.keys(wtg.teams).length === 0) {
        warnings.push(`weekly ${sampleWeek} ${lg}: team-games.json missing`)
        continue
      }
      console.log(`  ${lg} week team-games: ${JSON.stringify(wtg.teams)}`)
      const wOps = loadJsonArray(
        join(projectRoot, "public", "data", "rankings", "weekly", year, sampleWeek, lg, "OPS.json")
      )
      if (wOps) {
        const minPAByTeam = buildMinPAByTeamFromTeamGames(wtg.teams, year)
        const maxG = Math.max(...Object.values(wtg.teams))
        const fallback = minPAFromTeamGames(maxG, year)
        for (const row of wOps) {
          if (!rowPassesQualifyingPAWithMinMap(row, minPAByTeam, fallback)) {
            errors.push(`weekly ${sampleWeek} ${lg}: OPS row fails minPA`)
            break
          }
        }
      }
    }
  } else {
    warnings.push("no weekly week folders — run phase28:build:weekly-rankings")
  }

  for (const w of warnings) console.warn(`[warn] ${w}`)
  for (const e of errors) console.error(`[error] ${e}`)

  if (errors.length > 0) {
    console.error(`[validate:ranking-qualifying] FAILED (${errors.length} errors)`)
    if (fail) process.exit(1)
    process.exit(0)
  }

  console.log(
    `[validate:ranking-qualifying] OK (${warnings.length} warnings). Rebuild: npm run rankings:rebuild`
  )
}

main()
