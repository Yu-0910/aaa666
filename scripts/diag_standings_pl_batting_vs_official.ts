/**
 * 順位表打撃 vs 公式（ユーザー提示値・2026 PL）
 *   npx tsx scripts/diag_standings_pl_batting_vs_official.ts
 */
import { aggregateTeamStandingsByLeagueFromCanonical } from "@/lib/standings/aggregateTeamStandingsFromCanonical"
import { teamShortFromCode } from "@/lib/standings/teamCodes"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const root = process.cwd()
const year = "2026"
const league = "PL" as const

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
    g: number
  }
> = {
  西武: { avg: 0.249, h: 547, hr: 51, d2: 90, d3: 12, obp: 0.308, slg: 0.37, ops: 0.678, risp: 0.264, risp_ab: 503, risp_h: 133, runs: 245, ab: 2201, g: 65 },
  ソフトバンク: { avg: 0.248, h: 521, hr: 67, d2: 95, d3: 8, obp: 0.322, slg: 0.397, ops: 0.719, risp: 0.266, risp_ab: 488, risp_h: 130, runs: 275, ab: 2100, g: 63 },
  オリックス: { avg: 0.246, h: 512, hr: 36, d2: 100, d3: 6, obp: 0.308, slg: 0.351, ops: 0.659, risp: 0.266, risp_ab: 470, risp_h: 125, runs: 227, ab: 2084, g: 64 },
  日本ハム: { avg: 0.243, h: 535, hr: 77, d2: 79, d3: 12, obp: 0.31, slg: 0.395, ops: 0.706, risp: 0.271, risp_ab: 476, risp_h: 129, runs: 261, ab: 2198, g: 66 },
  ロッテ: { avg: 0.236, h: 508, hr: 49, d2: 80, d3: 6, obp: 0.296, slg: 0.347, ops: 0.643, risp: 0.228, risp_ab: 496, risp_h: 113, runs: 212, ab: 2151, g: 64 },
  楽天: { avg: 0.236, h: 486, hr: 39, d2: 69, d3: 9, obp: 0.3, slg: 0.335, ops: 0.635, risp: 0.249, risp_ab: 426, risp_h: 106, runs: 188, ab: 2062, g: 63 },
}

function sumLinesH(docs: ReturnType<typeof loadCanonicalGamesMergedForDerivedPipeline>, team: string): number {
  let h = 0
  for (const doc of docs) {
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
    if (!shouldIncludeStandingsGame(doc, year, league, opts)) continue
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

console.log("=== PL 順位表 vs 公式 ===\n")
for (const row of standings.PL) {
  const team = teamShortFromCode(row.team)
  const o = OFFICIAL[team]
  if (!o) continue
  const lineH = sumLinesH(docs, team)
  const d = (v: number | null, exp: number, n = 0) => {
    if (v == null) return "—"
    const diff = v - exp
    const sign = diff >= 0 ? "+" : ""
    return n === 0 ? `${v} (${sign}${diff})` : `${v.toFixed(n)} (${sign}${diff.toFixed(n)})`
  }
  console.log(`【${team}】`)
  console.log(`  試合   現=${row.g} 公式=${o.g}  得点 現=${d(row.runs, o.runs)}`)
  console.log(`  安打   現=${d(row.h, o.h)}  lines=${lineH}`)
  console.log(`  本塁打 現=${d(row.hr, o.hr)}  二塁打 現=${d(row.doubles, o.d2)}  三塁打 現=${d(row.triples, o.d3)}`)
  console.log(`  打率   現=${d(row.avg, o.avg, 3)}  OPS 現=${d(row.ops, o.ops, 3)}`)
  console.log(`  得点圏 現=${d(row.risp_avg, o.risp, 3)}  (公式 ${o.risp_h}/${o.risp_ab})`)
  console.log()
}
