/**
 * Phase 29: canonical からチーム順位表 JSON を生成する。
 *
 * 実行:
 *   npx tsx scripts/phase29_build_team_standings.ts --year 2026
 *   npm run phase29:build:standings -- --year 2026
 *
 * 出力:
 *   _data/derived/team_standings/{year}/{CL|PL}.json
 *   public/data/standings/{year}/{CL|PL}.json
 */

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { aggregateTeamStandingsByLeagueFromCanonical } from "@/lib/standings/aggregateTeamStandingsFromCanonical"
import {
  derivedTeamStandingsRelPath,
  publicTeamStandingsRelPath,
} from "@/lib/standings/paths"
import {
  TEAM_STANDINGS_JSON_SCHEMA,
  type StandingsLeague,
  type TeamStandingsJson,
} from "@/lib/standings/types"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    }
  }
  return { year }
}

function writeStandingsJson(absPath: string, payload: TeamStandingsJson): void {
  mkdirSync(dirname(absPath), { recursive: true })
  writeFileSync(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
}

function buildPayload(
  year: string,
  league: StandingsLeague,
  rows: TeamStandingsJson["rows"],
): TeamStandingsJson {
  return {
    schemaVersion: TEAM_STANDINGS_JSON_SCHEMA,
    year,
    league,
    source: "canonical",
    generatedAt: new Date().toISOString(),
    rows,
  }
}

function main(): void {
  process.chdir(projectRoot)
  const { year } = parseArgs()

  console.log(`[phase29] building team standings for ${year}...`)
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  const byLeague = aggregateTeamStandingsByLeagueFromCanonical(docs, year, { projectRoot })

  for (const league of ["CL", "PL"] as const) {
    const rows = byLeague[league]
    const payload = buildPayload(year, league, rows)

    for (const row of rows) {
      if (row.g !== row.w + row.l + row.t) {
        console.warn(
          `[phase29] WARN ${league} ${row.team}: g(${row.g}) != w+l+t(${row.w + row.l + row.t})`,
        )
      }
    }

    const derivedPath = join(projectRoot, derivedTeamStandingsRelPath(year, league))
    const publicPath = join(projectRoot, publicTeamStandingsRelPath(year, league))
    writeStandingsJson(derivedPath, payload)
    writeStandingsJson(publicPath, payload)
    console.log(`[phase29] ${league}: ${rows.length} rows → ${derivedTeamStandingsRelPath(year, league)}`)
  }

  console.log("[phase29] done")
}

main()
