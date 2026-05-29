/**
 * Phase 26: スタメン捕手の試合だけを対象に、捕手別の「巡目別の球種一覧」を生成する。
 *
 * 定義（投手側と同じ近似）:
 * - 巡目キーは「その試合で守備側チームが迎えたBF順」を9人ごとに 1→2→3→4→5+ とする（厳密な打順循環は追わない）。
 * - pitch_type は plateAppearances.pitchEvents[].pitchTypeJa を加算（無ければスキップ）。
 * - 捕手の対象は「その守備側チームのスタメン捕手」。捕手交替は追えないのでスタメン固定扱い。
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
  fieldingTeamNameFromInningHalf,
  getStartingCatcherForTeam,
} from "@/lib/yahooGame/startingCatcherFromCanonical"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"
import type {
  CatcherPaRoundPitchTypesDerived,
  CatcherPaRoundPitchTypesRoundRow,
} from "@/lib/catcherPaRoundPitchTypes"
import { comparePlateAppearances } from "@/lib/yahooGame/pitcherPocHelpers"
import { mergePhase10RestoredIntoDocIfPresent } from "@/lib/seasonStatsPilot"

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

  // catcherNpbId -> roundKey -> pitchType -> count
  const byCatcher = new Map<string, Map<string, Map<string, number>>>()

  for (const f of files) {
    const p = path.join(canonicalDir, f)
    const doc = readCanonicalFile(p)
    if (!doc) continue

    // その試合のスタメン捕手（チームごと）を先に解決
    const starterCatcherByTeam = new Map<string, string>() // teamName -> catcherNpbId
    for (const t of doc.game.teams ?? []) {
      const teamName = (t.teamName ?? "").trim()
      if (!teamName) continue
      const cat = getStartingCatcherForTeam(doc, teamName)
      if (!cat?.yahooPlayerId) continue
      const npb = resolveNpbPlayerIdFromPublicId(cat.yahooPlayerId)
      if (!npb) continue
      starterCatcherByTeam.set(teamName, npb)
    }

    // 守備側チームの BF カウント（試合単位）
    const bfByTeam = new Map<string, number>()

    const pas = [...(doc.domain?.plateAppearances ?? [])].sort(comparePlateAppearances)
    for (const pa of pas) {
      const inningHalf = (pa.inningHalf ?? "").trim()
      const fieldingTeam = inningHalf ? fieldingTeamNameFromInningHalf(doc, inningHalf) : null
      if (!fieldingTeam) continue
      const catcherNpbId = starterCatcherByTeam.get(fieldingTeam) ?? null
      if (!catcherNpbId) continue

      const idx = bfByTeam.get(fieldingTeam) ?? 0
      bfByTeam.set(fieldingTeam, idx + 1)
      const round = Math.min(5, Math.floor(idx / 9) + 1)
      const roundKey = keyForRound(round)

      const ev = pa.pitchEvents ?? []
      if (!ev.length) continue

      let rm = byCatcher.get(catcherNpbId)
      if (!rm) {
        rm = new Map()
        byCatcher.set(catcherNpbId, rm)
      }
      const tm = rm.get(roundKey) ?? new Map<string, number>()
      for (const e of ev) {
        const pt = (e.pitchTypeJa ?? "").trim() || "不明"
        tm.set(pt, (tm.get(pt) ?? 0) + 1)
      }
      rm.set(roundKey, tm)
    }
  }

  const outDir = path.join(root, "_data", "derived", "player_catcher_pa_round_pitch_types", year)
  ensureDir(outDir)

  let wrote = 0
  for (const [catcherNpbId, roundMap] of byCatcher) {
    const byPaRoundPitchTypes: CatcherPaRoundPitchTypesRoundRow[] = (["1", "2", "3", "4", "5"] as const).map(
      (k) => {
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
      }
    )

    const payload: CatcherPaRoundPitchTypesDerived = {
      schemaVersion: "player-catcher-pa-round-pitch-types-v1",
      seasonYear: year,
      npbCatcherId: catcherNpbId,
      byPaRoundPitchTypes,
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

