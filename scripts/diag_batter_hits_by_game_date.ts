/**
 * 指定打者の「試合開催日（canonical タイトル）」別の安打数・打席・打数を一覧する。
 *
 *   npx tsx scripts/diag_batter_hits_by_game_date.ts --yahoo-id 1851204 --year 2026
 */
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { parseGameDateYmdFromCanonical } from "../lib/yahooGame/gameDateFromCanonical"
import {
  emptyBattingSeasonAggYahoo,
  updateBattingAggFromPa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { yahooId: string; year: string } {
  const args = process.argv.slice(2)
  let yahooId = ""
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--yahoo-id" && args[i + 1]) {
      yahooId = args[i + 1]!
      i++
    } else if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    }
  }
  if (!yahooId.trim()) {
    console.error("Usage: tsx scripts/diag_batter_hits_by_game_date.ts --yahoo-id <id> [--year 2026]")
    process.exit(1)
  }
  return { yahooId: yahooId.trim(), year }
}

function main(): void {
  const { yahooId, year } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  const byYmd = new Map<string, BattingSeasonAggYahoo>()

  for (const doc of docs) {
    const ymd = parseGameDateYmdFromCanonical(doc)
    if (!ymd || !ymd.startsWith(year)) continue
    const pas = (doc.domain?.plateAppearances ?? []).filter(
      (pa) => String(pa.yahooBatterId ?? "").trim() === yahooId,
    )
    if (pas.length === 0) continue

    let agg = byYmd.get(ymd)
    if (!agg) {
      agg = emptyBattingSeasonAggYahoo()
      byYmd.set(ymd, agg)
    }
    const gid = String(doc.gameId ?? "")
    for (const pa of pas) {
      updateBattingAggFromPa(agg, gid, pa, doc)
    }
  }

  const keys = [...byYmd.keys()].sort()
  console.log(`date\th\tab\tpa\tgames\t(${yahooId}, year prefix ${year})`)
  for (const k of keys) {
    const a = byYmd.get(k)!
    console.log(`${k}\t${a.h}\t${a.ab}\t${a.pa}\t${a.gameIds.size}`)
  }
}

main()
