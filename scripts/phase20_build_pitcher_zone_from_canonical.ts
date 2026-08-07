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
} from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import type { ZoneStat, ZoneStatsResponse } from "../lib/yahooGame/gamePitcherPilotFiles"
import { buildPitcherZoneStatsFromCanonicalPlateAppearances } from "../lib/pitchDetailsPilot"
import { resolveBatHandJaForBatter } from "../lib/yahooGame/batterHandFromCanonical"
import { getNpbRoster2026 } from "../lib/npbRoster"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { extractCanonicalGameYmd } from "../lib/yahooGame/loadCanonicalGames"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"

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

function parseArgs(): { year: string; from: string | null; to: string | null; onlyYahooIds: string[] | null } {
  const args = process.argv.slice(2)
  let year = "2026"
  let from: string | null = null
  let to: string | null = null
  let onlyYahooIds: string[] | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    } else if (args[i] === "--from" && args[i + 1]) {
      from = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--to" && args[i + 1]) {
      to = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--only-yahoo-ids" && args[i + 1]) {
      onlyYahooIds = String(args[i + 1])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    }
  }
  return { year, from, to, onlyYahooIds }
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

function isYmd(s: string | null): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function collectPitcherIdsInGame(doc: CanonicalGameDocument): Set<string> {
  const ids = new Set<string>()
  for (const pa of doc.domain.plateAppearances ?? []) {
    const paPid = String(pa.yahooPitcherId ?? "").trim()
    if (paPid) ids.add(paPid)
    for (const ev of pa.pitchEvents ?? []) {
      const id = String(ev.yahooPitcherId ?? "").trim()
      if (id) ids.add(id)
    }
  }
  for (const line of doc.domain?.pitchingLines ?? []) {
    const id = String(line.yahooPlayerId ?? "").trim()
    if (id) ids.add(id)
  }
  return ids
}

function collectAffectedPitcherIds(
  docs: CanonicalGameDocument[],
  from: string | null,
  to: string | null,
): string[] {
  const ids = new Set<string>()
  for (const doc of docs) {
    const ymd = extractCanonicalGameYmd(doc)
    if (!ymd) continue
    if (from && ymd < from) continue
    if (to && ymd > to) continue
    for (const id of collectPitcherIdsInGame(doc)) ids.add(id)
  }
  return [...ids].sort()
}

function gameHasTargetPitcher(doc: CanonicalGameDocument, targetYahooIdSet: Set<string> | null): boolean {
  if (!targetYahooIdSet) return true
  for (const id of collectPitcherIdsInGame(doc)) {
    if (targetYahooIdSet.has(id)) return true
  }
  return false
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
  const { year, from, to, onlyYahooIds } = parseArgs()
  if ((from && !isYmd(from)) || (to && !isYmd(to))) {
    console.error("[phase20] invalid --from/--to. expected YYYY-MM-DD")
    process.exit(1)
  }
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year })
  if (docs.length === 0) {
    console.error(
      "[phase20] no canonical games under _data/scraped_games/canonical/"
    )
    process.exit(1)
  }

  let targetYahooIds = onlyYahooIds ? [...onlyYahooIds] : null
  if (!targetYahooIds && (from || to)) {
    targetYahooIds = collectAffectedPitcherIds(docs, from, to)
    if (targetYahooIds.length === 0) {
      console.log(
        `[phase20] no affected pitchers for range ${from ?? "(start)"}..${to ?? "(end)"} in year=${year}; nothing to write`,
      )
      return
    }
  }
  const targetYahooIdSet = targetYahooIds ? new Set(targetYahooIds) : null

  const roster = getNpbRoster2026()
  const pitcherIds = new Set<string>()
  for (const doc of docs) {
    if (!gameHasTargetPitcher(doc, targetYahooIdSet)) continue
    for (const pa of doc.domain.plateAppearances ?? []) {
      const paPid = (pa.yahooPitcherId ?? "").trim()
      if (paPid && (!targetYahooIdSet || targetYahooIdSet.has(paPid))) pitcherIds.add(paPid)
      for (const ev of pa.pitchEvents ?? []) {
        const id = String(ev.yahooPitcherId ?? "").trim()
        if (id && (!targetYahooIdSet || targetYahooIdSet.has(id))) pitcherIds.add(id)
      }
    }
    for (const line of doc.domain?.pitchingLines ?? []) {
      const id = String(line.yahooPlayerId ?? "").trim()
      if (id && (!targetYahooIdSet || targetYahooIdSet.has(id))) pitcherIds.add(id)
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
      const yid = f.replace(/^yahoo_/, "").replace(/\.json$/, "")
      if (targetYahooIds && !targetYahooIds.includes(yid)) continue
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
      if (targetYahooIdSet && !collectPitcherIdsInGame(doc).has(pid)) continue
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
    writeJsonFileWithRetrySync(join(outDir, `yahoo_${pid}.json`), payload)
    written++
  }

  console.log(
    `[phase20] canonical games=${docs.length} pitchers with zone data=${written} → ${outDir}${from || to ? ` (range=${from ?? "(start)"}..${to ?? "(end)"})` : ""}`
  )
}

main()
