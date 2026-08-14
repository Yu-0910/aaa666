/**
 * Phase 4: チーム順位表 JSON（Phase 29 出力）の受け入れ検証。
 *
 *   npx tsx scripts/validate_team_standings_2026.ts [--year 2026] [--fail]
 */

import { existsSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import {
  derivedTeamStandingsRelPath,
  publicTeamStandingsRelPath,
} from "@/lib/standings/paths"
import {
  CL_TEAM_SHORTS,
  PL_TEAM_SHORTS,
  teamDisplayNameFromCode,
  teamShortFromCode,
} from "@/lib/standings/teamCodes"
import {
  isTeamStandingsJson,
  type StandingsLeague,
  type TeamStandingRow,
  type TeamStandingsJson,
} from "@/lib/standings/types"
import { readTeamGamesJsonFile, seasonTeamGamesJsonPath } from "@/lib/ranking/teamGamesJson"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

const EXPECTED_TEAMS: Record<StandingsLeague, readonly string[]> = {
  CL: CL_TEAM_SHORTS,
  PL: PL_TEAM_SHORTS,
}

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

function loadStandings(absPath: string): TeamStandingsJson | null {
  if (!existsSync(absPath)) return null
  try {
    const raw: unknown = JSON.parse(readFileSync(absPath, "utf8"))
    return isTeamStandingsJson(raw) ? raw : null
  } catch {
    return null
  }
}

function approxEq(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps
}

function validateRow(row: TeamStandingRow, lg: StandingsLeague, errors: string[], warnings: string[]): void {
  const tag = `${lg}/${row.team}`

  if (row.g !== row.w + row.l + row.t) {
    errors.push(`${tag}: g(${row.g}) !== w+l+t(${row.w + row.l + row.t})`)
  }

  if (row.w < 0 || row.l < 0 || row.t < 0 || row.g < 0) {
    errors.push(`${tag}: negative w/l/t/g`)
  }

  const decisionGames = row.w + row.l
  if (decisionGames > 0 && row.pct != null) {
    const expected = row.w / decisionGames
    if (!approxEq(row.pct, expected, 1e-4)) {
      errors.push(`${tag}: pct(${row.pct}) != w/(w+l)(${expected})`)
    }
  } else if (decisionGames === 0 && row.pct != null) {
    warnings.push(`${tag}: pct set but w+l=0`)
  }

  const hitParts = row.singles + row.doubles + row.triples + row.hr
  if (row.h > 0 && hitParts !== row.h) {
    errors.push(`${tag}: singles+doubles+triples+hr(${hitParts}) !== h(${row.h})`)
  }

  if (row.avg != null && row.avg > 0) {
    const ab = Math.round(row.h / row.avg)
    const expectedAvg = ab > 0 ? row.h / ab : null
    if (expectedAvg != null && !approxEq(row.avg, expectedAvg, 1e-6)) {
      errors.push(`${tag}: avg(${row.avg}) != h/ab(${expectedAvg}) with inferred ab=${ab}`)
    }

    const tb = row.singles + row.doubles * 2 + row.triples * 3 + row.hr * 4
    const expectedSlg = ab > 0 ? tb / ab : null
    if (row.slg != null && expectedSlg != null && !approxEq(row.slg, expectedSlg, 1e-6)) {
      errors.push(
        `${tag}: slg(${row.slg}) != TB/AB(${expectedSlg}) with TB=${tb} AB=${ab}`,
      )
    }
  }

  const expectedName = teamDisplayNameFromCode(row.team)
  if (row.teamName && row.teamName !== expectedName) {
    warnings.push(`${tag}: teamName "${row.teamName}" vs display map "${expectedName}"`)
  }

  if (row.g >= 10 && row.ops == null) {
    warnings.push(`${tag}: g=${row.g} but ops is null`)
  }
  if (row.g >= 10 && row.era == null) {
    warnings.push(`${tag}: g=${row.g} but era is null`)
  }
}

function validateLeaguePayload(
  payload: TeamStandingsJson,
  lg: StandingsLeague,
  year: string,
  label: string,
  errors: string[],
  warnings: string[],
): void {
  if (payload.year !== year) {
    errors.push(`${label}: year mismatch (${payload.year} != ${year})`)
  }
  if (payload.league !== lg) {
    errors.push(`${label}: league mismatch (${payload.league} != ${lg})`)
  }
  if (!payload.generatedAt) {
    errors.push(`${label}: missing generatedAt`)
  }

  const expected = new Set(EXPECTED_TEAMS[lg])
  if (payload.rows.length !== 6) {
    errors.push(`${label}: expected 6 rows, got ${payload.rows.length}`)
  }

  const seenTeams = new Set<string>()
  const ranks = new Set<number>()
  for (const row of payload.rows) {
    validateRow(row, lg, errors, warnings)
    seenTeams.add(row.team)
    ranks.add(row.rank)
    const short = teamShortFromCode(row.team)
    if (!expected.has(short)) {
      errors.push(`${label}: unexpected team code ${row.team} (${short})`)
    }
  }

  for (const short of EXPECTED_TEAMS[lg]) {
    const code = payload.rows.find((r) => teamShortFromCode(r.team) === short)?.team
    if (!code || !seenTeams.has(code)) {
      errors.push(`${label}: missing team ${short}`)
    }
  }

  if (ranks.size !== payload.rows.length) {
    errors.push(`${label}: duplicate rank values`)
  }
  for (let r = 1; r <= payload.rows.length; r++) {
    if (!ranks.has(r)) {
      errors.push(`${label}: missing rank ${r}`)
    }
  }

  const sorted = [...payload.rows].sort((a, b) => {
    const pctA = a.pct ?? -1
    const pctB = b.pct ?? -1
    if (pctB !== pctA) return pctB - pctA
    if (b.w !== a.w) return b.w - a.w
    return a.team.localeCompare(b.team)
  })
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]!.rank !== i + 1) {
      warnings.push(`${label}: rank order may differ from pct/w sort at position ${i + 1}`)
      break
    }
  }
}

function compareDerivedAndPublic(
  derived: TeamStandingsJson,
  pub: TeamStandingsJson,
  lg: StandingsLeague,
  errors: string[],
): void {
  if (derived.rows.length !== pub.rows.length) {
    errors.push(`${lg}: derived/public row count mismatch`)
    return
  }
  for (const d of derived.rows) {
    const p = pub.rows.find((r) => r.team === d.team)
    if (!p) {
      errors.push(`${lg}: team ${d.team} in derived but not public`)
      continue
    }
    if (d.w !== p.w || d.l !== p.l || d.t !== p.t || d.g !== p.g) {
      errors.push(
        `${lg}/${d.team}: derived W-L-T-G (${d.w}-${d.l}-${d.t}/${d.g}) != public (${p.w}-${p.l}-${p.t}/${p.g})`,
      )
    }
  }
}

function compareTeamGames(
  payload: TeamStandingsJson,
  lg: StandingsLeague,
  year: string,
  warnings: string[],
): void {
  const tgPath = seasonTeamGamesJsonPath(projectRoot, year, lg)
  const tg = readTeamGamesJsonFile(tgPath)
  if (!tg?.teams) {
    warnings.push(`${lg}: team-games.json missing — skip g cross-check`)
    return
  }

  for (const row of payload.rows) {
    const short = teamShortFromCode(row.team)
    const tgGames = tg.teams[short]
    if (tgGames == null) continue
    const diff = Math.abs(row.g - tgGames)
    if (diff > 2) {
      warnings.push(
        `${lg}/${short}: standings g=${row.g} vs team-games=${tgGames} (diff=${diff}; 交流戦・フィルタ差の可能性)`,
      )
    }
  }
}

function main(): void {
  const { year, fail } = parseArgs()
  const errors: string[] = []
  const warnings: string[] = []

  console.log(`[validate:team-standings] year=${year}`)

  for (const lg of ["CL", "PL"] as const) {
    const pubPath = join(projectRoot, publicTeamStandingsRelPath(year, lg))
    const derPath = join(projectRoot, derivedTeamStandingsRelPath(year, lg))

    const pub = loadStandings(pubPath)
    const derived = loadStandings(derPath)

    if (!pub) {
      errors.push(`${lg}: missing or invalid public JSON (${pubPath})`)
      continue
    }
    if (!derived) {
      warnings.push(`${lg}: derived JSON missing (${derPath})`)
    }

    console.log(
      `[${lg}] public generatedAt=${pub.generatedAt} rows=${pub.rows.length} leader=${pub.rows[0]?.teamName ?? "—"} ${pub.rows[0]?.w ?? "?"}-${pub.rows[0]?.l ?? "?"}-${pub.rows[0]?.t ?? "?"}`,
    )

    validateLeaguePayload(pub, lg, year, `${lg}/public`, errors, warnings)
    if (derived) {
      validateLeaguePayload(derived, lg, year, `${lg}/derived`, errors, warnings)
      compareDerivedAndPublic(derived, pub, lg, errors)
    }
    compareTeamGames(pub, lg, year, warnings)
  }

  for (const w of warnings) console.warn(`[warn] ${w}`)
  for (const e of errors) console.error(`[error] ${e}`)

  if (errors.length > 0) {
    console.error(`[validate:team-standings] FAILED (${errors.length} errors, ${warnings.length} warnings)`)
    if (fail) process.exit(1)
    process.exit(0)
  }

  console.log(
    `[validate:team-standings] OK (${warnings.length} warnings). Rebuild: npm run phase29:build:standings -- --year ${year}`,
  )
}

main()
