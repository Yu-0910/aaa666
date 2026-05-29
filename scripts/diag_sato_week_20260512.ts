/**
 * 佐藤輝明・週 5/12〜5/17 の打席別内訳（Phase17 検算）
 * npx tsx scripts/diag_sato_week_20260512.ts
 */

import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { parseGameDateYmdFromCanonical } from "../lib/yahooGame/gameDateFromCanonical"
import { tuesdayWeekKeyFromYmd, formatWeekRangeTueToSunFromTuesdayYmd } from "../lib/yahooGame/jstPeriodKeys"
import {
  emptyBattingSeasonAggYahoo,
  updateBattingAggFromPa,
  plateAppearanceLastResultText,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { getProjectRoot } from "../lib/projectRoot"
import { readFileSync } from "fs"
import { join } from "path"

const YAHOO_ID = "2000051"
const WEEK_KEY = "2026-05-12"

function main(): void {
  const root = getProjectRoot()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  const periodPath = join(
    root,
    "_data/derived/player_season_batting_period/2026",
    `yahoo_${YAHOO_ID}.json`
  )
  const period = JSON.parse(readFileSync(periodPath, "utf8")) as {
    rows?: Array<{ split_label?: string; ab?: number; h?: number; pa?: number }>
  }
  const weekRow = period.rows?.find((r) => r.split_label === "5/12〜5/17")

  const agg = emptyBattingSeasonAggYahoo()
  const paLog: Array<{ gameId: string; ymd: string; paId: string; result: string }> = []

  for (const doc of docs) {
    const ymd = parseGameDateYmdFromCanonical(doc)
    if (!ymd) continue
    if (tuesdayWeekKeyFromYmd(ymd) !== WEEK_KEY) continue

    for (const pa of doc.domain.plateAppearances ?? []) {
      if (String(pa.yahooBatterId ?? "").trim() !== YAHOO_ID) continue
      const result = plateAppearanceLastResultText(pa)
      paLog.push({ gameId: doc.gameId, ymd, paId: String(pa.paId ?? ""), result })
      updateBattingAggFromPa(agg, doc.gameId, pa, doc)
    }
  }

  console.log("week label", formatWeekRangeTueToSunFromTuesdayYmd(WEEK_KEY))
  console.log("phase17 file", weekRow)
  console.log("recomputed from canonical PAs", {
    g: agg.gameIds.size,
    pa: agg.pa,
    ab: agg.ab,
    h: agg.h,
    h2: agg.h2,
    h3: agg.h3,
    hr: agg.hr,
  })
  console.log("\nPA log:")
  for (const row of paLog) {
    console.log(`  ${row.ymd} ${row.gameId} ${row.paId} | ${row.result}`)
  }
}

main()
