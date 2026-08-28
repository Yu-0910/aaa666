import { existsSync, readFileSync } from "fs"
import { join } from "path"
import {
  getRequiredInnings,
  resolvePitchingThresholdsForRanking,
} from "../lib/ranking/qualifyingThresholds"
import {
  getRequiredInningsFromContext,
  rowMeetsPitchingQualifyingIp,
  type PitchingQualifyingThresholds,
} from "../lib/ranking/qualifyingPitching"

type StandingsRow = {
  rank?: number
  team?: string
  teamName?: string
  npbLabel?: string
  g?: number
}

function parseArgs(): { fail: boolean } {
  return { fail: process.argv.includes("--fail") }
}

function loadStandingsRows(projectRoot: string, year: string, league: "CL" | "PL"): StandingsRow[] {
  const candidates = [
    join(projectRoot, "public", "data", "standings", year, `${league}.json`),
    join(projectRoot, "public", "standings-json", year, `${league}.json`),
  ]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    const raw = JSON.parse(readFileSync(candidate, "utf8")) as { rows?: unknown[] }
    if (Array.isArray(raw.rows)) return raw.rows as StandingsRow[]
  }
  throw new Error(`standings rows not found: ${year} ${league}`)
}

function expectClose(
  errors: string[],
  label: string,
  actual: number | null | undefined,
  expected: number,
  tolerance = 1e-6
): void {
  if (actual == null || Math.abs(actual - expected) > tolerance) {
    errors.push(`${label}: expected ${expected}, got ${actual ?? "null"}`)
  }
}

function expectTrue(errors: string[], label: string, value: boolean): void {
  if (!value) errors.push(`${label}: expected true`)
}

function expectFalse(errors: string[], label: string, value: boolean): void {
  if (value) errors.push(`${label}: expected false`)
}

function main(): void {
  const { fail } = parseArgs()
  const projectRoot = process.cwd()
  const errors: string[] = []

  expectClose(errors, "1950 CL", getRequiredInningsFromContext("1950", "CL", { teamGames: 130 }), 180)
  expectClose(errors, "1950 PL", getRequiredInningsFromContext("1950", "PL", { teamGames: 120 }), 135)
  expectClose(errors, "1963 CL", getRequiredInningsFromContext("1963", "CL", { teamGames: 140 }), 196)
  expectClose(errors, "1963 PL", getRequiredInningsFromContext("1963", "PL", { teamGames: 150 }), 210)

  const rows1952PL = loadStandingsRows(projectRoot, "1952", "PL").filter(
    (row): row is Required<Pick<StandingsRow, "rank" | "g">> & StandingsRow =>
      Number.isFinite(row.rank) && Number.isFinite(row.g) && Boolean(row.npbLabel ?? row.teamName ?? row.team)
  )
  for (const row of rows1952PL) {
    const teamKey = String(row.npbLabel ?? row.teamName ?? row.team)
    const actual = getRequiredInnings(projectRoot, "1952", "PL", teamKey)
    const expected = row.rank <= 4 ? 180 : 162
    expectClose(errors, `1952 PL ${teamKey} rank=${row.rank}`, actual, expected)
  }

  const row1959PL = loadStandingsRows(projectRoot, "1959", "PL").find(
    (row) => Number.isFinite(row.g) && Boolean(row.npbLabel ?? row.teamName ?? row.team)
  )
  const row1959Key = String(row1959PL?.npbLabel ?? row1959PL?.teamName ?? row1959PL?.team ?? "")
  if (!row1959Key || !Number.isFinite(row1959PL?.g)) {
    errors.push("1959 PL sample row missing")
  } else {
    const row1959Games = Number(row1959PL.g)
    expectClose(
      errors,
      `1959 PL ${row1959Key}`,
      getRequiredInnings(projectRoot, "1959", "PL", row1959Key),
      row1959Games * 1.4
    )
  }

  for (const league of ["CL", "PL"] as const) {
    const sample1962 = loadStandingsRows(projectRoot, "1962", league).find(
      (row) => Number.isFinite(row.g) && Boolean(row.npbLabel ?? row.teamName ?? row.team)
    )
    const sample1962Key = String(sample1962?.npbLabel ?? sample1962?.teamName ?? sample1962?.team ?? "")
    if (!sample1962Key || !Number.isFinite(sample1962?.g)) {
      errors.push(`1962 ${league} sample row missing`)
      continue
    }
    const sample1962Games = Number(sample1962.g)
    expectClose(
      errors,
      `1962 ${league} ${sample1962Key}`,
      getRequiredInnings(projectRoot, "1962", league, sample1962Key),
      sample1962Games * 1.4
    )
  }

  const sample1964 = loadStandingsRows(projectRoot, "1964", "CL").find(
    (row) => Number.isFinite(row.g) && Boolean(row.npbLabel ?? row.teamName ?? row.team)
  )
  const sample1964Key = String(sample1964?.npbLabel ?? sample1964?.teamName ?? sample1964?.team ?? "")
  if (!sample1964Key || !Number.isFinite(sample1964?.g)) {
    errors.push("1964 CL sample row missing")
  } else {
    const sample1964Games = Number(sample1964.g)
    expectClose(
      errors,
      `1964 CL ${sample1964Key}`,
      getRequiredInnings(projectRoot, "1964", "CL", sample1964Key),
      sample1964Games
    )
  }

  const sampleCurrent = loadStandingsRows(projectRoot, "2026", "CL").find(
    (row) => Number.isFinite(row.g) && Boolean(row.npbLabel ?? row.teamName ?? row.team)
  )
  const sampleCurrentKey = String(sampleCurrent?.npbLabel ?? sampleCurrent?.teamName ?? sampleCurrent?.team ?? "")
  if (!sampleCurrentKey || !Number.isFinite(sampleCurrent?.g)) {
    errors.push("2026 CL sample row missing")
  } else {
    const sampleCurrentGames = Number(sampleCurrent.g)
    expectClose(
      errors,
      `2026 CL ${sampleCurrentKey}`,
      getRequiredInnings(projectRoot, "2026", "CL", sampleCurrentKey),
      sampleCurrentGames
    )
  }

  const ipThresholds: PitchingQualifyingThresholds = {
    byTeam: new Map([["T", 120 + 1 / 3]]),
    fallbackMinIp: 120 + 1 / 3,
  }
  expectTrue(
    errors,
    "baseball IP 120.1 qualifies",
    rowMeetsPitchingQualifyingIp({ rank: 1, playerId: "a", name: "A", team: "T", valueText: "", ip: "120.1" }, ipThresholds)
  )
  expectFalse(
    errors,
    "baseball IP 120 does not qualify",
    rowMeetsPitchingQualifyingIp({ rank: 1, playerId: "b", name: "B", team: "T", valueText: "", ip: "120" }, ipThresholds)
  )
  expectTrue(
    errors,
    "decimal IP 120.667 qualifies 120.4 rule",
    rowMeetsPitchingQualifyingIp(
      { rank: 1, playerId: "c", name: "C", team: "T", valueText: "", ip: 120.667 },
      { byTeam: new Map([["T", 120.4]]), fallbackMinIp: 120.4 }
    )
  )

  const thresholds1952 = resolvePitchingThresholdsForRanking(projectRoot, "1952", "PL")
  if (!thresholds1952 || thresholds1952.byTeam.size === 0) {
    errors.push("1952 PL thresholds not resolved")
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`[error] ${error}`)
    console.error(`[validate:pitching-qualifying-history] FAILED (${errors.length} errors)`)
    if (fail) process.exit(1)
    process.exit(0)
  }

  console.log("[validate:pitching-qualifying-history] OK")
}

main()
