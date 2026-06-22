import { aggregateTeamStandingsByLeagueFromCanonical } from "@/lib/standings/aggregateTeamStandingsFromCanonical"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const root = process.cwd()
const year = process.argv.find((a) => a.startsWith("--year="))?.split("=")[1] ?? "2026"
const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
const result = aggregateTeamStandingsByLeagueFromCanonical(docs, year, { projectRoot: root })

for (const lg of ["CL", "PL"] as const) {
  console.log(`=== ${lg} (${year}) ===`)
  for (const row of result[lg]) {
    console.log(
      [
        row.rank,
        row.team,
        row.teamName,
        `G${row.g}`,
        `${row.w}-${row.l}-${row.t}`,
        `pct=${row.pct?.toFixed(3) ?? "—"}`,
        `gb=${row.gb}`,
        `R=${row.runs}`,
        `OPS=${row.ops?.toFixed(3) ?? "—"}`,
        `ERA=${row.era?.toFixed(2) ?? "—"}`,
      ].join(" "),
    )
    const check = row.g === row.w + row.l + row.t
    if (!check) console.warn("  WARN g!=w+l+t", row)
  }
}
