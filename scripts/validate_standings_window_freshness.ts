/** Read-only Phase 29 verification. Exit 2 means stale output; exit 1 means execution failure. */
import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { aggregateTeamStandingsFromCanonical } from "@/lib/standings/aggregateTeamStandingsFromCanonical"
import { derivedTeamStandingsRelPath, publicTeamStandingsRelPath, derivedWeeklyTeamStandingsRelPath, publicWeeklyTeamStandingsRelPath } from "@/lib/standings/paths"
import { isTeamStandingsJson, type TeamStandingRow } from "@/lib/standings/types"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { parseGameDateYmdFromCanonical } from "@/lib/yahooGame/gameDateFromCanonical"
import { tuesdayWeekKeyFromYmd } from "@/lib/yahooGame/jstPeriodKeys"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
let year = "2026", from = "", to = "", fail = false
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === "--fail") { fail = true; continue }
  if (!["--year", "--from", "--to"].includes(arg) || !args[i + 1]) throw new Error(`Invalid argument: ${arg}`)
  const value = args[++i]
  if (arg === "--year") year = value
  if (arg === "--from") from = value
  if (arg === "--to") to = value
}
if (!/^\d{4}$/.test(year)) throw new Error("Invalid year")
for (const date of [from, to].filter(Boolean)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || !date.startsWith(`${year}-`)) throw new Error(`Invalid date: ${date}`)
}
if (from && to && from > to) throw new Error("--from must not be after --to")
console.log(`[standings-freshness] loading canonical input for ${year}...`)
const docs = loadCanonicalGamesMergedForDerivedPipeline(root, { year })
console.log(`[standings-freshness] loaded ${docs.length} games; checking season and target weeks...`)
if (!docs.length) throw new Error(`No canonical input for ${year}`)
const weeks = new Set<string>()
function addWeek(date: string) {
  const key = tuesdayWeekKeyFromYmd(date)
  if (key) weeks.add(key)
}
for (const doc of docs) {
  const date = parseGameDateYmdFromCanonical(doc)
  if (date && (!from || date >= from) && (!to || date <= to)) addWeek(date)
}
if (from) addWeek(from)
if (to) addWeek(to)
let checked = 0
const errors: string[] = []
function check(rel: string, league: string, expected: TeamStandingRow[], optionalEmpty = false) {
  checked++
  const abs = join(root, rel)
  if (optionalEmpty && !existsSync(abs) && !expected.some(row => row.g > 0)) return
  try {
    const actual = JSON.parse(readFileSync(abs, "utf8"))
    if (!isTeamStandingsJson(actual) || actual.year !== year || actual.league !== league || actual.source !== "canonical") {
      errors.push(`${rel}: invalid metadata`)
    } else if (!isDeepStrictEqual(actual.rows, expected)) {
      errors.push(`${rel}: rows differ from canonical aggregation`)
    }
  } catch (error) {
    errors.push(`${rel}: ${error instanceof Error ? error.message : error}`)
  }
}
for (const league of ["CL", "PL"] as const) {
  const rows = aggregateTeamStandingsFromCanonical(docs, year, league, { projectRoot: root, includeToday: true })
  check(derivedTeamStandingsRelPath(year, league), league, rows)
  check(publicTeamStandingsRelPath(year, league), league, rows)
}
for (const week of [...weeks].sort()) {
  const end = new Date(Date.parse(week) + 5 * 86400000).toISOString().slice(0, 10)
  const weeklyDocs = docs.filter(doc => {
    const date = parseGameDateYmdFromCanonical(doc)
    return date != null && date >= week && date <= end
  })
  for (const league of ["CL", "PL"] as const) {
    const rows = aggregateTeamStandingsFromCanonical(weeklyDocs, year, league, { projectRoot: root, includeToday: true })
    check(derivedWeeklyTeamStandingsRelPath(year, week, league), league, rows, true)
    check(publicWeeklyTeamStandingsRelPath(year, week, league), league, rows, true)
  }
}
for (const error of errors) console.error(`[standings-freshness] ${error}`)
console.log(`[standings-freshness] checked=${checked} errors=${errors.length}`)
if (fail && errors.length) process.exitCode = 2
