/**
 * Phase 32 Phase 0 検証: カウント別球種の prototype 集計と walk 寄せなしの確認。
 *
 * 使い方:
 *   npx tsx scripts/diagnose_pitcher_count_pitch_types.ts --scan
 *   npx tsx scripts/diagnose_pitcher_count_pitch_types.ts --yahoo 2101204 --year 2026
 *   npx tsx scripts/diagnose_pitcher_count_pitch_types.ts --npb 11515133 --year 2026
 */
import { existsSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { parseRosterCsv } from "../lib/yahooGame/rosterCsv"
import {
  accumulatePitcherCountPitchTypesFromDocs,
  buildPitcherCountPitchTypesRows,
} from "../lib/yahooGame/pitcherCountPitchTypesAgg"
import { ORDERED_PITCH_COUNT_KEYS } from "../lib/yahooGame/pitchCountSim"
import { plateAppearanceLastResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { pitchCountKeyForPlateAppearance } from "../lib/yahooGame/pitchCountSim"
import { isWalkLikeResultText } from "../lib/baseballWalkResult"
import { yahooPitcherIdForVsHandFromPa } from "../lib/yahooGame/yahooPitcherIdForVsHandFromPa"
import { sortPitchEventsByPitchIndex } from "../lib/yahooGame/sortPitchEventsByPitchIndex"
import { countBeforePitchAtIndex } from "../lib/yahooGame/pitchCountSim"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; yahoo: string | null; npb: string | null; scan: boolean } {
  const args = process.argv.slice(2)
  let year = "2026"
  let yahoo: string | null = null
  let npb: string | null = null
  let scan = false
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
    } else if (args[i] === "--scan") {
      scan = true
    }
  }
  return { year, yahoo, npb, scan }
}

function loadRoster() {
  const p = join(projectRoot, "_data", "npb_roster_2026.csv")
  if (!existsSync(p)) return []
  return parseRosterCsv(readFileSync(p, "utf8"))
}

function loadYahooPitcherToNpb(): Record<string, string> {
  const p = join(projectRoot, "_data", "scraped_games", "derived", "yahoo_pitcher_to_npb.json")
  if (!existsSync(p)) return {}
  try {
    const j = JSON.parse(readFileSync(p, "utf8")) as { map?: Record<string, string> }
    return j.map ?? {}
  } catch {
    return {}
  }
}

function playerNameForNpb(roster: ReturnType<typeof parseRosterCsv>, npbId: string | null): string {
  if (!npbId) return "?"
  return roster.find((r) => r.npbPlayerId === npbId)?.nameJa ?? "?"
}

function yahooIdsForNpb(
  roster: ReturnType<typeof parseRosterCsv>,
  yahooToNpb: Record<string, string>,
  npbId: string,
): string[] {
  const manualPath = join(projectRoot, "_data", "yahoo_pitcher_npb_index.json")
  const fromManual = new Set<string>()
  if (existsSync(manualPath)) {
    try {
      const j = JSON.parse(readFileSync(manualPath, "utf8")) as {
        byNpb?: Record<string, string[]>
      }
      for (const y of j.byNpb?.[npbId] ?? []) fromManual.add(String(y))
    } catch {
      // ignore
    }
  }
  for (const [y, n] of Object.entries(yahooToNpb)) {
    if (n === npbId) fromManual.add(y)
  }
  return [...fromManual]
}

function scanTopPitchers(
  docs: CanonicalGameDocument[],
  roster: ReturnType<typeof parseRosterCsv>,
  yahooToNpb: Record<string, string>,
  topN: number,
) {
  const byYahoo = new Map<string, number>()
  for (const doc of docs) {
    for (const pa of doc.domain?.plateAppearances ?? []) {
      for (const e of pa.pitchEvents ?? []) {
        const pid = String(e.yahooPitcherId ?? pa.yahooPitcherId ?? "").trim()
        if (!pid) continue
        byYahoo.set(pid, (byYahoo.get(pid) ?? 0) + 1)
      }
    }
  }
  const ranked = [...byYahoo.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN)
  console.log(`\n=== top ${topN} pitchers by pitchEvents (${docs.length} games) ===`)
  for (const [yid, n] of ranked) {
    const npb = yahooToNpb[yid] ?? null
    const name = playerNameForNpb(roster, npb)
    console.log(`  yahoo=${yid} npb=${npb ?? "?"} pitches=${n} name=${name}`)
  }
  return ranked[0]?.[0] ?? null
}

function printCountRows(
  label: string,
  rows: ReturnType<typeof buildPitcherCountPitchTypesRows>,
) {
  console.log(`\n=== ${label} ===`)
  let total = 0
  for (const row of rows) {
    total += row.pitches_total
    const top = row.rows
      .slice(0, 3)
      .map((r) => `${r.pitch_type}:${r.pct}%`)
      .join(", ")
    console.log(`  ${row.key}: n=${row.pitches_total} | ${top}`)
  }
  const covered = new Set(rows.map((r) => r.key))
  const empty = ORDERED_PITCH_COUNT_KEYS.filter((k) => !covered.has(k))
  console.log(`  total pitches (non-zero counts): ${total}`)
  if (empty.length) console.log(`  empty counts: ${empty.join(", ")}`)
}

function walkPitchDiffReport(docs: CanonicalGameDocument[], yahooIds: Set<string>) {
  let walkPas = 0
  let diffPitches = 0
  for (const doc of docs) {
    for (const pa of doc.domain?.plateAppearances ?? []) {
      const pid = yahooPitcherIdForVsHandFromPa(pa)
      if (!pid || !yahooIds.has(pid)) continue
      const pe = pa.pitchEvents ?? []
      if (pe.length === 0) continue
      const paText = plateAppearanceLastResultText(pa)
      if (!isWalkLikeResultText(paText)) continue
      walkPas += 1
      const sorted = sortPitchEventsByPitchIndex(pe)
      const paKey = pitchCountKeyForPlateAppearance(pe, paText)
      const lastIdx = sorted.length - 1
      const pitchKey = countBeforePitchAtIndex(sorted, lastIdx)
      if (paKey !== pitchKey) diffPitches += 1
    }
  }
  console.log(`\n=== walk adjustment impact (四球寄せ vs 一球直前) ===`)
  console.log(`  walk PAs (target pitcher): ${walkPas}`)
  console.log(`  last-pitch count differs from Phase16 walk key: ${diffPitches}`)
  console.log(`  → Phase 32 uses per-pitch keys; walk PAs do not force 3-0/3-1/3-2 bucket`)
}

function main(): void {
  const { year, yahoo, npb, scan } = parseArgs()
  const roster = loadRoster()
  const yahooToNpb = loadYahooPitcherToNpb()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, year)
  if (docs.length === 0) {
    console.error("[diag-count-pitch-types] no canonical games")
    process.exit(1)
  }

  let targetYahoo: string | null = yahoo
  if (scan) {
    targetYahoo = scanTopPitchers(docs, roster, yahooToNpb, 10)
    if (!targetYahoo) process.exit(1)
  } else if (npb && !yahoo) {
    const ids = yahooIdsForNpb(roster, yahooToNpb, npb)
    if (ids.length === 0) {
      console.error(`[diag] no yahoo id for npb ${npb}`)
      process.exit(1)
    }
    targetYahoo = ids[0]!
  }

  if (!targetYahoo) {
    console.error("usage: --scan | --yahoo <id> | --npb <id>")
    process.exit(1)
  }

  const npbId = npb ?? yahooToNpb[targetYahoo] ?? null
  const name = playerNameForNpb(roster, npbId)
  console.log(`\n[target] ${name} yahoo=${targetYahoo} npb=${npbId ?? "?"} year=${year} games=${docs.length}`)

  const yahooSet = new Set([targetYahoo])
  const acc = accumulatePitcherCountPitchTypesFromDocs(docs, yahooSet)
  const rows = buildPitcherCountPitchTypesRows(acc)
  printCountRows("byCountPitchTypes (Phase 32 prototype)", rows)
  walkPitchDiffReport(docs, yahooSet)
}

main()
