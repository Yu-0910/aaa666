/**
 * Phase 20（計画書 Phase 1-A）: canonical 全試合から投手別に対右／対左の 25 ゾーンを試合横断で集計する。
 *
 * 出力:
 *   _data/derived/pitcher_zone_from_canonical/{year}/yahoo_{yahooPitcherId}.json
 *
 * 使い方:
 *   npx tsx scripts/phase20_build_pitcher_zone_from_canonical.ts --year 2026
 *   npm run phase20:build:pitcher-zones
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import type { ZoneStat, ZoneStatsResponse } from "../lib/yahooGame/gamePitcherPilotFiles"
import { buildPitcherZoneStatsFromCanonicalPlateAppearances } from "../lib/pitchDetailsPilot"
import { resolveBatHandJaForBatter } from "../lib/yahooGame/batterHandFromCanonical"
import { getNpbRoster2026 } from "../lib/npbRoster"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

type HandBucket = "vsRight" | "vsLeft"

type ZoneAgg = {
  pitches: number
  ab: number
  h: number
  hr: number
  tb: number
}

type SeasonAcc = Record<HandBucket, Map<number, ZoneAgg>>

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    }
  }
  return { year }
}

function loadCanonicalFiles(): CanonicalGameDocument[] {
  const dir = join(projectRoot, "_data", "scraped_games", "canonical")
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  const out: CanonicalGameDocument[] = []
  for (const f of files) {
    const p = join(dir, f)
    try {
      const doc = JSON.parse(readFileSync(p, "utf8")) as CanonicalGameDocument
      if (doc?.schemaVersion === "yahoo-game-canonical-v1" && doc?.gameId) out.push(doc)
    } catch {
      // ignore
    }
  }
  return out
}

function emptyAcc(): SeasonAcc {
  return {
    vsRight: new Map(),
    vsLeft: new Map(),
  }
}

function mergeGameResponse(acc: SeasonAcc, res: ZoneStatsResponse): void {
  for (const hand of ["vsRight", "vsLeft"] as const) {
    const m = acc[hand]
    for (const row of res[hand]) {
      const z = row.zoneId
      const cur = m.get(z) ?? {
        pitches: 0,
        ab: 0,
        h: 0,
        hr: 0,
        tb: 0,
      }
      cur.pitches += row.pitches
      cur.ab += row.ab
      cur.h += row.h
      cur.hr += row.hr
      cur.tb += row.tb ?? 0
      m.set(z, cur)
    }
  }
}

function accHasPitchData(acc: SeasonAcc): boolean {
  for (const hand of ["vsRight", "vsLeft"] as const) {
    for (const v of acc[hand].values()) {
      if (v.pitches > 0 || v.ab > 0) return true
    }
  }
  return false
}

function accToOutput(
  pitcherId: string,
  seasonYear: string,
  canonicalGameIds: string[],
  acc: SeasonAcc
): object {
  const buildSide = (hand: HandBucket): ZoneStat[] => {
    const m = acc[hand]
    const out: ZoneStat[] = []
    for (let z = 1; z <= 25; z++) {
      const rec = m.get(z) ?? {
        pitches: 0,
        ab: 0,
        h: 0,
        hr: 0,
        tb: 0,
      }
      const { pitches, ab, h, hr, tb } = rec
      const avg = ab > 0 ? (h / ab).toFixed(3) : "—"
      const isop = ab > 0 ? ((tb - h) / ab).toFixed(3) : "—"
      const row: ZoneStat = { zoneId: z, pitches, ab, h, hr, isop, avg }
      if (tb > 0 || ab > 0) row.tb = tb
      out.push(row)
    }
    return out
  }

  return {
    schemaVersion: "pitcher-zone-from-canonical-v0",
    seasonYear,
    generatedAt: new Date().toISOString(),
    source: { canonicalGames: [...canonicalGameIds].sort() },
    game_id: "",
    pitcher_id: pitcherId,
    vsRight: buildSide("vsRight"),
    vsLeft: buildSide("vsLeft"),
  }
}

function main(): void {
  const { year } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  if (docs.length === 0) {
    console.error(
      "[phase20] no canonical games under _data/scraped_games/canonical/"
    )
    process.exit(1)
  }

  const roster = getNpbRoster2026()
  const pitcherIds = new Set<string>()
  for (const doc of docs) {
    for (const pa of doc.domain.plateAppearances ?? []) {
      const paPid = (pa.yahooPitcherId ?? "").trim()
      if (paPid) pitcherIds.add(paPid)
      for (const ev of pa.pitchEvents ?? []) {
        const id = String(ev.yahooPitcherId ?? "").trim()
        if (id) pitcherIds.add(id)
      }
    }
  }

  const outDir = join(
    projectRoot,
    "_data",
    "derived",
    "pitcher_zone_from_canonical",
    year
  )
  mkdirSync(outDir, { recursive: true })

  for (const f of readdirSync(outDir)) {
    if (f.startsWith("yahoo_") && f.endsWith(".json")) {
      try {
        unlinkSync(join(outDir, f))
      } catch {
        // ignore
      }
    }
  }

  let written = 0
  for (const pid of [...pitcherIds].sort()) {
    const acc = emptyAcc()
    const usedGames: string[] = []
    for (const doc of docs) {
      const resolveBatHand = (batterId: string) =>
        resolveBatHandJaForBatter(doc, batterId, roster)
      const res = buildPitcherZoneStatsFromCanonicalPlateAppearances(
        doc.gameId,
        pid,
        doc.domain.plateAppearances ?? [],
        resolveBatHand,
        { doc }
      )
      if (res) {
        mergeGameResponse(acc, res)
        usedGames.push(doc.gameId)
      }
    }
    if (!accHasPitchData(acc)) continue

    const payload = accToOutput(pid, year, [...new Set(usedGames)], acc)
    writeFileSync(
      join(outDir, `yahoo_${pid}.json`),
      JSON.stringify(payload, null, 2),
      "utf8"
    )
    written++
  }

  console.log(
    `[phase20] canonical games=${docs.length} pitchers with zone data=${written} → ${outDir}`
  )
}

main()
