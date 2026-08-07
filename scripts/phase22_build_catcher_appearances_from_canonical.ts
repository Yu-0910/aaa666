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
import { extractCanonicalGameYmd } from "../lib/yahooGame/loadCanonicalGames"
import { writeJsonFileWithRetrySync } from "@/lib/fs/writeFileWithRetry"

function parseArgs(argv: string[]): { year: string; from: string | null; to: string | null; onlyNpbIds: string[] | null } {
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

function isYmd(s: string | null): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function main() {
  const root = getProjectRoot()
  const { year, from, to, onlyNpbIds } = parseArgs(process.argv.slice(2))
  if ((from && !isYmd(from)) || (to && !isYmd(to))) {
    console.error("[phase22] invalid --from/--to. expected YYYY-MM-DD")
    process.exit(1)
  }
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
  let targetNpbIds = onlyNpbIds ? [...onlyNpbIds] : null
  let targetNpbIdSet = targetNpbIds ? new Set(targetNpbIds) : null
  if (!targetNpbIdSet && (from || to)) {
    targetNpbIdSet = new Set<string>()
    for (const f of files) {
      const doc = readCanonicalFile(path.join(dir, f))
      if (!doc) continue
      const ymd = extractCanonicalGameYmd(doc)
      if (!ymd || !ymd.startsWith(`${year}-`)) continue
      if (from && ymd < from) continue
      if (to && ymd > to) continue
      for (const yahooId of catcherYahooIdsFromCanonical(doc)) {
        const npb = resolveNpbPlayerIdFromPublicId(String(yahooId).trim())
        if (npb) targetNpbIdSet.add(npb)
      }
    }
    targetNpbIds = [...targetNpbIdSet]
    if (targetNpbIds.length === 0) {
      console.log(`[phase22] no affected catchers for range=${from ?? "(start)"}..${to ?? "(end)"}`)
      return
    }
  }

  for (const f of files) {
    const p = path.join(dir, f)
    const doc = readCanonicalFile(p)
    if (!doc) continue
    const ymd = extractCanonicalGameYmd(doc)
    if (!ymd || !ymd.startsWith(`${year}-`)) continue

    const catcherYahooIds = catcherYahooIdsFromCanonical(doc)
    for (const yahooId of catcherYahooIds) {
      const npb = resolveNpbPlayerIdFromPublicId(String(yahooId).trim())
      if (!npb) continue
      if (targetNpbIdSet && !targetNpbIdSet.has(npb)) continue
      const set = byNpb.get(npb) ?? new Set<string>()
      set.add(doc.gameId)
      byNpb.set(npb, set)
    }
  }

  const outDir = path.join(root, "_data", "derived", "player_catcher_appearances", year)
  ensureDir(outDir)
  for (const f of fs.readdirSync(outDir).filter((x) => x.startsWith("npb_") && x.endsWith(".json"))) {
    const npbId = f.replace(/^npb_/, "").replace(/\.json$/, "")
    if (targetNpbIds && !targetNpbIds.includes(npbId)) continue
    if (byNpb.has(npbId)) continue
    try {
      fs.unlinkSync(path.join(outDir, f))
    } catch {
      // ignore
    }
  }

  let wrote = 0
  for (const [npb, games] of byNpb) {
    const payload: CatcherAppearancesDerived = {
      schemaVersion: "player-catcher-appearances-v1",
      seasonYear: year,
      npbPlayerId: npb,
      gamesAsCatcher: games.size,
      gameIds: [...games].sort(),
    }
    writeJsonFileWithRetrySync(path.join(outDir, `npb_${npb}.json`), payload)
    wrote += 1
  }

  console.log(
    `[phase22] wrote ${wrote} files → ${outDir}${from || to ? ` (range=${from ?? "(start)"}..${to ?? "(end)"})` : ""}`,
  )
}

main()
