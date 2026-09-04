/**
 * 投手側 splits.byCatcher と捕手側 player_catcher_pitcher_splits の対称性検証。
 * npx tsx scripts/validate_catcher_pitcher_split_symmetry.ts --year 2026 --fail
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { CatcherPitcherSplitsDerived } from "@/lib/catcherPitcherSplits"
import type { PitcherSeasonPocPayload, PitcherSeasonPocCatcherRow } from "@/lib/pitcherSeasonPocTypes"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"

type Args = {
  year: string
  failOnError: boolean
  onlyPitcherNpbIds: Set<string> | null
  onlyCatcherNpbIds: Set<string> | null
}

type ReverseRow = {
  catcherNpbId: string
  pitcherNpbId: string
  bf: number
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  ipOuts: number
  er: number | null
  games: number | null
  wins: number | null
  losses: number | null
  qsCount: number | null
  ibb: number | null
}

function parseCsvSet(raw: string | undefined): Set<string> | null {
  if (!raw) return null
  const vals = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
  return vals.length ? new Set(vals) : null
}

function parseArgs(argv: string[]): Args {
  const yearIdx = argv.indexOf("--year")
  const onlyPitcherIdx = argv.indexOf("--only-pitcher-npb-ids")
  const onlyCatcherIdx = argv.indexOf("--only-catcher-npb-ids")
  return {
    year: yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() || "2026" : "2026",
    failOnError: argv.includes("--fail"),
    onlyPitcherNpbIds: parseCsvSet(onlyPitcherIdx >= 0 ? argv[onlyPitcherIdx + 1] : undefined),
    onlyCatcherNpbIds: parseCsvSet(onlyCatcherIdx >= 0 ? argv[onlyCatcherIdx + 1] : undefined),
  }
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T
  } catch {
    return null
  }
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function main() {
  const { year, failOnError, onlyPitcherNpbIds, onlyCatcherNpbIds } = parseArgs(process.argv.slice(2))
  const root = getProjectRoot()
  const pitcherDir = path.join(root, "_data", "derived", "player_season_pitching_poc", year)
  const catcherDir = path.join(root, "_data", "derived", "player_catcher_pitcher_splits", year)

  if (!fs.existsSync(pitcherDir) || !fs.existsSync(catcherDir)) {
    const msg = `missing derived dirs pitcher=${pitcherDir} catcher=${catcherDir}`
    if (failOnError) {
      console.error(`[validate-catcher-pitcher-symmetry] FAIL: ${msg}`)
      process.exit(1)
    }
    console.warn(`[validate-catcher-pitcher-symmetry] SKIP: ${msg}`)
    return
  }

  const reverse = new Map<string, ReverseRow>()
  for (const f of fs.readdirSync(catcherDir).filter((name) => name.startsWith("npb_") && name.endsWith(".json"))) {
    const payload = readJson<CatcherPitcherSplitsDerived>(path.join(catcherDir, f))
    if (!payload || payload.schemaVersion !== "player-catcher-pitcher-splits-v1") continue
    const catcherNpbId = String(payload.npbCatcherId ?? "").trim()
    if (!catcherNpbId) continue
    if (onlyCatcherNpbIds && !onlyCatcherNpbIds.has(catcherNpbId)) continue
    for (const row of payload.rows ?? []) {
      const pitcherNpbId = String(row.pitcherNpbId ?? "").trim()
      if (!pitcherNpbId) continue
      if (onlyPitcherNpbIds && !onlyPitcherNpbIds.has(pitcherNpbId)) continue
      reverse.set(`${pitcherNpbId}::${catcherNpbId}`, {
        catcherNpbId,
        pitcherNpbId,
        bf: row.bf ?? 0,
        ab: row.ab ?? 0,
        h: row.h ?? 0,
        hr: row.hr ?? 0,
        so: row.so ?? 0,
        bb: row.bb ?? 0,
        hbp: row.hbp ?? 0,
        ipOuts: row.ipOuts ?? 0,
        er: row.er ?? null,
        games: row.games ?? null,
        wins: row.wins ?? null,
        losses: row.losses ?? null,
        qsCount: row.qsCount ?? null,
        ibb: row.ibb ?? null,
      })
    }
  }

  const errors: string[] = []
  let checked = 0
  for (const f of fs.readdirSync(pitcherDir).filter((name) => name.startsWith("npb_") && name.endsWith(".json"))) {
    const payload = readJson<PitcherSeasonPocPayload>(path.join(pitcherDir, f))
    if (!payload || payload.schemaVersion !== "phase-pitcher-poc-season-v1") continue
    const pitcherNpbId = String(payload.npbPlayerId ?? "").trim()
    if (!pitcherNpbId) continue
    if (onlyPitcherNpbIds && !onlyPitcherNpbIds.has(pitcherNpbId)) continue

    for (const row of payload.splits?.byCatcher ?? []) {
      const catcherNpbId = resolveNpbPlayerIdFromPublicId(String(row.yahooCatcherId ?? "").trim())
      if (!catcherNpbId) continue
      if (onlyCatcherNpbIds && !onlyCatcherNpbIds.has(catcherNpbId)) continue
      checked += 1
      compareRow(errors, pitcherNpbId, catcherNpbId, row, reverse.get(`${pitcherNpbId}::${catcherNpbId}`))
    }
  }

  if (errors.length > 0) {
    const header = `[validate-catcher-pitcher-symmetry] FAIL: ${errors.length} mismatch(es) across ${checked} row(s)`
    if (failOnError) {
      console.error(header)
      for (const err of errors) console.error(`- ${err}`)
      process.exit(1)
    }
    console.warn(header)
    for (const err of errors) console.warn(`- ${err}`)
    return
  }

  console.log(`[validate-catcher-pitcher-symmetry] OK: checked ${checked} row(s)`)
}

function compareRow(
  errors: string[],
  pitcherNpbId: string,
  catcherNpbId: string,
  row: PitcherSeasonPocCatcherRow,
  reverse: ReverseRow | undefined,
) {
  if (!reverse) {
    errors.push(`missing reverse row pitcher=${pitcherNpbId} catcher=${catcherNpbId}`)
    return
  }

  const pairs: Array<[string, number, number]> = [
    ["bf", num(row.bf), reverse.bf],
    ["ab", num(row.ab), reverse.ab],
    ["h", num(row.h), reverse.h],
    ["hr", num(row.hr), reverse.hr],
    ["so", num(row.so), reverse.so],
    ["bb", num(row.bb), reverse.bb],
    ["hbp", num(row.hbp), reverse.hbp],
    ["ipOuts", num(row.ipOuts), reverse.ipOuts],
    ["er", num(row.er), num(reverse.er)],
    ["games", num(row.games), num(reverse.games)],
    ["wins", num(row.wins), num(reverse.wins)],
    ["losses", num(row.losses), num(reverse.losses)],
    ["qsCount", num(row.qsCount), num(reverse.qsCount)],
    ["ibb", num(row.ibb), num(reverse.ibb)],
  ]

  for (const [label, lhs, rhs] of pairs) {
    if (lhs !== rhs) {
      errors.push(`pitcher=${pitcherNpbId} catcher=${catcherNpbId} field=${label} pitcher=${lhs} catcher=${rhs}`)
    }
  }
}

main()
