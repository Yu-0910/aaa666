/**
 * Yahoo 打者/投手 ID → NPB player_id の統合マップを生成する。
 *
 * ソース（先勝ち。衝突はログのみ）:
 * - batting_master_bridge.csv
 * - yahoo_pitcher_to_npb.json（既存の投手インデックス）
 * - canonical 試合群（一球マージ済み。打撃行・打席打者・yahooPlayersMentioned・投球行・打席/一球の投手 ID＋名簿照合）
 *
 * 出力: _data/scraped_games/derived/yahoo_to_npb_full.json
 *
 * 実行: npx tsx scripts/build_yahoo_npb_full_index.ts
 *
 * ランタイムは lib/yahooNpbBatterIdMap.ts がこのファイルを読み、MANUAL より前にマージする。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument, PlateAppearance, PitchingLine } from "../lib/yahooGame/types"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { findNpbIdForYahooBatting, parseRosterCsv, type RosterRow } from "../lib/yahooGame/rosterCsv"
import { parsePaId, resolveNpbForPitcherLine, teamForYahooPlayerId } from "../lib/yahooGame/pitcherPocHelpers"
import { collectPitcherYahooIdsFromPlateAppearance } from "../lib/yahooGame/yahooPitcherIdForVsHandFromPa"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
    } else if (inQuotes) {
      current += c
    } else if (c === ",") {
      result.push(current)
      current = ""
    } else {
      current += c
    }
  }
  result.push(current)
  return result
}

function loadBridgeCsv(): Map<string, string> {
  const out = new Map<string, string>()
  const p = join(projectRoot, "_data", "scraped_games", "derived", "2021038624_batting_master_bridge.csv")
  if (!existsSync(p)) return out
  const lines = readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return out
  const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^\ufeff/, ""))
  const iNpb = headers.indexOf("npb_player_id")
  const iYahoo = headers.indexOf("yahoo_player_id")
  if (iNpb < 0 || iYahoo < 0) return out
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!)
    const npb = (cols[iNpb] ?? "").trim()
    const yahoo = (cols[iYahoo] ?? "").trim()
    if (npb && yahoo && /^\d+$/.test(npb) && /^\d+$/.test(yahoo)) {
      out.set(yahoo, npb)
    }
  }
  return out
}

function loadPitcherJsonMap(): Map<string, string> {
  const out = new Map<string, string>()
  const p = join(projectRoot, "_data", "scraped_games", "derived", "yahoo_pitcher_to_npb.json")
  if (!existsSync(p)) return out
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as { map?: Record<string, string> }
    for (const [y, n] of Object.entries(raw.map ?? {})) {
      const yid = String(y).trim()
      const npb = String(n).trim().replace(/[^\d]/g, "")
      if (/^\d+$/.test(yid) && npb) out.set(yid, npb)
    }
  } catch {
    // ignore
  }
  return out
}

function inferBatterTeamFromPa(doc: CanonicalGameDocument, pa: PlateAppearance): string {
  const yid = (pa.yahooBatterId ?? "").trim()
  if (!yid) return ""
  const fromLineup = teamForYahooPlayerId(doc, yid)
  if (fromLineup) return fromLineup
  const board = doc.game?.scoreboard ?? []
  if (board.length < 2) return ""
  const visitor = (board[0]!.teamName ?? "").trim()
  const home = (board[1]!.teamName ?? "").trim()
  if (!visitor || !home) return ""
  let half: number | null = null
  const parsed = parsePaId(pa.paId)
  if (parsed && (parsed.half === 0 || parsed.half === 1)) {
    half = parsed.half
  } else {
    const ih = pa.inningHalf ?? ""
    const m = ih.match(/(\d+)回(表|裏)/)
    if (m) half = m[2] === "表" ? 0 : 1
  }
  if (half === null) return ""
  return half === 0 ? visitor : home
}

function batterNameForYahoo(doc: CanonicalGameDocument, yid: string): string {
  for (const bl of doc.domain?.battingLines ?? []) {
    if (String(bl.yahooPlayerId ?? "").trim() === yid) return (bl.playerName ?? "").trim()
  }
  const fromMap = doc.game?.yahooPlayersMentioned?.[yid]
  if (fromMap) return String(fromMap).trim()
  return ""
}

/** 投球行・試合内名前表から、その Yahoo 投手 ID の表示名を得る（名簿照合用）。 */
function pitcherNameForYahooPitcherId(doc: CanonicalGameDocument, yid: string): string {
  for (const pl of doc.domain?.pitchingLines ?? []) {
    if (String(pl.yahooPlayerId ?? "").trim() === yid) return String(pl.playerName ?? "").trim()
  }
  const fromMap = doc.game?.yahooPlayersMentioned?.[yid]
  if (fromMap) return String(fromMap).trim()
  return ""
}

type Conflict = { yahoo: string; a: string; b: string; source: string }

function main(): void {
  const rosterPath = join(projectRoot, "_data", "npb_roster_2026.csv")
  if (!existsSync(rosterPath)) {
    console.error("[build_yahoo_npb_full_index] missing", rosterPath)
    process.exit(1)
  }
  const roster = parseRosterCsv(readFileSync(rosterPath, "utf8"))
  if (roster.length === 0) {
    console.error("[build_yahoo_npb_full_index] empty roster")
    process.exit(1)
  }

  const map = new Map<string, string>()
  const conflicts: Conflict[] = []

  function add(yahoo: string, npb: string, source: string): void {
    const y = yahoo.trim()
    const n = npb.trim().replace(/[^\d]/g, "")
    if (!/^\d+$/.test(y) || !n) return
    const prev = map.get(y)
    if (prev && prev !== n) {
      conflicts.push({ yahoo: y, a: prev, b: n, source })
      return
    }
    map.set(y, n)
  }

  for (const [y, n] of loadBridgeCsv()) add(y, n, "bridge-csv")
  for (const [y, n] of loadPitcherJsonMap()) add(y, n, "yahoo_pitcher_to_npb.json")

  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  const sizeBeforeCanonical = map.size
  for (const doc of docs) {
    for (const bl of doc.domain?.battingLines ?? []) {
      const yid = String(bl.yahooPlayerId ?? "").trim()
      if (!/^\d+$/.test(yid)) continue
      const team = teamForYahooPlayerId(doc, yid)
      const hit = findNpbIdForYahooBatting(roster, bl.playerName, team || "")
      if (hit?.npbPlayerId) add(yid, hit.npbPlayerId, "canonical-batting-line")
    }

    for (const [yid, name] of Object.entries(doc.game?.yahooPlayersMentioned ?? {})) {
      const y = String(yid).trim()
      if (!/^\d+$/.test(y)) continue
      const team = teamForYahooPlayerId(doc, y)
      const hit = findNpbIdForYahooBatting(roster, String(name), team || "")
      if (hit?.npbPlayerId) add(y, hit.npbPlayerId, "yahooPlayersMentioned")
    }

    for (const pa of doc.domain?.plateAppearances ?? []) {
      const yid = String(pa.yahooBatterId ?? "").trim()
      if (!/^\d+$/.test(yid)) continue
      const name = batterNameForYahoo(doc, yid)
      if (!name) continue
      const team = teamForYahooPlayerId(doc, yid) || inferBatterTeamFromPa(doc, pa)
      const hit = findNpbIdForYahooBatting(roster, name, team || "")
      if (hit?.npbPlayerId) add(yid, hit.npbPlayerId, "canonical-pa")
    }

    for (const pl of doc.domain?.pitchingLines ?? []) {
      const line: PitchingLine = {
        yahooPlayerId: String(pl.yahooPlayerId ?? "").trim(),
        playerName: String(pl.playerName ?? "").trim(),
        inferredFrom: "stats_row_v0",
      }
      if (!/^\d+$/.test(line.yahooPlayerId)) continue
      const hit = resolveNpbForPitcherLine(roster, doc, line)
      if (hit?.npbPlayerId) add(line.yahooPlayerId, hit.npbPlayerId, "canonical-pitching-line")
    }

    // partial 試合などで投球行が無いが打席・一球に投手 ID だけ載るケース（例: 救援のみ・出場成績欠落）
    for (const pa of doc.domain?.plateAppearances ?? []) {
      for (const yid of collectPitcherYahooIdsFromPlateAppearance(pa)) {
        if (map.has(yid)) continue
        const name = pitcherNameForYahooPitcherId(doc, yid)
        const line: PitchingLine = {
          yahooPlayerId: yid,
          playerName: name,
          inferredFrom: "stats_row_v0",
        }
        const hit = resolveNpbForPitcherLine(roster, doc, line)
        if (hit?.npbPlayerId) add(yid, hit.npbPlayerId, "canonical-pa-pitcher")
      }
    }
  }
  const fromCanonical = map.size - sizeBeforeCanonical

  if (conflicts.length > 0) {
    console.warn("[build_yahoo_npb_full_index] yahoo→npb 衝突（先勝ちのまま）:", conflicts.length)
    for (const c of conflicts.slice(0, 15)) {
      console.warn(`  yahoo ${c.yahoo}: ${c.a} vs ${c.b} (${c.source})`)
    }
  }

  const outPath = join(projectRoot, "_data", "scraped_games", "derived", "yahoo_to_npb_full.json")
  const record: Record<string, string> = {}
  for (const [y, n] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    record[y] = n
  }

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        schemaVersion: "yahoo-to-npb-full-v1",
        generatedAt: new Date().toISOString(),
        source:
          "batting_master_bridge.csv + yahoo_pitcher_to_npb.json + canonical roster match (batting/pa/mentioned/pitching/pa-pitcher)",
        canonicalGames: docs.length,
        pairsAddedFromCanonicalVsBridgePitcher: fromCanonical,
        entryCount: Object.keys(record).length,
        map: record,
      },
      null,
      2,
    ),
    "utf8",
  )
  console.log(
    "[build_yahoo_npb_full_index] wrote",
    Object.keys(record).length,
    "yahoo→npb (canonical-added ~",
    fromCanonical,
    ") →",
    outPath,
  )
}

main()
