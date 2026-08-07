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
import { catcherYahooIdsFromCanonical } from "@/lib/catcherAppearances"
import { mergePhase10RestoredIntoDocIfPresent } from "@/lib/seasonStatsPilot"
import { aggregateCatcherDefenseBasicByNpbId } from "@/lib/yahooGame/activeCatcherFromCanonical"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"
import { extractCanonicalGameYmd } from "../lib/yahooGame/loadCanonicalGames"
import { writeJsonFileWithRetrySync } from "@/lib/fs/writeFileWithRetry"

function parseArgs(argv: string[]): {
  year: string
  from: string | null
  to: string | null
  onlyNpbIds: string[] | null
} {
  const yearIdx = argv.indexOf("--year")
  const fromIdx = argv.indexOf("--from")
  const toIdx = argv.indexOf("--to")
  const onlyIdx = argv.indexOf("--only-npb-ids")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : ""
  const from = fromIdx >= 0 ? String(argv[fromIdx + 1] ?? "").trim() : null
  const to = toIdx >= 0 ? String(argv[toIdx + 1] ?? "").trim() : null
  const onlyNpbIds =
    onlyIdx >= 0
      ? String(argv[onlyIdx + 1] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null
  return { year: year || "2026", from, to, onlyNpbIds }
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

function isYmd(s: string | null): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function main() {
  const root = getProjectRoot()
  const { year, from, to, onlyNpbIds } = parseArgs(process.argv.slice(2))
  if ((from && !isYmd(from)) || (to && !isYmd(to))) {
    console.error("[phase24] invalid --from/--to. expected YYYY-MM-DD")
    process.exit(1)
  }
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
  let targetNpbIds = onlyNpbIds ? new Set(onlyNpbIds) : null
  if (!targetNpbIds && (from || to)) {
    targetNpbIds = new Set<string>()
    for (const f of files) {
      const doc = readCanonicalFile(path.join(canonicalDir, f))
      if (!doc) continue
      const ymd = extractCanonicalGameYmd(doc)
      if (!ymd || !ymd.startsWith(`${year}-`)) continue
      if (from && ymd < from) continue
      if (to && ymd > to) continue
      for (const yahooId of catcherYahooIdsFromCanonical(doc)) {
        const npbId = resolveNpbPlayerIdFromPublicId(String(yahooId).trim())
        if (npbId) targetNpbIds.add(npbId)
      }
    }
    if (targetNpbIds.size === 0) {
      console.log(`[phase24] no affected catchers for range=${from ?? "(start)"}..${to ?? "(end)"}`)
      return
    }
  }

  for (const f of files) {
    const p = path.join(canonicalDir, f)
    const doc = readCanonicalFile(p)
    if (!doc) continue
    const ymd = extractCanonicalGameYmd(doc)
    if (!ymd || !ymd.startsWith(`${year}-`)) continue

    for (const [npbId, counts] of aggregateCatcherDefenseBasicByNpbId(doc)) {
      if (targetNpbIds && !targetNpbIds.has(npbId)) continue
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
  for (const f of fs.readdirSync(outDir).filter((x) => x.startsWith("npb_") && x.endsWith(".json"))) {
    const npbId = f.replace(/^npb_/, "").replace(/\.json$/, "")
    if (targetNpbIds && !targetNpbIds.has(npbId)) continue
    if (sbByCatcher.has(npbId)) continue
    try {
      fs.unlinkSync(path.join(outDir, f))
    } catch {
      // ignore
    }
  }

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
    writeJsonFileWithRetrySync(path.join(outDir, `npb_${npbCatcherId}.json`), payload)
    wrote += 1
  }

  console.log(
    `[phase24] wrote ${wrote} files → ${outDir}${from || to ? ` (range=${from ?? "(start)"}..${to ?? "(end)"})` : ""}`,
  )
}

main()
