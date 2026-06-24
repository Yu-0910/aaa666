/**
 * 順位表打撃 vs 公式（ユーザー提示値）の差分診断
 *   npx tsx scripts/diag_standings_batting_vs_official.ts
 */
import { aggregateTeamStandingsByLeagueFromCanonical } from "@/lib/standings/aggregateTeamStandingsFromCanonical"
import { teamShortFromCode } from "@/lib/standings/teamCodes"
import {
  batterTeamShortInGame,
  isIntraLeagueGame,
  shouldIncludeStandingsGame,
} from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const root = process.cwd()
const year = "2026"
const league = "CL" as const

/** ユーザー提示スポナビ公式（2026 CL） */
const OFFICIAL: Record<
  string,
  {
    avg: number
    h: number
    hr: number
    d2: number
    d3: number
    obp: number
    slg: number
    ops: number
    risp: number
    risp_ab: number
    risp_h: number
    runs: number
    ab: number
    pa: number
    bb: number
    so: number
    g: number
  }
> = {
  巨人: { avg: 0.228, h: 478, hr: 51, d2: 79, d3: 7, obp: 0.283, slg: 0.345, ops: 0.628, risp: 0.24, risp_ab: 462, risp_h: 111, runs: 202, ab: 2096, pa: 2297, bb: 147, so: 553, g: 64 },
  阪神: { avg: 0.248, h: 503, hr: 45, d2: 87, d3: 8, obp: 0.32, slg: 0.365, ops: 0.685, risp: 0.275, risp_ab: 477, risp_h: 131, runs: 230, ab: 2029, pa: 2313, bb: 206, so: 525, g: 62 },
  ヤクルト: { avg: 0.235, h: 499, hr: 39, d2: 84, d3: 7, obp: 0.294, slg: 0.336, ops: 0.63, risp: 0.253, risp_ab: 490, risp_h: 124, runs: 206, ab: 2127, pa: 2332, bb: 171, so: 525, g: 64 },
  DeNA: { avg: 0.245, h: 521, hr: 37, d2: 94, d3: 1, obp: 0.309, slg: 0.342, ops: 0.651, risp: 0.287, risp_ab: 460, risp_h: 132, runs: 232, ab: 2127, pa: 2361, bb: 180, so: 485, g: 64 },
  広島: { avg: 0.215, h: 433, hr: 38, d2: 68, d3: 9, obp: 0.277, slg: 0.314, ops: 0.591, risp: 0.228, risp_ab: 435, risp_h: 99, runs: 175, ab: 2018, pa: 2253, bb: 170, so: 464, g: 61 },
  中日: { avg: 0.234, h: 492, hr: 46, d2: 77, d3: 9, obp: 0.303, slg: 0.344, ops: 0.647, risp: 0.246, risp_ab: 456, risp_h: 112, runs: 214, ab: 2105, pa: 2378, bb: 207, so: 554, g: 64 },
}

function sumLinesH(
  docs: ReturnType<typeof loadCanonicalGamesMergedForDerivedPipeline>,
  team: string,
  intraOnly: boolean,
): number {
  let h = 0
  for (const doc of docs) {
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
    if (!shouldIncludeStandingsGame(doc, year, league, opts)) continue
    if (intraOnly && !isIntraLeagueGame(doc, league)) continue
    for (const ln of doc.domain?.battingLines ?? []) {
      const bid = String(ln.yahooPlayerId ?? "").trim()
      if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
      h += ln.h ?? 0
    }
  }
  return h
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
const standings = aggregateTeamStandingsByLeagueFromCanonical(docs, year, { projectRoot: root })

console.log("=== 順位表 vs 公式 ===\n")
for (const row of standings.CL) {
  const team = teamShortFromCode(row.team)
  const o = OFFICIAL[team]
  if (!o) continue
  const lineH = sumLinesH(docs, team, false)
  const lineHIntra = sumLinesH(docs, team, true)
  const d = (v: number | null, exp: number, n = 0) => {
    if (v == null) return "—"
    const diff = v - exp
    const sign = diff >= 0 ? "+" : ""
    return n === 0 ? `${v} (${sign}${diff})` : `${v.toFixed(n)} (${sign}${diff.toFixed(n)})`
  }
  console.log(`【${team}】`)
  console.log(`  試合   現=${row.g} 公式=${o.g}`)
  console.log(`  得点   現=${d(row.runs, o.runs)}`)
  console.log(`  安打   現=${d(row.h, o.h)}  lines=${lineH} lines(リーグ内)=${lineHIntra}`)
  console.log(`  打数   現=${row.ab ?? "—"} 公式=${o.ab}`)
  console.log(`  打席   現=${row.pa ?? "—"} 公式=${o.pa}`)
  console.log(`  本塁打 現=${d(row.hr, o.hr)}`)
  console.log(`  二塁打 現=${d(row.doubles, o.d2)}`)
  console.log(`  四球   現=${row.bb ?? "—"} 公式=${o.bb}`)
  console.log(`  三振   現=${row.so ?? "—"} 公式=${o.so}`)
  console.log(`  打率   現=${d(row.avg, o.avg, 3)}`)
  console.log(`  OPS    現=${d(row.ops, o.ops, 3)}`)
  console.log(`  得点圏 現=${d(row.risp_avg, o.risp, 3)}  (公式 ${o.risp_h}/${o.risp_ab})`)
  console.log()
}
