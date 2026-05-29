/**
 * canonical に現れる投手 Yahoo ID が、ランタイム統合マップで NPB player_id に解決できるか監査する。
 *
 * 統合マップの順序は `lib/yahooNpbBatterIdMap.ts` と同じ（橋渡し CSV → yahoo_to_npb_full.json →
 * MANUAL_YAHOO_TO_NPB → yahoo_pitcher_to_npb.json）。
 *
 * 先に `npm run build:yahoo-npb-full-index` を実行すると、打席・一球由来の ID が full に載る。
 *
 * 実行: npx tsx scripts/audit_yahoo_pitcher_coverage_from_canonical.ts [--fail]
 */

import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGames } from "../lib/yahooGame/loadCanonicalGames"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { collectPitcherYahooIdsFromPlateAppearance } from "../lib/yahooGame/yahooPitcherIdForVsHandFromPa"
import { invalidateYahooNpbBatterMapsCache, lookupNpbPlayerIdForYahooId } from "../lib/yahooNpbBatterIdMap"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function pitcherHintName(doc: CanonicalGameDocument, yid: string): string {
  for (const pl of doc.domain?.pitchingLines ?? []) {
    if (String(pl.yahooPlayerId ?? "").trim() === yid) return String(pl.playerName ?? "").trim()
  }
  const m = doc.game?.yahooPlayersMentioned?.[yid]
  if (m) return String(m).trim()
  return ""
}

function main(): void {
  process.chdir(projectRoot)
  const fail = process.argv.includes("--fail")

  invalidateYahooNpbBatterMapsCache()

  const docs = loadCanonicalGames(projectRoot)
  const allPitcherYahooIds = new Set<string>()

  for (const doc of docs) {
    for (const pl of doc.domain?.pitchingLines ?? []) {
      const y = String(pl.yahooPlayerId ?? "").trim()
      if (/^\d+$/.test(y)) allPitcherYahooIds.add(y)
    }
    for (const pa of doc.domain?.plateAppearances ?? []) {
      for (const y of collectPitcherYahooIdsFromPlateAppearance(pa)) {
        allPitcherYahooIds.add(y)
      }
    }
  }

  const missing: { yid: string; gameSample: string; nameSample: string }[] = []

  for (const yid of [...allPitcherYahooIds].sort((a, b) => a.localeCompare(b))) {
    const npb = lookupNpbPlayerIdForYahooId(yid)
    if (npb) continue
    let gameSample = ""
    let nameSample = ""
    for (const doc of docs) {
      let hit = false
      for (const pl of doc.domain?.pitchingLines ?? []) {
        if (String(pl.yahooPlayerId ?? "").trim() === yid) {
          hit = true
          break
        }
      }
      if (!hit) {
        for (const pa of doc.domain?.plateAppearances ?? []) {
          if (collectPitcherYahooIdsFromPlateAppearance(pa).includes(yid)) {
            hit = true
            break
          }
        }
      }
      if (hit) {
        gameSample = doc.gameId
        nameSample = pitcherHintName(doc, yid)
        break
      }
    }
    missing.push({ yid, gameSample, nameSample })
  }

  console.log(
    `[audit:yahoo-pitcher-coverage] canonical games=${docs.length} distinct pitcher yahoo ids=${allPitcherYahooIds.size}`,
  )

  if (missing.length === 0) {
    console.log("[audit:yahoo-pitcher-coverage] OK — 未解決の投手 Yahoo ID はありません。")
    return
  }

  console.warn(`[audit:yahoo-pitcher-coverage] 未解決 ${missing.length} 件（MANUAL または名簿照合の追加が必要）:`)
  for (const row of missing) {
    console.warn(
      `  yahoo ${row.yid}  name="${row.nameSample || "(不明)"}"  sampleGame=${row.gameSample || "(不明)"}`,
    )
  }

  if (fail) process.exit(1)
}

main()
