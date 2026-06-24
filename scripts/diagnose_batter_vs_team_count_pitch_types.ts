/**
 * Phase 33 Phase 0 検証: 打者×球団×カウント別球種 prototype 集計。
 *
 * 使い方:
 *   npx tsx scripts/diagnose_batter_vs_team_count_pitch_types.ts --scan
 *   npx tsx scripts/diagnose_batter_vs_team_count_pitch_types.ts --yahoo 1100097 --year 2026
 *   npx tsx scripts/diagnose_batter_vs_team_count_pitch_types.ts --npb 71075138 --year 2026 --team H
 *   npx tsx scripts/diagnose_batter_vs_team_count_pitch_types.ts --yahoo 1100097 --year 2026 --json
 */
import { existsSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import {
  BATTER_VS_TEAM_MIN_PITCHES_DISPLAY,
  PHASE33_REFERENCE_BATTER,
} from "../lib/batterVsTeamCountPitchTypesTypes"
import { loadScheduleStadiumByGameId } from "../lib/loadScheduleStadiumByGameId"
import { parseRosterCsv } from "../lib/yahooGame/rosterCsv"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { injectTeamsFromTextPbpIfMissing } from "../lib/yahooGame/inferTeamsFromTextPbp"
import {
  accumulateBatterVsTeamCountPitchTypesFromDocs,
  buildBatterVsTeamCountPitchTypesTeamBlocks,
} from "../lib/yahooGame/batterVsTeamCountPitchTypesAgg"
import { ORDERED_PITCH_COUNT_KEYS } from "../lib/yahooGame/pitchCountSim"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): {
  year: string
  yahoo: string | null
  npb: string | null
  team: string | null
  scan: boolean
  json: boolean
} {
  const args = process.argv.slice(2)
  let year = "2026"
  let yahoo: string | null = null
  let npb: string | null = null
  let team: string | null = null
  let scan = false
  let json = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!.trim()
      i++
    } else if (args[i] === "--yahoo" && args[i + 1]) {
      yahoo = args[i + 1]!.trim()
      i++
    } else if (args[i] === "--npb" && args[i + 1]) {
      npb = args[i + 1]!.trim()
      i++
    } else if (args[i] === "--team" && args[i + 1]) {
      team = args[i + 1]!.trim()
      i++
    } else if (args[i] === "--scan") {
      scan = true
    } else if (args[i] === "--json") {
      json = true
    }
  }
  return { year, yahoo, npb, team, scan, json }
}

function resolveYahooBatterId(npb: string | null, yahoo: string | null): string | null {
  if (yahoo) return yahoo
  if (!npb) return null
  const rosterPath = join(projectRoot, "_data", "npb_roster_2026.csv")
  if (!existsSync(rosterPath)) return npb
  const roster = parseRosterCsv(readFileSync(rosterPath, "utf8"))
  const row = roster.find((r) => r.npbPlayerId === npb)
  if (!row) return npb
  return row.npbPlayerId
}

function scanTopBattersByPitchEvents(docs: CanonicalGameDocument[], limit = 10): void {
  const counts = new Map<string, number>()
  for (const baseDoc of docs) {
    const doc = injectTeamsFromTextPbpIfMissing(baseDoc)
    for (const pa of doc.domain?.plateAppearances ?? []) {
      const bid = String(pa.yahooBatterId ?? "").trim()
      if (!bid) continue
      const n = (pa.pitchEvents ?? []).length
      if (n <= 0) continue
      counts.set(bid, (counts.get(bid) ?? 0) + n)
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
  console.log(`[diagnose:phase33] top ${limit} batters by pitchEvents (${docs.length} games):`)
  for (const [bid, n] of sorted) {
    console.log(`  yahoo=${bid} pitches=${n}`)
  }
}

function printTeamBlock(
  teamCode: string,
  blocks: ReturnType<typeof buildBatterVsTeamCountPitchTypesTeamBlocks>,
): void {
  const block = blocks.find((b) => b.teamCode === teamCode)
  if (!block) {
    console.log(`[diagnose:phase33] team ${teamCode}: no data (min=${BATTER_VS_TEAM_MIN_PITCHES_DISPLAY})`)
    return
  }
  console.log(
    `[diagnose:phase33] team ${teamCode} (${block.label}) pitches_total=${block.pitches_total}`,
  )
  for (const key of ORDERED_PITCH_COUNT_KEYS) {
    const row = block.byCountPitchTypes.find((r) => r.key === key)
    if (!row || row.pitches_total <= 0) continue
    const top3 = row.rows
      .slice(0, 3)
      .map((r) => `${r.pitch_type} ${r.pct}%`)
      .join(", ")
    console.log(`  ${key}: n=${row.pitches_total} | ${top3}`)
  }
  const vsLTotal = block.byCountPitchTypesVsL?.reduce((s, r) => s + r.pitches_total, 0) ?? 0
  const vsRTotal = block.byCountPitchTypesVsR?.reduce((s, r) => s + r.pitches_total, 0) ?? 0
  console.log(`  vsL pitches=${vsLTotal} vsR pitches=${vsRTotal}`)
}

function main(): void {
  const { year, yahoo, npb, team, scan, json } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  if (docs.length === 0) {
    console.error("[diagnose:phase33] no canonical games")
    process.exit(1)
  }

  if (scan) {
    scanTopBattersByPitchEvents(docs)
    console.log(
      `[diagnose:phase33] reference batter: ${PHASE33_REFERENCE_BATTER.nameJa} yahoo=${PHASE33_REFERENCE_BATTER.yahooBatterId}`,
    )
    console.log(
      `[diagnose:phase33] alt (no canonical data yet): ${PHASE33_REFERENCE_BATTER_ALT.nameJa} roster=${PHASE33_REFERENCE_BATTER_ALT.rosterId}`,
    )
    return
  }

  const bid =
    resolveYahooBatterId(npb, yahoo) ?? PHASE33_REFERENCE_BATTER.yahooBatterId
  if (!bid) {
    console.error("[diagnose:phase33] specify --yahoo or --npb (roster public_id required)")
    process.exit(1)
  }

  const stadiumByGameId = loadScheduleStadiumByGameId(year, projectRoot)
  const acc = accumulateBatterVsTeamCountPitchTypesFromDocs(docs, bid, stadiumByGameId)
  const teams = buildBatterVsTeamCountPitchTypesTeamBlocks(acc, 0)

  if (json) {
    console.log(
      JSON.stringify(
        {
          yahooBatterId: bid,
          teams,
          teamCount: teams.length,
          pitchesTotal: teams.reduce((s, t) => s + t.pitches_total, 0),
        },
        null,
        2,
      ),
    )
    return
  }

  console.log(
    `[diagnose:phase33] yahoo=${bid} teams=${teams.length} pitches=${teams.reduce((s, t) => s + t.pitches_total, 0)}`,
  )
  if (team) {
    printTeamBlock(team, teams)
  } else {
    for (const block of teams) {
      printTeamBlock(block.teamCode, teams)
      console.log("")
    }
  }
}

main()
