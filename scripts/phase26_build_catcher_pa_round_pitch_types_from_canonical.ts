/**
 * Phase 26: 実守備捕手ごとに「巡目別の球種一覧」を生成する。
 *
 * 定義（投手側と同じ近似）:
 * - 巡目キーは「その試合で守備側チームが迎えたBF順」を9人ごとに 1→2→3→4→5+ とする（厳密な打順循環は追わない）。
 * - pitch_type は plateAppearances.pitchEvents[].pitchTypeJa を加算（無ければスキップ）。
 * - 捕手の対象は各打席時点の実守備捕手（textPlayByPlay の守備交代追跡）。
 * - byPaRoundPitchTypesVsL / VsR: 各球の投手利き腕と打者利き腕で対左／対右に振り分け（phase_pitcher_poc1 と同換算）。
 *
 * 出力:
 *   _data/derived/player_catcher_pa_round_pitch_types/{year}/npb_{npbCatcherId}.json
 *
 * 入力は各試合 JSON を `mergePhase10RestoredIntoDocIfPresent` 後に読む（Phase11 と同一前提）。
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"
import {
  buildCatcherYahooIdByPaTimeline,
  resolveActiveCatcherYahooIdForPlateAppearance,
} from "@/lib/yahooGame/activeCatcherFromCanonical"
import { fieldingTeamNameFromInningHalf } from "@/lib/yahooGame/startingCatcherFromCanonical"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"
import type {
  CatcherPaRoundPitchTypesDerived,
  CatcherPaRoundPitchTypesRoundRow,
} from "@/lib/catcherPaRoundPitchTypes"
import { comparePlateAppearances } from "@/lib/yahooGame/pitcherPocHelpers"
import { mergePhase10RestoredIntoDocIfPresent } from "@/lib/seasonStatsPilot"
import { getNpbRoster2026 } from "@/lib/npbRoster"
import {
  effectiveVsHandBucketForPitcherSplit,
  pitcherThrowHandRLFromYahooPitcherId,
  resolveBatHandJaForBatter,
} from "@/lib/yahooGame/batterHandFromCanonical"

function parseArgs(argv: string[]): { year: string } {
  const yearIdx = argv.indexOf("--year")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : ""
  return { year: year || "2026" }
}

function readCanonicalFile(p: string): CanonicalGameDocument | null {
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as CanonicalGameDocument
    if (j?.schemaVersion !== "yahoo-game-canonical-v1" || !j.gameId) return null
    return mergePhase10RestoredIntoDocIfPresent(j)
  } catch {
    return null
  }
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

function keyForRound(round: number): "1" | "2" | "3" | "4" | "5" {
  if (round <= 1) return "1"
  if (round === 2) return "2"
  if (round === 3) return "3"
  if (round === 4) return "4"
  return "5"
}

type RoundPitchMap = Map<string, Map<string, number>>

function ensureCatcherRoundMap(
  byCatcher: Map<string, RoundPitchMap>,
  catcherNpbId: string
): RoundPitchMap {
  let rm = byCatcher.get(catcherNpbId)
  if (!rm) {
    rm = new Map()
    byCatcher.set(catcherNpbId, rm)
  }
  return rm
}

function addPitch(
  roundMap: RoundPitchMap,
  roundKey: string,
  pitchType: string,
  count = 1
) {
  const tm = roundMap.get(roundKey) ?? new Map<string, number>()
  tm.set(pitchType, (tm.get(pitchType) ?? 0) + count)
  roundMap.set(roundKey, tm)
}

function buildRoundRows(roundMap: RoundPitchMap): CatcherPaRoundPitchTypesRoundRow[] {
  return (["1", "2", "3", "4", "5"] as const).map((k) => {
    const m = roundMap.get(k) ?? new Map<string, number>()
    const pitches_total = [...m.values()].reduce((a, b) => a + b, 0)
    const rows = [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([pitch_type, pitches]) => ({
        pitch_type,
        pitches,
        pct: pitches_total > 0 ? Math.round((pitches / pitches_total) * 1000) / 10 : 0,
      }))
    return { key: k, pitches_total, rows }
  })
}

function main() {
  const root = getProjectRoot()
  const { year } = parseArgs(process.argv.slice(2))
  const canonicalDir = path.join(root, "_data", "scraped_games", "canonical")
  if (!fs.existsSync(canonicalDir)) {
    console.error("[phase26] missing canonical dir:", canonicalDir)
    process.exit(1)
  }
  const files = fs.readdirSync(canonicalDir).filter((f) => f.endsWith(".json"))
  if (!files.length) {
    console.error("[phase26] no canonical files under:", canonicalDir)
    process.exit(1)
  }

  const rosterForBatHand = getNpbRoster2026()

  const byCatcher = new Map<string, RoundPitchMap>()
  const byCatcherVsL = new Map<string, RoundPitchMap>()
  const byCatcherVsR = new Map<string, RoundPitchMap>()

  for (const f of files) {
    const p = path.join(canonicalDir, f)
    const doc = readCanonicalFile(p)
    if (!doc) continue

    const catcherTimeline = buildCatcherYahooIdByPaTimeline(doc)
    const bfByTeam = new Map<string, number>()

    const pas = [...(doc.domain?.plateAppearances ?? [])].sort(comparePlateAppearances)
    for (const pa of pas) {
      const inningHalf = (pa.inningHalf ?? "").trim()
      const fieldingTeam = inningHalf ? fieldingTeamNameFromInningHalf(doc, inningHalf) : null
      if (!fieldingTeam) continue
      const catcherYid = resolveActiveCatcherYahooIdForPlateAppearance(doc, pa, catcherTimeline)
      if (!catcherYid) continue
      const catcherNpbId = resolveNpbPlayerIdFromPublicId(catcherYid)
      if (!catcherNpbId) continue

      const idx = bfByTeam.get(fieldingTeam) ?? 0
      bfByTeam.set(fieldingTeam, idx + 1)
      const round = Math.min(5, Math.floor(idx / 9) + 1)
      const roundKey = keyForRound(round)

      const ev = pa.pitchEvents ?? []
      if (!ev.length) continue

      const bid = (pa.yahooBatterId ?? "").trim()
      const batJa = bid ? resolveBatHandJaForBatter(doc, bid, rosterForBatHand) : ""

      const baseMap = ensureCatcherRoundMap(byCatcher, catcherNpbId)
      const vsLMap = ensureCatcherRoundMap(byCatcherVsL, catcherNpbId)
      const vsRMap = ensureCatcherRoundMap(byCatcherVsR, catcherNpbId)

      for (const e of ev) {
        const pt = (e.pitchTypeJa ?? "").trim() || "不明"
        addPitch(baseMap, roundKey, pt)

        const pitcherYid = String(e.yahooPitcherId ?? pa.yahooPitcherId ?? "").trim()
        const pitcherThrow = pitcherThrowHandRLFromYahooPitcherId(pitcherYid)
        const bucket = effectiveVsHandBucketForPitcherSplit(batJa, pitcherThrow)
        if (bucket === "L") {
          addPitch(vsLMap, roundKey, pt)
        } else if (bucket === "R") {
          addPitch(vsRMap, roundKey, pt)
        }
      }
    }
  }

  const outDir = path.join(root, "_data", "derived", "player_catcher_pa_round_pitch_types", year)
  ensureDir(outDir)

  const catcherIds = new Set([...byCatcher.keys(), ...byCatcherVsL.keys(), ...byCatcherVsR.keys()])

  let wrote = 0
  for (const catcherNpbId of catcherIds) {
    const byPaRoundPitchTypes = buildRoundRows(byCatcher.get(catcherNpbId) ?? new Map())
    const byPaRoundPitchTypesVsL = buildRoundRows(byCatcherVsL.get(catcherNpbId) ?? new Map())
    const byPaRoundPitchTypesVsR = buildRoundRows(byCatcherVsR.get(catcherNpbId) ?? new Map())

    const payload: CatcherPaRoundPitchTypesDerived = {
      schemaVersion: "player-catcher-pa-round-pitch-types-v1",
      seasonYear: year,
      npbCatcherId: catcherNpbId,
      byPaRoundPitchTypes,
      byPaRoundPitchTypesVsL,
      byPaRoundPitchTypesVsR,
    }

    fs.writeFileSync(
      path.join(outDir, `npb_${catcherNpbId}.json`),
      JSON.stringify(payload, null, 2),
      "utf8"
    )
    wrote += 1
  }

  console.log(`[phase26] wrote ${wrote} files → ${outDir}`)
}

main()
