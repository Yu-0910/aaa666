/**
 * Phase 24: canonical から捕手別の守備基本指標を派生JSONとして保存する。
 * - 盗塁成功/盗塁死（CS%）
 * - 背後投球数（plateAppearances.pitchEvents 件数）
 * - GO/AO 用ゴロ/フライアウト推定件数
 * - パスボール・捕逸（PB/9 の分子。暴投は除外）
 *
 * 帰属: 実況の守備交代・(捕) 表記から追跡した「その打席時点の捕手」
 * （先発捕手固定は使わない）。
 *
 * 出力:
 *   _data/derived/player_catcher_defense_basic/{year}/npb_{npbCatcherId}.json
 *
 * 入力は各試合 JSON を `mergePhase10RestoredIntoDocIfPresent` 後に読む（Phase11 と同一前提）。
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"
import type { CatcherDefenseBasicDerived } from "@/lib/catcherDefenseBasic"
import { mergePhase10RestoredIntoDocIfPresent } from "@/lib/seasonStatsPilot"
import { aggregateCatcherDefenseBasicByNpbId } from "@/lib/yahooGame/activeCatcherFromCanonical"

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

function main() {
  const root = getProjectRoot()
  const { year } = parseArgs(process.argv.slice(2))
  const canonicalDir = path.join(root, "_data", "scraped_games", "canonical")
  if (!fs.existsSync(canonicalDir)) {
    console.error("[phase24] missing canonical dir:", canonicalDir)
    process.exit(1)
  }
  const files = fs.readdirSync(canonicalDir).filter((f) => f.endsWith(".json"))
  if (!files.length) {
    console.error("[phase24] no canonical files under:", canonicalDir)
    process.exit(1)
  }

  const sbByCatcher = new Map<
    string,
    { sb: number; cs: number; pb: number; pitches: number; ground: number; air: number }
  >()

  for (const f of files) {
    const p = path.join(canonicalDir, f)
    const doc = readCanonicalFile(p)
    if (!doc) continue

    for (const [npbId, counts] of aggregateCatcherDefenseBasicByNpbId(doc)) {
      let agg = sbByCatcher.get(npbId)
      if (!agg) {
        agg = { sb: 0, cs: 0, pb: 0, pitches: 0, ground: 0, air: 0 }
        sbByCatcher.set(npbId, agg)
      }
      agg.sb += counts.sb
      agg.cs += counts.cs
      agg.pb += counts.pb
      agg.pitches += counts.pitches
      agg.ground += counts.ground
      agg.air += counts.air
    }
  }

  const outDir = path.join(root, "_data", "derived", "player_catcher_defense_basic", year)
  ensureDir(outDir)

  let wrote = 0
  for (const [npbCatcherId, a] of sbByCatcher) {
    const attempts = a.sb + a.cs
    const csPct = attempts > 0 ? (a.cs / attempts) * 100 : null
    const payload: CatcherDefenseBasicDerived = {
      schemaVersion: "player-catcher-defense-basic-v1",
      seasonYear: year,
      npbCatcherId,
      sbAttempts: attempts,
      sb: a.sb,
      cs: a.cs,
      csPct,
      pb: a.pb > 0 ? a.pb : undefined,
      pitches: a.pitches,
      battedBallOuts:
        a.ground > 0 || a.air > 0 ? { ground: a.ground, air: a.air } : undefined,
    }
    fs.writeFileSync(
      path.join(outDir, `npb_${npbCatcherId}.json`),
      JSON.stringify(payload, null, 2),
      "utf8",
    )
    wrote += 1
  }

  console.log(`[phase24] wrote ${wrote} files → ${outDir}`)
}

main()
