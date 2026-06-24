/**
 * 順位表投手 vs 公式（ユーザー提示値・2026 PL）
 *   npx tsx scripts/diag_standings_pl_pitching_vs_official.ts
 */
import { aggregateTeamStandingsByLeagueFromCanonical } from "@/lib/standings/aggregateTeamStandingsFromCanonical"
import { teamShortFromCode } from "@/lib/standings/teamCodes"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const root = process.cwd()
const year = "2026"

const OFFICIAL: Record<
  string,
  {
    era: number
    era_starter: number
    era_relief: number
    k_pct: number
    avg_allowed: number
    qs_rate: number
    cg: number
    w: number
    l: number
    g: number
  }
> = {
  西武: { era: 2.4, era_starter: 2.14, era_relief: 3.18, k_pct: 7.73, avg_allowed: 0.206, qs_rate: 70.77, cg: 6, w: 40, l: 23, g: 65 },
  ソフトバンク: { era: 3.18, era_starter: 3.81, era_relief: 2.18, k_pct: 8.25, avg_allowed: 0.239, qs_rate: 46.03, cg: 2, w: 37, l: 26, g: 63 },
  オリックス: { era: 3.25, era_starter: 3.04, era_relief: 3.6, k_pct: 7.97, avg_allowed: 0.237, qs_rate: 51.56, cg: 3, w: 35, l: 28, g: 64 },
  日本ハム: { era: 3.38, era_starter: 3.31, era_relief: 3.54, k_pct: 7.8, avg_allowed: 0.234, qs_rate: 53.03, cg: 7, w: 36, l: 30, g: 66 },
  ロッテ: { era: 3.51, era_starter: 4.06, era_relief: 2.68, k_pct: 7.06, avg_allowed: 0.232, qs_rate: 42.19, cg: 0, w: 31, l: 31, g: 64 },
  楽天: { era: 3.61, era_starter: 3.27, era_relief: 4.21, k_pct: 8.17, avg_allowed: 0.244, qs_rate: 52.38, cg: 1, w: 23, l: 39, g: 63 },
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
const standings = aggregateTeamStandingsByLeagueFromCanonical(docs, year, { projectRoot: root })

console.log("=== PL 順位表投手 vs 公式 ===\n")
for (const row of standings.PL) {
  const team = teamShortFromCode(row.team)
  const o = OFFICIAL[team]
  if (!o) continue
  const d = (v: number | null, exp: number, n = 2) => {
    if (v == null) return "—"
    const diff = v - exp
    const sign = diff >= 0 ? "+" : ""
    return n === 0 ? `${v} (${sign}${diff})` : `${v.toFixed(n)} (${sign}${diff.toFixed(n)})`
  }
  console.log(`【${team}】`)
  console.log(`  試合   現=${row.g} 公式=${o.g}  勝=${d(row.w, o.w, 0)} 敗=${d(row.l, o.l, 0)}`)
  console.log(`  防御率 現=${d(row.era, o.era)}  先発=${d(row.era_starter, o.era_starter)}  救援=${d(row.era_relief, o.era_relief)}`)
  console.log(`  K率    現=${d(row.k_pct_pitch, o.k_pct)}  被打率=${d(row.avg_allowed, o.avg_allowed, 3)}`)
  console.log(`  QS率   現=${d(row.qs_rate, o.qs_rate, 1)}%  完投=${d(row.cg, o.cg, 0)}`)
  console.log()
}
