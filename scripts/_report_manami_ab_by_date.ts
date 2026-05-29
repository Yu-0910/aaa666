/**
 * 万波中正（Yahoo batterId=1800093）の試合日別 打数(AB) を canonical から集計して表示。
 *
 * 実行:
 *   npx tsx scripts/_report_manami_ab_by_date.ts --year 2026
 */

import { loadCanonicalGames } from "../lib/yahooGame/loadCanonicalGames"
import { updateBattingAggFromPa, emptyBattingSeasonAggYahoo } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"

const MANAMI_YAHOO_BATTER_ID = "1800093"

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    }
  }
  return { year }
}

function gameDateFromTitle(doc: CanonicalGameDocument): string | null {
  const t = String(doc.game?.meta?.documentTitle ?? "")
  const m = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return null
  const y = m[1]!
  const mm = String(m[2]!).padStart(2, "0")
  const dd = String(m[3]!).padStart(2, "0")
  return `${y}-${mm}-${dd}`
}

function main(): void {
  const { year } = parseArgs()
  const docs = loadCanonicalGames({ year })
  const byDate = new Map<string, number>()

  for (const doc of docs) {
    const date = gameDateFromTitle(doc)
    if (!date) continue
    const agg = emptyBattingSeasonAggYahoo()
    let hadAny = false
    for (const pa of doc.domain.plateAppearances ?? []) {
      if ((pa.yahooBatterId ?? "").trim() !== MANAMI_YAHOO_BATTER_ID) continue
      hadAny = true
      updateBattingAggFromPa(agg, doc.gameId, pa)
    }
    if (!hadAny) continue
    if (agg.ab > 0) {
      byDate.set(date, (byDate.get(date) ?? 0) + agg.ab)
    } else {
      byDate.set(date, byDate.get(date) ?? 0)
    }
  }

  const rows = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [d, ab] of rows) {
    console.log(`${d}\t${ab}`)
  }
  const total = rows.reduce((acc, [, ab]) => acc + ab, 0)
  console.log(`TOTAL\t${total}`)
}

main()

