/**
 * 出場成績: battingLines.ab と appearance スロット由来の打数が一致するか検査する。
 *
 *   npx tsx scripts/validate_appearance_slots_vs_line_ab.ts --year 2026
 *   npx tsx scripts/validate_appearance_slots_vs_line_ab.ts --year 2026 --fail
 *   npx tsx scripts/validate_appearance_slots_vs_line_ab.ts --yahoo-id 1950417 --year 2026
 */
import { findAppearanceLineAbMismatchesInDoc } from "../lib/yahooGame/appearanceLineAbRecon"
import { parseGameDateYmdFromCanonical } from "../lib/yahooGame/gameDateFromCanonical"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { getProjectRoot } from "../lib/projectRoot"

function parseArgs(): { year: string; fail: boolean; yahooId: string | null } {
  const args = process.argv.slice(2)
  let year = "2026"
  let fail = false
  let yahooId: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = String(args[++i]).trim()
    } else if (args[i] === "--fail") {
      fail = true
    } else if (args[i] === "--yahoo-id" && args[i + 1]) {
      yahooId = String(args[++i]).trim()
    }
  }
  return { year, fail, yahooId }
}

function main(): void {
  const { year, fail, yahooId } = parseArgs()
  const root = getProjectRoot()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  const mismatches = []

  for (const doc of docs) {
    const ymd = parseGameDateYmdFromCanonical(doc)
    if (!ymd || !ymd.startsWith(year)) continue
    for (const m of findAppearanceLineAbMismatchesInDoc(doc, ymd)) {
      if (yahooId && m.yahooBatterId !== yahooId) continue
      mismatches.push(m)
    }
  }

  mismatches.sort((a, b) => {
    const c = (a.dateYmd ?? "").localeCompare(b.dateYmd ?? "")
    if (c !== 0) return c
    const d = a.gameId.localeCompare(b.gameId)
    if (d !== 0) return d
    return a.yahooBatterId.localeCompare(b.yahooBatterId)
  })

  if (mismatches.length === 0) {
    console.log(
      `[validate_appearance_slots_vs_line_ab] OK (year=${year}${yahooId ? `, yahooId=${yahooId}` : ""}): no lineAb vs slotsAb mismatches.`,
    )
    return
  }

  console.log(
    `[validate_appearance_slots_vs_line_ab] mismatches: ${mismatches.length} (year=${year}${yahooId ? `, filter=${yahooId}` : ""})`,
  )
  console.log("gameId\tdate\tyahooBatterId\tplayerName\tlineAb\tslotsAb\tdiff")
  for (const m of mismatches) {
    console.log(
      `${m.gameId}\t${m.dateYmd ?? ""}\t${m.yahooBatterId}\t${m.playerName}\t${m.lineAb}\t${m.slotsAb}\t${m.diff}`,
    )
  }

  if (fail) process.exit(1)
}

main()
