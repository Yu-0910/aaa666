/**
 * Phase 24: canonical の play-by-play テキストから盗塁（成功/阻止）を推定し、
 * 捕手別の盗塁阻止率（CS%）を派生JSONとして保存する。
 *
 * 注意:
 * - canonical のみだと捕手交替の完全追跡は難しいため、原則「守備側チームの先発捕手」に帰属させる。
 * - 盗塁の表記は揺れがあるためベストエフォート。
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
import { fieldingTeamNameFromInningHalf, getStartingCatcherForTeam } from "@/lib/yahooGame/startingCatcherFromCanonical"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"
import type { CatcherDefenseBasicDerived } from "@/lib/catcherDefenseBasic"

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

function isSbSuccessLine(line: string): boolean {
  // 例: "盗塁成功", "二盗成功", "三盗成功"
  return /(盗塁成功|[二三]盗成功)/.test(line)
}

function isCaughtStealingLine(line: string): boolean {
  // 例: "盗塁死", "盗塁刺", "二盗死", "三盗死"
  return /(盗塁死|盗塁刺|[二三]盗死)/.test(line)
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

  // npbCatcherId -> agg
  const sbByCatcher = new Map<string, { sb: number; cs: number }>()

  for (const f of files) {
    const p = path.join(canonicalDir, f)
    const doc = readCanonicalFile(p)
    if (!doc) continue

    // section ごとに守備側チームを推定し、先発捕手へ帰属
    for (const sec of doc.game.textPlayByPlay ?? []) {
      const inningHalf = String(sec.sectionTitle ?? "").trim()
      const fieldingTeam = fieldingTeamNameFromInningHalf(doc, inningHalf)
      if (!fieldingTeam) continue
      const cat = getStartingCatcherForTeam(doc, fieldingTeam)
      if (!cat?.yahooPlayerId) continue
      const catcherNpbId = resolveNpbPlayerIdFromPublicId(cat.yahooPlayerId)
      if (!catcherNpbId) continue

      let agg = sbByCatcher.get(catcherNpbId)
      if (!agg) {
        agg = { sb: 0, cs: 0 }
        sbByCatcher.set(catcherNpbId, agg)
      }

      for (const rawLine of sec.lines ?? []) {
        const line = String(rawLine ?? "").trim()
        if (!line) continue
        if (isSbSuccessLine(line)) agg.sb += 1
        else if (isCaughtStealingLine(line)) agg.cs += 1
      }
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
    }
    fs.writeFileSync(
      path.join(outDir, `npb_${npbCatcherId}.json`),
      JSON.stringify(payload, null, 2),
      "utf8"
    )
    wrote += 1
  }

  console.log(`[phase24] wrote ${wrote} files → ${outDir}`)
}

main()

