/**
 * Phase 36: 三連戦カード + SN 予想 + Phase30 OPS top3 → トップ予想投手 JSON
 *
 * 出力: public/data/top-probables/{year}/current.json
 *
 *   npx tsx scripts/phase36_build_top_probables.ts --year 2026
 *   npm run phase36:build:top-probables
 */

import {
  buildTopProbablesSnapshot,
  writeTopProbablesSnapshot,
} from "@/lib/probables/buildTopProbablesSnapshot"

function parseArgs(argv: string[]) {
  const yearIdx = argv.indexOf("--year")
  const asOfIdx = argv.indexOf("--as-of")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : "2026"
  const asOfDateJst = asOfIdx >= 0 ? (argv[asOfIdx + 1] ?? "").trim() : undefined
  return { year, asOfDateJst }
}

async function main() {
  const { year, asOfDateJst } = parseArgs(process.argv.slice(2))
  const snapshot = await buildTopProbablesSnapshot({ year, asOfDateJst })
  const outPath = writeTopProbablesSnapshot(snapshot)
  console.log(
    `[phase36] wrote ${outPath} cards=${snapshot.cards.length} warnings=${snapshot.warnings.length}`,
  )
  if (snapshot.warnings.length > 0) {
    for (const w of snapshot.warnings.slice(0, 10)) {
      console.warn(`[phase36] warning: ${w}`)
    }
    if (snapshot.warnings.length > 10) {
      console.warn(`[phase36] ... and ${snapshot.warnings.length - 10} more warnings`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
