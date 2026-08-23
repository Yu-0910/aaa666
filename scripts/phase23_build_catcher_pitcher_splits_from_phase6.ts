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
import type {
  CatcherPitcherSplitRow,
  CatcherPitcherSplitsDerived,
} from "@/lib/catcherPitcherSplits"
import { catcherYahooIdsFromCanonical } from "@/lib/catcherAppearances"
import { buildCatcherPitcherSeasonTotals } from "@/lib/catcherPitcherSplits"
import type { PitcherSeasonPocPayload, PitcherSeasonPocCatcherRow } from "@/lib/pitcherSeasonPocTypes"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"
import { mergePhase10RestoredIntoDocIfPresent } from "@/lib/seasonStatsPilot"
import { extractCanonicalGameYmd } from "../lib/yahooGame/loadCanonicalGames"
import { writeJsonFileWithRetrySync } from "@/lib/fs/writeFileWithRetry"

function parseArgs(argv: string[]): {
  year: string
  limit: number
  from: string | null
  to: string | null
  onlyNpbIds: string[] | null
} {
  const yearIdx = argv.indexOf("--year")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : ""
  const limitIdx = argv.indexOf("--limit")
  const limitRaw = limitIdx >= 0 ? (argv[limitIdx + 1] ?? "").trim() : ""
  const fromIdx = argv.indexOf("--from")
  const toIdx = argv.indexOf("--to")
  const onlyIdx = argv.indexOf("--only-npb-ids")
  const limit = limitRaw ? Math.max(1, Math.min(50, parseInt(limitRaw, 10) || 15)) : 15
  const from = fromIdx >= 0 ? String(argv[fromIdx + 1] ?? "").trim() : null
  const to = toIdx >= 0 ? String(argv[toIdx + 1] ?? "").trim() : null
  const onlyNpbIds =
    onlyIdx >= 0
      ? String(argv[onlyIdx + 1] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null
  return { year: year || "2026", limit, from, to, onlyNpbIds }
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

function isYmd(s: string | null): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
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

function collectAffectedCatcherIdsFromCanonical(
  root: string,
  year: string,
  from: string | null,
  to: string | null,
): Set<string> {
  const out = new Set<string>()
  const dir = path.join(root, "_data", "scraped_games", "canonical")
  if (!fs.existsSync(dir)) return out
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const doc = readCanonicalFile(path.join(dir, f))
    if (!doc) continue
    const ymd = extractCanonicalGameYmd(doc)
    if (!ymd || !ymd.startsWith(`${year}-`)) continue
    if (from && ymd < from) continue
    if (to && ymd > to) continue
    for (const yahooId of catcherYahooIdsFromCanonical(doc)) {
      const npbId = resolveNpbPlayerIdFromPublicId(String(yahooId).trim())
      if (npbId) out.add(npbId)
    }
  }
  return out
}

function main() {
  const root = getProjectRoot()
  const { year, limit, from, to, onlyNpbIds } = parseArgs(process.argv.slice(2))
  if ((from && !isYmd(from)) || (to && !isYmd(to))) {
    console.error("[phase23] invalid --from/--to. expected YYYY-MM-DD")
    process.exit(1)
  }
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
  let targetNpbIds = onlyNpbIds ? new Set(onlyNpbIds) : null
  if (!targetNpbIds && (from || to)) {
    targetNpbIds = collectAffectedCatcherIdsFromCanonical(root, year, from, to)
    if (targetNpbIds.size === 0) {
      console.log(
        `[phase23] no affected catchers for range ${from ?? "(start)"}..${to ?? "(end)"} in year=${year}; nothing to write`,
      )
      return
    }
  }

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
      if (targetNpbIds && !targetNpbIds.has(catcherNpbId)) continue

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
        er: r.er ?? undefined,
        ibb: r.ibb ?? undefined,
      }
      const arr = byCatcher.get(catcherNpbId) ?? []
      arr.push(row)
      byCatcher.set(catcherNpbId, arr)
    }
  }

  const outDir = path.join(root, "_data", "derived", "player_catcher_pitcher_splits", year)
  ensureDir(outDir)
  for (const f of fs.readdirSync(outDir).filter((x) => x.startsWith("npb_") && x.endsWith(".json"))) {
    const npbId = f.replace(/^npb_/, "").replace(/\.json$/, "")
    if (targetNpbIds && !targetNpbIds.has(npbId)) continue
    if (byCatcher.has(npbId)) continue
    try {
      fs.unlinkSync(path.join(outDir, f))
    } catch {
      // ignore
    }
  }

  let wrote = 0
  for (const [catcherNpbId, rows] of byCatcher) {
    const seasonTotals = buildCatcherPitcherSeasonTotals(rows) ?? undefined
    const sorted = rows
      .slice()
      .sort((a, b) => (b.bf ?? 0) - (a.bf ?? 0) || a.pitcherName.localeCompare(b.pitcherName))
      .slice(0, limit)

    const payload: CatcherPitcherSplitsDerived = {
      schemaVersion: "player-catcher-pitcher-splits-v1",
      seasonYear: year,
      npbCatcherId: catcherNpbId,
      rows: sorted,
      seasonTotals,
    }
    writeJsonFileWithRetrySync(path.join(outDir, `npb_${catcherNpbId}.json`), payload)
    wrote += 1
  }

  console.log(
    `[phase23] wrote ${wrote} files → ${outDir}${from || to ? ` (range=${from ?? "(start)"}..${to ?? "(end)"})` : ""}`,
  )
}

main()

