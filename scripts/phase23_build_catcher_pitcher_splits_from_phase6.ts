/**
 * Phase 23: Phase6（投手→捕手 splits.byCatcher）を逆引きして、
 * 捕手ごとの「投手別成績（最大15人）」派生JSONを生成する。
 *
 * 前提:
 * - `npm run phase:pitcher-poc1` 済み
 * - `npm run phase6:build:pitcher-catcher-splits` 済み（player_season_pitching_poc に splits.byCatcher が入る）
 *
 * 出力:
 *   _data/derived/player_catcher_pitcher_splits/{year}/npb_{npbCatcherId}.json
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { CatcherPitcherSplitRow, CatcherPitcherSplitsDerived } from "@/lib/catcherPitcherSplits"
import type { PitcherSeasonPocPayload, PitcherSeasonPocCatcherRow } from "@/lib/pitcherSeasonPocTypes"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"

function parseArgs(argv: string[]): { year: string; limit: number } {
  const yearIdx = argv.indexOf("--year")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : ""
  const limitIdx = argv.indexOf("--limit")
  const limitRaw = limitIdx >= 0 ? (argv[limitIdx + 1] ?? "").trim() : ""
  const limit = limitRaw ? Math.max(1, Math.min(50, parseInt(limitRaw, 10) || 15)) : 15
  return { year: year || "2026", limit }
}

function safeReadJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T
  } catch {
    return null
  }
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

function main() {
  const root = getProjectRoot()
  const { year, limit } = parseArgs(process.argv.slice(2))
  const inDir = path.join(root, "_data", "derived", "player_season_pitching_poc", year)
  if (!fs.existsSync(inDir)) {
    console.error("[phase23] missing:", inDir)
    process.exit(1)
  }
  const files = fs.readdirSync(inDir).filter((f) => f.startsWith("npb_") && f.endsWith(".json"))
  if (files.length === 0) {
    console.error("[phase23] no npb_*.json under:", inDir)
    process.exit(1)
  }

  // catcherNpbId -> pitcher rows (one per pitcher)
  const byCatcher = new Map<string, CatcherPitcherSplitRow[]>()

  for (const f of files) {
    const p = path.join(inDir, f)
    const pp = safeReadJson<PitcherSeasonPocPayload>(p)
    if (!pp || pp.schemaVersion !== "phase-pitcher-poc-season-v1") continue
    const pitcherNpbId = String(pp.npbPlayerId ?? "").trim()
    if (!pitcherNpbId) continue
    const pitcherName = String(pp.playerName ?? "").trim() || pitcherNpbId
    const pitcherTeam = String(pp.team ?? "").trim()

    const rows: PitcherSeasonPocCatcherRow[] = pp.splits?.byCatcher ?? []
    for (const r of rows) {
      const catcherYahooId = String(r.yahooCatcherId ?? "").trim()
      if (!catcherYahooId) continue
      const catcherNpbId = resolveNpbPlayerIdFromPublicId(catcherYahooId)
      if (!catcherNpbId) continue

      const row: CatcherPitcherSplitRow = {
        pitcherNpbId,
        pitcherName,
        pitcherTeam,
        bf: r.bf ?? 0,
        ab: r.ab ?? 0,
        h: r.h ?? 0,
        hr: r.hr ?? 0,
        so: r.so ?? 0,
        bb: r.bb ?? 0,
        hbp: r.hbp ?? 0,
        ipOuts: r.ipOuts ?? 0,
        era: r.era ?? null,
        ip: r.ip ?? "—",
        wl: r.wl ?? "—",
        kPct: r.kPct ?? null,
        kBbPct: r.kBbPct ?? null,
        whip: r.whip ?? null,
        qsPct: r.qsPct ?? null,
        games: r.games ?? undefined,
        wins: r.wins ?? undefined,
        losses: r.losses ?? undefined,
        qsCount: r.qsCount ?? undefined,
      }
      const arr = byCatcher.get(catcherNpbId) ?? []
      arr.push(row)
      byCatcher.set(catcherNpbId, arr)
    }
  }

  const outDir = path.join(root, "_data", "derived", "player_catcher_pitcher_splits", year)
  ensureDir(outDir)

  let wrote = 0
  for (const [catcherNpbId, rows] of byCatcher) {
    const sorted = rows
      .slice()
      .sort((a, b) => (b.bf ?? 0) - (a.bf ?? 0) || a.pitcherName.localeCompare(b.pitcherName))
      .slice(0, limit)

    const payload: CatcherPitcherSplitsDerived = {
      schemaVersion: "player-catcher-pitcher-splits-v1",
      seasonYear: year,
      npbCatcherId: catcherNpbId,
      rows: sorted,
    }
    fs.writeFileSync(
      path.join(outDir, `npb_${catcherNpbId}.json`),
      JSON.stringify(payload, null, 2),
      "utf8"
    )
    wrote += 1
  }

  console.log(`[phase23] wrote ${wrote} files → ${outDir}`)
}

main()

