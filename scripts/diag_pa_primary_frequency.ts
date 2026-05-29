/**
 * 試合×打者で「一球ログ優先」（shouldAggregateBattingFromPaOnlyForBatterInGame）になる割合を数える。
 *
 *   npx tsx scripts/diag_pa_primary_frequency.ts --year 2026
 */

import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { shouldAggregateBattingFromPaOnlyForBatterInGame } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"

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

function gameYearFromTitle(doc: CanonicalGameDocument): string | null {
  const t = String(doc.game?.meta?.documentTitle ?? "")
  const m = t.match(/(\d{4})年/)
  return m ? m[1]! : null
}

function main(): void {
  const { year } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot).filter(
    (d) => gameYearFromTitle(d) === year,
  )

  let withLine = 0
  let lineButNoPaForBatter = 0
  let comparablePairs = 0
  let paPrimaryPairs = 0
  const gamesWithAnyPaPrimary = new Set<string>()
  const falseSamples: Array<{ gameId: string; bid: string }> = []

  for (const doc of docs) {
    const bids = new Set<string>()
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = String(line.yahooPlayerId ?? "").trim()
      if (bid) bids.add(bid)
    }
    const gameId = doc.gameId
    const allPas = doc.domain?.plateAppearances ?? []
    for (const bid of bids) {
      const lines = (doc.domain?.battingLines ?? []).filter(
        (l) => String(l.yahooPlayerId ?? "").trim() === bid,
      )
      if (lines.length === 0) continue
      withLine += 1
      const hasBatterPa = allPas.some((pa) => String(pa.yahooBatterId ?? "").trim() === bid)
      if (!hasBatterPa) {
        lineButNoPaForBatter += 1
        continue
      }
      comparablePairs += 1
      const paPrimary = shouldAggregateBattingFromPaOnlyForBatterInGame(doc, bid)
      if (paPrimary) {
        paPrimaryPairs += 1
        gamesWithAnyPaPrimary.add(gameId)
      } else if (falseSamples.length < 15) {
        falseSamples.push({ gameId, bid })
      }
    }
  }

  const pct = comparablePairs > 0 ? (100 * paPrimaryPairs) / comparablePairs : 0
  console.log(
    JSON.stringify(
      {
        year,
        canonicalGamesInYear: docs.length,
        /** 出場成績行がある「試合×打者」総数 */
        batterGamePairsWithBattingLine: withLine,
        /** 表はあるが「その打者」の打席ログが無い（代走のみ等で表に載るケース等） */
        batterGamePairs_lineButNoPaForThatBatter: lineButNoPaForBatter,
        /** 出場成績行があり、かつ「その打者本人」の打席が1件以上ある「試合×打者」 */
        comparableBatterGamePairs_lineAndBatterHasPa: comparablePairs,
        /** 上のうち一球ログ優先になったペア */
        paPrimaryBatterGamePairs: paPrimaryPairs,
        paPrimaryRateAmongComparable: Number(pct.toFixed(4)),
        gamesWithAtLeastOnePaPrimaryBatter: gamesWithAnyPaPrimary.size,
        sampleComparableButLinePrimary: falseSamples,
      },
      null,
      2,
    ),
  )
}

main()
