/**
 * 投手ランキング JSON の team / romanName を検証（CI や手元の差分確認用）。
 *   npx tsx scripts/verify_pitching_rankings_roster.ts [--year 2026]
 */

import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { assertPitchingRankingRosterComplete } from "../lib/ranking/verifyPitchingRankingRoster"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

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

const { year } = parseArgs()
assertPitchingRankingRosterComplete(projectRoot, year)
console.log(`[verify_pitching_rankings_roster] OK (${year})`)
