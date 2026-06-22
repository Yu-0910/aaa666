/**
 * Phase 34: 野手球団別カウント配球（Phase 33）と Phase 14 通算球種投球数の整合検証。
 *
 *   npx tsx scripts/validate_phase34_batter_vs_team_pitch_types_vs_phase14.ts --year 2026
 *   npm run validate:phase34-batter-vs-team-pitch-vs-phase14:fail
 */

import fs from "node:fs"
import path from "node:path"
import { getProjectRoot } from "@/lib/projectRoot"
import {
  BATTER_VS_TEAM_COUNT_PITCH_TYPES_SCHEMA_VERSION,
  type BatterVsTeamCountPitchTypesFile,
} from "@/lib/batterVsTeamCountPitchTypesTypes"

type Phase14File = {
  pitchTypeStats?: Array<{ pitches?: number }>
}

function parseArgs(): { year: string; fail: boolean; yahoo: string | null; limit: number } {
  const args = process.argv.slice(2)
  let year = "2026"
  let fail = false
  let yahoo: string | null = null
  let limit = 0
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!.trim()
      i++
    } else if (args[i] === "--fail") {
      fail = true
    } else if (args[i] === "--yahoo" && args[i + 1]) {
      yahoo = args[i + 1]!.trim()
      i++
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = Math.max(1, parseInt(args[i + 1]!, 10) || 0)
      i++
    }
  }
  return { year, fail, yahoo, limit }
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0
  const n = Number(String(v).trim())
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function loadJson<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T
  } catch {
    return null
  }
}

function phase14PitchTotal(root: string, year: string, yahooId: string): number | null {
  const p = path.join(
    root,
    "_data",
    "derived",
    "player_pitch_from_canonical",
    year,
    `yahoo_${yahooId}.json`,
  )
  const j = loadJson<Phase14File>(p)
  if (!j) return null
  let total = 0
  for (const row of j.pitchTypeStats ?? []) {
    total += num(row.pitches)
  }
  return total
}

function sumPhase33Pitches(file: BatterVsTeamCountPitchTypesFile): number {
  let total = 0
  for (const team of file.teams) {
    total += num(team.pitches_total)
  }
  return total
}

function validatePctRows(file: BatterVsTeamCountPitchTypesFile): string[] {
  const issues: string[] = []
  for (const team of file.teams) {
    for (const row of team.byCountPitchTypes) {
      const sum = row.rows.reduce((s, r) => s + num(r.pitches), 0)
      if (sum !== num(row.pitches_total)) {
        issues.push(
          `${file.yahooBatterId}/${team.teamCode}/${row.key}: rows sum ${sum} != pitches_total ${row.pitches_total}`,
        )
      }
    }
  }
  return issues
}

function main(): void {
  const { year, fail, yahoo, limit } = parseArgs()
  const root = getProjectRoot()
  const dir = path.join(root, "_data", "derived", "player_batter_vs_team_count_pitch_types", year)
  if (!fs.existsSync(dir)) {
    console.error(`[validate:phase34] missing dir ${dir}`)
    process.exit(fail ? 1 : 0)
  }

  let files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("yahoo_") && f.endsWith(".json"))
    .sort()
  if (yahoo) {
    files = files.filter((f) => f === `yahoo_${yahoo}.json`)
  }
  if (limit > 0) files = files.slice(0, limit)

  let checked = 0
  let mismatches = 0
  let pctIssues = 0
  const samples: string[] = []

  for (const f of files) {
    const j = loadJson<BatterVsTeamCountPitchTypesFile>(path.join(dir, f))
    if (!j || j.schemaVersion !== BATTER_VS_TEAM_COUNT_PITCH_TYPES_SCHEMA_VERSION) continue
    checked++

    const phase33Total = sumPhase33Pitches(j)
    const phase14Total = phase14PitchTotal(root, year, j.yahooBatterId)
    if (phase14Total != null && phase33Total > phase14Total) {
      mismatches++
      if (samples.length < 8) {
        samples.push(
          `${j.yahooBatterId}: phase33=${phase33Total} > phase14=${phase14Total}`,
        )
      }
    }

    const pct = validatePctRows(j)
    if (pct.length > 0) {
      pctIssues += pct.length
      if (samples.length < 8) samples.push(...pct.slice(0, 2))
    }
  }

  console.log(
    `[validate:phase34] checked ${checked} files, phase33>phase14 mismatches=${mismatches}, pctRowIssues=${pctIssues}${yahoo ? ` (yahoo=${yahoo})` : ""}`,
  )
  for (const s of samples) console.log(`  ${s}`)

  if (fail && (mismatches > 0 || pctIssues > 0)) {
    process.exit(1)
  }
}

main()
