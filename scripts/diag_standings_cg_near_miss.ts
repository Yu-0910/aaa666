/**
 * 完投候補試合（投球回26アウト以上）の一覧
 *   npx tsx scripts/diag_standings_cg_near_miss.ts [巨人]
 */
import { mergePitchingLinesInGame, rosterTeamToRankingShort, teamNameForYahooInDoc } from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import { collectStarterYahooIdByRankingShort } from "@/lib/yahooGame/nf3PitcherMetricsFromCanonical"
import { injectTeamsFromTextPbpIfMissing } from "@/lib/yahooGame/inferTeamsFromTextPbp"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { ipStringToOuts } from "@/lib/ranking/ipBaseball"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { inferPitcherTeamForNf3Line } from "@/lib/yahooGame/pitcherPocHelpers"

const root = process.cwd()
const team = process.argv[2] ?? "巨人"

function teamShort(doc: ReturnType<typeof injectTeamsFromTextPbpIfMissing>, yid: string): string {
  const tn = teamNameForYahooInDoc(doc, yid)
  if (tn) return rosterTeamToRankingShort(tn)
  const inf = inferPitcherTeamForNf3Line(doc, yid)
  if (inf) return rosterTeamToRankingShort(inf)
  const r = findRosterPlayerByPublicId(yid)
  return r?.team ? rosterTeamToRankingShort(r.team) : ""
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
let cg27 = 0

for (const doc of docs) {
  const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
  if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue
  const enriched = injectTeamsFromTextPbpIfMissing(doc)
  const byId = new Map<string, Parameters<typeof mergePitchingLinesInGame>[0]>()
  for (const pl of enriched.domain?.pitchingLines ?? []) {
    const id = String(pl.yahooPlayerId ?? "").trim()
    if (!id) continue
    const arr = byId.get(id) ?? []
    arr.push(pl)
    byId.set(id, arr)
  }

  const entries: { pid: string; ip: string; outs: number; name: string; n: number }[] = []
  for (const [pid, pls] of byId) {
    const m = mergePitchingLinesInGame(pls)
    if (!m) continue
    const outs = ipStringToOuts(m.ip)
    if (outs === 0 && (m.bf ?? 0) === 0) continue
    if (teamShort(enriched, pid) !== team) continue
    entries.push({ pid, ip: m.ip ?? "?", outs, name: m.playerName ?? pid, n: pls.length })
  }
  if (!entries.length) continue

  const maxOuts = Math.max(...entries.map((e) => e.outs))
  const starters = collectStarterYahooIdByRankingShort(enriched)
  const sp = starters.get(team)
  const pitcherCount = entries.length

  if (maxOuts >= 26) {
    const cg = maxOuts >= 27
    if (cg) cg27++
    console.log(
      `${doc.gameId} pitchers=${pitcherCount} maxOuts=${maxOuts} CG=${cg ? "Y" : "N"} starter=${sp?.slice(-6)}`,
    )
    for (const e of entries) {
      const isSp = e.pid === sp
      console.log(`  ${isSp ? "*" : " "} ${e.name} ip=${e.ip} outs=${e.outs} lines=${e.n}`)
    }
  }
}
console.log(`\n${team} CG(27+)=${cg27}`)
