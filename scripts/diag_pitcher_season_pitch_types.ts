/**
 * 1投手のシーズン球種別を canonical 横断で集計（検証用）
 *
 *   npx tsx scripts/diag_pitcher_season_pitch_types.ts --npb 91095136
 */

import { buildPitcherSeasonPitchTypesLive } from "../lib/yahooGame/buildPitcherSeasonPitchTypesLive"

function parseArgs(): { npb: string; year: string } {
  const args = process.argv.slice(2)
  let npb = "71075130"
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--npb" && args[i + 1]) {
      npb = args[i + 1]!.trim()
      i++
    } else if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!.trim()
      i++
    }
  }
  return { npb, year }
}

function main(): void {
  const { npb, year } = parseArgs()
  const payload = buildPitcherSeasonPitchTypesLive(npb, year)
  if (!payload) {
    console.error("no data for npb", npb)
    process.exit(1)
  }

  console.log(
    "npb",
    npb,
    "games",
    payload.source.canonicalGames.length,
    "pitches",
    payload.pitches_total,
  )
  console.log("\n球種\t全体\t対左\t対右\t平均\tWhiff%L\tWhiff%R\t被打率L\t被打率R\tStrike%L\tStrike%R")
  for (const r of payload.rows) {
    const avgHrL = r.avg_vs_left && r.avg_vs_left !== "—" ? `${r.avg_vs_left} (${r.hr_vs_left ?? 0})` : "—"
    const avgHrR = r.avg_vs_right && r.avg_vs_right !== "—" ? `${r.avg_vs_right} (${r.hr_vs_right ?? 0})` : "—"
    console.log(
      [
        r.pitch_type,
        `${r.pct.toFixed(1)}%`,
        r.pct_vs_left != null ? `${r.pct_vs_left.toFixed(1)}%` : "—",
        r.pct_vs_right != null ? `${r.pct_vs_right.toFixed(1)}%` : "—",
        r.avg_speed_kmh?.toFixed(1) ?? "—",
        r.whiff_pct_vs_left ?? "—",
        r.whiff_pct_vs_right ?? "—",
        avgHrL,
        avgHrR,
        r.strike_pct_vs_left ?? "—",
        r.strike_pct_vs_right ?? "—",
      ].join("\t"),
    )
  }
}

main()
