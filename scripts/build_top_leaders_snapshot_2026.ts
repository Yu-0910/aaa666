/**
 * 2026 トップページ専用リーダー JSON を生成。
 * 前提: public/data/rankings/... および pitching ランキングが phase12/19 で生成済み。
 *
 * Usage: tsx scripts/build_top_leaders_snapshot_2026.ts [--year 2026]
 */

import {
  buildTopLeadersSnapshotsForYear,
  TOP_LEADERS_SNAPSHOT_YEAR,
} from "@/lib/topPage/leadersSnapshot2026"

function parseYear(argv: string[]): string {
  const i = argv.indexOf("--year")
  if (i >= 0 && argv[i + 1]) return argv[i + 1]!
  return TOP_LEADERS_SNAPSHOT_YEAR
}

function main(): void {
  const year = parseYear(process.argv.slice(2))
  console.log(`[top-leaders] building snapshots for ${year}...`)

  const { written, skipped } = buildTopLeadersSnapshotsForYear(year)

  for (const p of written) {
    console.log(`[top-leaders] wrote ${p}`)
  }
  for (const s of skipped) {
    console.warn(`[top-leaders] skipped ${s.league} ${s.category}: ${s.reason}`)
  }

  if (written.length === 0) {
    console.error(
      "[top-leaders] no files written. Run: npm run phase12:build:rankings && npm run phase19:build:pitching-rankings"
    )
    process.exit(1)
  }

  if (skipped.length > 0) {
    process.exit(2)
  }

  console.log(`[top-leaders] done (${written.length} files)`)
}

main()
