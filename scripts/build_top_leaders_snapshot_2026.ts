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
import type { TopLeadersCategory } from "@/lib/topPage/leadersSnapshotShared"

function parseArgs(argv: string[]): {
  year: string
  leagues?: string[]
  categories?: TopLeadersCategory[]
} {
  let year = TOP_LEADERS_SNAPSHOT_YEAR
  let leagues: string[] | undefined
  let categories: TopLeadersCategory[] | undefined
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--year" && argv[i + 1]) {
      year = argv[i + 1]!
      i++
    } else if (argv[i] === "--league" && argv[i + 1]) {
      leagues = argv[i + 1]!
        .split(",")
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean)
      i++
    } else if (argv[i] === "--category" && argv[i + 1]) {
      categories = argv[i + 1]!
        .split(",")
        .map((v) => v.trim())
        .filter((v): v is TopLeadersCategory => v === "batting" || v === "pitching")
      i++
    }
  }
  return { year, leagues, categories }
}

function main(): void {
  const { year, leagues, categories } = parseArgs(process.argv.slice(2))
  console.log(`[top-leaders] building snapshots for ${year}...`)

  const { written, skipped } = buildTopLeadersSnapshotsForYear(year, { leagues, categories })

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
