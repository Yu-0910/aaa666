/**
 * Phase 22: 捕手出場（途中出場を含む）を canonical から抽出し、選手別に派生JSONへ保存する。
 *
 * 出力:
 *   _data/derived/player_catcher_appearances/{year}/npb_{npbPlayerId}.json
 *
 * 入力:
 *   _data/scraped_games/canonical/*.json
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"
import { catcherYahooIdsFromCanonical, type CatcherAppearancesDerived } from "@/lib/catcherAppearances"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"
import { mergePhase10RestoredIntoDocIfPresent } from "@/lib/seasonStatsPilot"

function parseArgs(argv: string[]): { year: string } {
  const yearIdx = argv.indexOf("--year")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : ""
  return { year: year || "2026" }
}

function canonicalDir(root: string): string {
  return path.join(root, "_data", "scraped_games", "canonical")
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
  const dir = canonicalDir(root)
  if (!fs.existsSync(dir)) {
    console.error("[phase22] missing canonical dir:", dir)
    process.exit(1)
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
  if (!files.length) {
    console.error("[phase22] no canonical files under:", dir)
    process.exit(1)
  }

  const byNpb = new Map<string, Set<string>>() // npb -> gameIds

  for (const f of files) {
    const p = path.join(dir, f)
    const doc = readCanonicalFile(p)
    if (!doc) continue

    const catcherYahooIds = catcherYahooIdsFromCanonical(doc)
    for (const yahooId of catcherYahooIds) {
      const npb = resolveNpbPlayerIdFromPublicId(String(yahooId).trim())
      if (!npb) continue
      const set = byNpb.get(npb) ?? new Set<string>()
      set.add(doc.gameId)
      byNpb.set(npb, set)
    }
  }

  const outDir = path.join(root, "_data", "derived", "player_catcher_appearances", year)
  ensureDir(outDir)

  let wrote = 0
  for (const [npb, games] of byNpb) {
    const payload: CatcherAppearancesDerived = {
      schemaVersion: "player-catcher-appearances-v1",
      seasonYear: year,
      npbPlayerId: npb,
      gamesAsCatcher: games.size,
      gameIds: [...games].sort(),
    }
    fs.writeFileSync(
      path.join(outDir, `npb_${npb}.json`),
      JSON.stringify(payload, null, 2),
      "utf8"
    )
    wrote += 1
  }

  console.log(`[phase22] wrote ${wrote} files → ${outDir}`)
}

main()

