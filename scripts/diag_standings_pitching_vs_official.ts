/**
 * 順位表投手 vs 公式（ユーザー提示値）の差分診断
 *   npx tsx scripts/diag_standings_pitching_vs_official.ts
 */
import { aggregateTeamStandingsByLeagueFromCanonical } from "@/lib/standings/aggregateTeamStandingsFromCanonical"
import { teamShortFromCode } from "@/lib/standings/teamCodes"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const root = process.cwd()
const year = "2026"

/** ユーザー提示スポナビ公式（2026 CL 投手） */
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
  巨人: { era: 2.99, era_starter: 3.15, era_relief: 2.72, k_pct: 8.18, avg_allowed: 0.23, qs_rate: 46.88, cg: 3, w: 34, l: 28, g: 64 },
  阪神: { era: 3.13, era_starter: 2.87, era_relief: 3.67, k_pct: 8.16, avg_allowed: 0.23, qs_rate: 61.29, cg: 6, w: 33, l: 28, g: 62 },
  ヤクルト: { era: 3.15, era_starter: 3.22, era_relief: 3.01, k_pct: 8.15, avg_allowed: 0.23, qs_rate: 50.0, cg: 3, w: 34, l: 29, g: 64 },
  DeNA: { era: 3.62, era_starter: 4.01, era_relief: 3.04, k_pct: 8.44, avg_allowed: 0.245, qs_rate: 40.63, cg: 1, w: 26, l: 36, g: 64 },
  広島: { era: 2.88, era_starter: 2.78, era_relief: 3.11, k_pct: 7.63, avg_allowed: 0.23, qs_rate: 54.1, cg: 3, w: 23, l: 35, g: 61 },
  中日: { era: 3.5, era_starter: 3.34, era_relief: 3.87, k_pct: 8.24, avg_allowed: 0.243, qs_rate: 57.81, cg: 4, w: 22, l: 41, g: 64 },
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
const standings = aggregateTeamStandingsByLeagueFromCanonical(docs, year, { projectRoot: root })

console.log("=== 順位表投手 vs 公式 ===\n")
for (const row of standings.CL) {
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
