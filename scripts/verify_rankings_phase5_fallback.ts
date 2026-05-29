/**
 * Phase 5: 2026 年ランキング JSON の配置とフォールバック不要性の検証。
 * - 打撃: Record.csv の各指標について `2026/CL` と `2026/PL` の両方に `.json` / `_all.json` があること
 *   （欠けがあれば `loadRankingJson` が 404→2025 フォールバックしうる）
 * - 投手: Record_pitching と同様 + `assertPitchingRankingRosterComplete`
 *
 *   npx tsx scripts/verify_rankings_phase5_fallback.ts [--year 2026]
 */

import { existsSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { loadMetricsFromRecord } from "../lib/ranking/record"
import { loadMetricsFromRecordPitching } from "../lib/ranking/recordPitching"
import { sanitizeMetricForPath } from "../lib/ranking/url"
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

function main(): void {
  process.chdir(projectRoot)
  const { year } = parseArgs()
  const errors: string[] = []

  const battingBase = join(projectRoot, "public", "data", "rankings", year)
  const metricsBat = loadMetricsFromRecord()
  for (const m of metricsBat) {
    const fileBase = sanitizeMetricForPath(m.label)
    for (const lg of ["CL", "PL"] as const) {
      for (const suffix of [".json", "_all.json"] as const) {
        const name = suffix === ".json" ? `${fileBase}.json` : `${fileBase}_all.json`
        const p = join(battingBase, lg, name)
        if (!existsSync(p)) {
          errors.push(`[batting ${lg}] 欠損: ${name} （指標: ${m.label}）`)
        }
      }
    }
  }

  const pitchingBase = join(projectRoot, "public", "data", "rankings", "pitching", year)
  const metricsPitch = loadMetricsFromRecordPitching()
  for (const m of metricsPitch) {
    const fileBase = sanitizeMetricForPath(m.label)
    for (const lg of ["CL", "PL"] as const) {
      for (const suffix of [".json", "_all.json"] as const) {
        const name = suffix === ".json" ? `${fileBase}.json` : `${fileBase}_all.json`
        const p = join(pitchingBase, lg, name)
        if (!existsSync(p)) {
          errors.push(`[pitching ${lg}] 欠損: ${name} （指標: ${m.label}）`)
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error("[verify_rankings_phase5] Record 指標に対応する JSON が不足しています。")
    for (const e of errors) console.error(" ", e)
    console.error("  対処: npm run rankings:rebuild または phase12 / phase19 を再実行。")
    process.exit(1)
  }

  assertPitchingRankingRosterComplete(projectRoot, year)

  console.log(
    `[verify_rankings_phase5] OK (${year}): 打撃 ${metricsBat.length} 指標×CL/PL、投手 ${metricsPitch.length} 指標×CL/PL、名簿検証通過`,
  )
}

main()
