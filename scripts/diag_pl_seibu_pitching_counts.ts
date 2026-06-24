/**
 * PL 西武 投手生カウント vs 公式
 *   npx tsx scripts/diag_pl_seibu_pitching_counts.ts
 */
import {
  mergePitchingLinesInGame,
  rosterTeamToRankingShort,
  teamNameForYahooInDoc,
} from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import { injectTeamsFromTextPbpIfMissing } from "@/lib/yahooGame/inferTeamsFromTextPbp"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { ipStringToOuts } from "@/lib/ranking/ipBaseball"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { inferPitcherTeamForNf3Line } from "@/lib/yahooGame/pitcherPocHelpers"

const root = process.cwd()
const team = "西武"

function ts(doc: ReturnType<typeof injectTeamsFromTextPbpIfMissing>, yid: string): string {
  const tn = teamNameForYahooInDoc(doc, yid)
  if (tn) return rosterTeamToRankingShort(tn)
  const inf = inferPitcherTeamForNf3Line(doc, yid)
  if (inf) return rosterTeamToRankingShort(inf)
  const r = findRosterPlayerByPublicId(yid)
  return r?.team ? rosterTeamToRankingShort(r.team) : ""
}

let er = 0, h = 0, so = 0, bf = 0, ipOuts = 0
const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
for (const doc of docs) {
  const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
  if (!shouldIncludeStandingsGame(doc, "2026", "PL", opts)) continue
  const enriched = injectTeamsFromTextPbpIfMissing(doc)
  const byId = new Map<string, Parameters<typeof mergePitchingLinesInGame>[0]>()
  for (const pl of enriched.domain?.pitchingLines ?? []) {
    const id = String(pl.yahooPlayerId ?? "").trim()
    if (!id) continue
    ;(byId.get(id) ?? byId.set(id, []).get(id)!).push(pl)
  }
  for (const [pid, pls] of byId) {
    const m = mergePitchingLinesInGame(pls)
    if (!m) continue
    const outs = ipStringToOuts(m.ip)
    if (outs === 0 && (m.bf ?? 0) === 0) continue
    if (ts(enriched, pid) !== team) continue
    er += m.er ?? 0
    h += m.h ?? 0
    so += m.so ?? 0
    bf += m.bf ?? 0
    ipOuts += outs
  }
}

const era = (er * 27) / ipOuts
const ipStr = `${Math.floor(ipOuts / 3)} ${ipOuts % 3}/3`
console.log({
  er,
  erOfficial: 158,
  h,
  hOfficial: 443,
  so,
  soOfficial: 508,
  bf,
  bfOfficial: 2354,
  ipOuts,
  ipStr,
  ipOfficial: "591 2/3",
  era: era.toFixed(3),
  eraOfficial: 2.4,
})
