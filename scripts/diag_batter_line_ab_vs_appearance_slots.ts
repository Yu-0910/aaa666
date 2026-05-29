/**
 * Per-game: battingLines[].ab vs AB from appearance slots (isAtBat on each non-empty slot),
 * same slot source as canonicalBattingSeasonAgg `appearance_slots`.
 *
 *   npx tsx scripts/diag_batter_line_ab_vs_appearance_slots.ts --yahoo-id 1950417 --year 2026
 */
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import {
  appearanceSlotsForBatterInDoc,
  countAtBatsFromAppearanceSlotTexts,
  lineAbForBatterInDoc,
} from "../lib/yahooGame/appearanceLineAbRecon"
import { parseGameDateYmdFromCanonical } from "../lib/yahooGame/gameDateFromCanonical"
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
    console.error("Usage: tsx scripts/diag_batter_line_ab_vs_appearance_slots.ts --yahoo-id <id> [--year 2026]")
    process.exit(1)
  }
  return { yahooId: yahooId.trim(), year }
}

function main(): void {
  const { yahooId, year } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  const rows: Array<{ gameId: string; date: string; lineAb: number; slotsAb: number; diff: number }> = []

  for (const doc of docs) {
    const ymd = parseGameDateYmdFromCanonical(doc)
    if (!ymd || !ymd.startsWith(year)) continue
    const lines = doc.domain?.battingLines ?? []
    if (!lines.some((l) => String(l.yahooPlayerId ?? "").trim() === yahooId)) continue

    const gameId = String(doc.gameId ?? "").trim()
    const lineAb = lineAbForBatterInDoc(doc, yahooId)
    const slotsAb = countAtBatsFromAppearanceSlotTexts(appearanceSlotsForBatterInDoc(doc, yahooId))
    rows.push({ gameId, date: ymd, lineAb, slotsAb, diff: lineAb - slotsAb })
  }

  rows.sort((a, b) => {
    const c = a.date.localeCompare(b.date)
    if (c !== 0) return c
    return a.gameId.localeCompare(b.gameId)
  })

  console.log(`gameId\tdate\tlineAb\tslotsAb\tdiff`)
  let sumLine = 0
  let sumSlots = 0
  for (const r of rows) {
    sumLine += r.lineAb
    sumSlots += r.slotsAb
    console.log(`${r.gameId}\t${r.date}\t${r.lineAb}\t${r.slotsAb}\t${r.diff}`)
  }
  console.log(`TOTAL\t\t${sumLine}\t${sumSlots}\t${sumLine - sumSlots}`)
}

main()
