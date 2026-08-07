/**
 * player_season_pitching_poc の npb_*.json から Yahoo→NPB を生成し、
 * Phase 19 ランキングに載るが PoC にまだ無い Yahoo ID を名簿（findRosterPlayerByPublicId）で補完する。
 *
 * 出力: _data/scraped_games/derived/yahoo_pitcher_to_npb.json
 *
 * 実行: npx tsx scripts/build_yahoo_pitcher_npb_index.ts [--year 2026]
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { findRosterPlayerByPublicId } from "../lib/npbRoster"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    }
  }
  return { year }
}

type RankingRow = {
  playerId?: string
  ip?: number
  bf?: number
  ha?: number
  hra?: number
  so?: number
  bb?: number
  np?: number
}

function loadRankingYahooIds(year: string): Set<string> {
  const ids = new Set<string>()
  const base = join(projectRoot, "public", "data", "rankings", "pitching", year)
  for (const lg of ["CL", "PL"] as const) {
    const eraPath = join(base, lg, "防御率.json")
    if (!existsSync(eraPath)) continue
    let rows: unknown
    try {
      rows = JSON.parse(readFileSync(eraPath, "utf8"))
    } catch {
      continue
    }
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      if (!row || typeof row !== "object") continue
      const pid = String((row as RankingRow).playerId ?? "").trim()
      if (/^\d+$/.test(pid)) ids.add(pid)
    }
  }
  return ids
}

function mapFromPoc(year: string): { map: Record<string, string>; conflicts: unknown[] } {
  const map: Record<string, string> = {}
  const conflicts: unknown[] = []
  const pocBase = join(projectRoot, "_data", "derived", "player_season_pitching_poc")

  if (!existsSync(pocBase)) {
    return { map, conflicts }
  }

  const years = readdirSync(pocBase).filter((d) => {
    const p = join(pocBase, d)
    try {
      return statSync(p).isDirectory() && /^\d{4}$/.test(d)
    } catch {
      return false
    }
  })

  for (const y of years) {
    const dir = join(pocBase, y)
    const files = readdirSync(dir).filter((f) => f.startsWith("npb_") && f.endsWith(".json"))
    for (const f of files) {
      const m = f.match(/^npb_(\d+)\.json$/)
      const npbFromName = m ? m[1] : ""
      const full = join(dir, f)
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(full, "utf8"))
      } catch {
        continue
      }
      const o = raw as { npbPlayerId?: string; yahooPitcherIds?: unknown }
      const npb = String(o.npbPlayerId ?? npbFromName ?? "").replace(/[^\d]/g, "")
      if (!npb) continue
      const ids = o.yahooPitcherIds
      if (!Array.isArray(ids)) continue
      for (const yid of ids) {
        const id = String(yid ?? "").trim().replace(/[^\d]/g, "")
        if (!id) continue
        if (map[id] && map[id] !== npb) {
          conflicts.push({ yahoo: id, a: map[id], b: npb, file: f })
        } else {
          map[id] = npb
        }
      }
    }
  }

  return { map, conflicts }
}

function main(): void {
  const { year } = parseArgs()
  const { map, conflicts } = mapFromPoc(year)

  if (conflicts.length > 0) {
    console.warn("[build_yahoo_pitcher_npb_index] npb 衝突（先勝ち）:", conflicts.length)
    for (const c of conflicts.slice(0, 8) as { yahoo: string; a: string; b: string; file: string }[]) {
      console.warn(`  yahoo ${c.yahoo}: ${c.a} vs ${c.b} (${c.file})`)
    }
  }

  const rankingIds = loadRankingYahooIds(year)
  let filledFromRoster = 0
  for (const yid of rankingIds) {
    if (map[yid]) continue
    const roster = findRosterPlayerByPublicId(yid)
    if (roster?.npb_player_id) {
      map[yid] = roster.npb_player_id
      filledFromRoster++
    }
  }

  let normalizedFromRoster = 0
  for (const yid of Object.keys(map)) {
    const roster = findRosterPlayerByPublicId(yid)
    const canonicalNpb = roster?.npb_player_id?.trim()
    if (canonicalNpb && canonicalNpb !== map[yid]) {
      map[yid] = canonicalNpb
      normalizedFromRoster++
    }
  }
  if (normalizedFromRoster > 0) {
    console.log(
      `[build_yahoo_pitcher_npb_index] 既存 PoC 由来IDを名簿/手動マップで ${normalizedFromRoster} 件正規化`,
    )
  }

  if (filledFromRoster > 0) {
    console.log(
      `[build_yahoo_pitcher_npb_index] ランキング掲載・PoC 未登録を名簿で ${filledFromRoster} 件補完`,
    )
  }

  const outPath = join(projectRoot, "_data", "scraped_games", "derived", "yahoo_pitcher_to_npb.json")
  const payload = {
    schemaVersion: "yahoo-pitcher-to-npb-v1",
    generatedAt: new Date().toISOString(),
    source: "player_season_pitching_poc + roster fallback (Phase 19 Yahoo IDs)",
    map,
  }
  mkdirSync(dirname(outPath), { recursive: true })
  writeJsonFileWithRetrySync(outPath, payload)
  console.log("[build_yahoo_pitcher_npb_index] wrote", Object.keys(map).length, "yahoo→npb →", outPath)
}

main()
