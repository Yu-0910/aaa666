/**
 * Yahoo 打者ページの player id（数値）と NPB 公式 player_id の対応。
 *
 * 主ソース: `_data/scraped_games/derived/2021038624_batting_master_bridge.csv`
 * （各行は yahoo_player_id と npb_player_id の両方を埋めること。npb 欠損は `npm run validate:bridge` で検出）
 *
 * 補助: MANUAL_YAHOO_TO_NPB — CSV だけでは済まないときのみ（原則橋渡し CSV を直す）
 *
 * 投手のみ canonical に現れ打席マスタに載らない Yahoo ID は橋渡しに行が無いことがある。
 * 再発防止: `player_season_pitching_poc` から `npm run build:yahoo-pitcher-npb-index` で
 * `_data/scraped_games/derived/yahoo_pitcher_to_npb.json` を生成し、橋渡し・MANUAL の後に
 * 未登録の Yahoo ID だけを穴埋めする（MANUAL は常に優先）。
 *
 * 再発防止: `npm run phase19:build:pitching-rankings` 完了時に team/romanName 検証が走る。
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { MANUAL_YAHOO_TO_NPB } from "@/lib/yahooNpbBatterIdMap.manual"

type Maps = { yahooToNpb: Map<string, string>; npbToYahoo: Map<string, string> }

let cached: Maps | null = null

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

function loadMaps(): Maps {
  if (cached) return cached
  const yahooToNpb = new Map<string, string>()
  const npbToYahoo = new Map<string, string>()
  const fromCwd = path.join(
    process.cwd(),
    "_data",
    "scraped_games",
    "derived",
    "2021038624_batting_master_bridge.csv",
  )
  const libDir = path.dirname(fileURLToPath(import.meta.url))
  const fromLib = path.join(
    libDir,
    "..",
    "_data",
    "scraped_games",
    "derived",
    "2021038624_batting_master_bridge.csv",
  )
  const p = fs.existsSync(fromCwd) ? fromCwd : fromLib
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, "utf-8").split(/\r?\n/).filter((l) => l.trim())
    if (lines.length >= 2) {
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^\ufeff/, ""))
      const iNpb = headers.indexOf("npb_player_id")
      const iYahoo = headers.indexOf("yahoo_player_id")
      if (iNpb >= 0 && iYahoo >= 0) {
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i])
          const npb = (cols[iNpb] ?? "").trim()
          const yahoo = (cols[iYahoo] ?? "").trim()
          if (npb && yahoo && /^\d+$/.test(npb) && /^\d+$/.test(yahoo)) {
            yahooToNpb.set(yahoo, npb)
            npbToYahoo.set(npb, yahoo)
          }
        }
      }
    }
  }
  for (const [yahoo, npb] of Object.entries(MANUAL_YAHOO_TO_NPB)) {
    if (/^\d+$/.test(yahoo) && /^\d+$/.test(npb)) {
      yahooToNpb.set(yahoo, npb)
      npbToYahoo.set(npb, yahoo)
    }
  }

  const pitcherIndexPaths = [
    path.join(process.cwd(), "_data", "scraped_games", "derived", "yahoo_pitcher_to_npb.json"),
    path.join(libDir, "..", "_data", "scraped_games", "derived", "yahoo_pitcher_to_npb.json"),
  ]
  const pitcherIdxPath = pitcherIndexPaths.find((p) => fs.existsSync(p))
  if (pitcherIdxPath) {
    try {
      const raw = JSON.parse(fs.readFileSync(pitcherIdxPath, "utf-8")) as {
        map?: Record<string, string>
      }
      const m = raw?.map ?? {}
      for (const [yahoo, npb] of Object.entries(m)) {
        const y = String(yahoo).trim()
        const n = String(npb).trim().replace(/[^\d]/g, "")
        if (!/^\d+$/.test(y) || !n) continue
        if (!yahooToNpb.has(y)) {
          yahooToNpb.set(y, n)
          if (!npbToYahoo.has(n)) npbToYahoo.set(n, y)
        }
      }
    } catch {
      // ignore bad index
    }
  }

  cached = { yahooToNpb, npbToYahoo }
  return cached
}

/** Phase 等で同一プロセス内に古い橋渡しキャッシュが残るのを防ぐ（手動マップ更新後の再読込用）。 */
export function invalidateYahooNpbBatterMapsCache(): void {
  cached = null
}

/** 公開 playerId（URL セグメント）が Yahoo 打者 ID のとき、名簿照合用の NPB player_id を返す。 */
export function resolveNpbPlayerIdFromPublicId(raw: string): string {
  const id = (raw || "").trim()
  if (!id || !/^\d+$/.test(id)) return id
  const { yahooToNpb } = loadMaps()
  return yahooToNpb.get(id) ?? id
}

/**
 * `batting_stats.csv` の player_id（Yahoo）で pilot 読み込みするための ID。
 * - NPB 公式 ID が渡された場合は bridge から Yahoo ID に変換
 * - すでに Yahoo ID の場合はそのまま
 */
export function resolveYahooPilotIdForStats(raw: string): string | null {
  const id = (raw || "").trim()
  if (!id || !/^\d+$/.test(id)) return null
  const { npbToYahoo, yahooToNpb } = loadMaps()
  if (npbToYahoo.has(id)) return npbToYahoo.get(id)!
  if (yahooToNpb.has(id)) return id
  return null
}
