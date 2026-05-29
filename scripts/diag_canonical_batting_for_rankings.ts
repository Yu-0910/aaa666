/**
 * Phase12 と同じ入力（canonical 全試合）について、打席ログの有無と本塁打上位を表示する。
 * JSON の数値が変わらないとき「集計の元が増えているか」を切り分ける。
 *
 *   npx tsx scripts/diag_canonical_batting_for_rankings.ts
 *   npm run diag:canonical-batting
 */

import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { aggregateBattingSeasonByYahooBatter } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { loadCanonicalGames } from "../lib/yahooGame/loadCanonicalGames"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function main(): void {
  const docs = loadCanonicalGames(projectRoot)
  let paWithBatter = 0
  let paTotal = 0
  const gamesZeroPa: string[] = []
  for (const d of docs) {
    const pas = d.domain?.plateAppearances ?? []
    paTotal += pas.length
    for (const pa of pas) {
      if ((pa.yahooBatterId ?? "").trim()) paWithBatter += 1
    }
    if (pas.length === 0) gamesZeroPa.push(d.gameId)
  }

  const byBatter = aggregateBattingSeasonByYahooBatter(docs)
  const topHr = [...byBatter.entries()]
    .map(([yahooId, agg]) => ({
      yahooId,
      hr: agg.hr,
      pa: agg.pa,
      games: agg.gameIds.size,
    }))
    .sort((a, b) => b.hr - a.hr)
    .slice(0, 15)

  const payload = {
    note:
      "ランキング本塁打は plateAppearances のみから集計（出場成績の battingLines だけでは増えない）。数値が変わらないときは打席行が増えているか確認。",
    canonicalGameFiles: docs.length,
    plateAppearancesTotalRows: paTotal,
    plateAppearancesWithYahooBatterId: paWithBatter,
    uniqueBattersFromPa: byBatter.size,
    gamesWithZeroPlateAppearances: gamesZeroPa.length,
    sampleGameIdsWithZeroPa: gamesZeroPa.slice(0, 20),
    top15HrFromSameAggregateAsPhase12: topHr,
  }

  console.log(JSON.stringify(payload, null, 2))
}

main()
