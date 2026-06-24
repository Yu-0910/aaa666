/**
 * 西武: 同一試合×投手の複数 pitchingLine で ER 二重計上がないか
 *   npx tsx scripts/diag_pl_seibu_dup_pitch_lines.ts
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
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { inferPitcherTeamForNf3Line } from "@/lib/yahooGame/pitcherPocHelpers"

const root = process.cwd()

function ts(doc: ReturnType<typeof injectTeamsFromTextPbpIfMissing>, yid: string): string {
  const tn = teamNameForYahooInDoc(doc, yid)
  if (tn) return rosterTeamToRankingShort(tn)
  const inf = inferPitcherTeamForNf3Line(doc, yid)
  if (inf) return rosterTeamToRankingShort(inf)
  const r = findRosterPlayerByPublicId(yid)
  return r?.team ? rosterTeamToRankingShort(r.team) : ""
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
let extraEr = 0

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
    if (pls.length < 2) continue
    if (ts(enriched, pid) !== "西武") continue
    const merged = mergePitchingLinesInGame(pls)
    const maxSingle = Math.max(...pls.map((p) => p.er ?? 0))
    const sumSingle = pls.reduce((s, p) => s + (p.er ?? 0), 0)
    if (sumSingle > maxSingle && (merged?.er ?? 0) === sumSingle) {
      const delta = sumSingle - maxSingle
      extraEr += delta
      console.log(
        `${doc.gameId} ${merged?.playerName} lines=${pls.length} er=${pls.map((p) => p.er).join("+")}=${sumSingle} (max=${maxSingle})`,
      )
    }
  }
}
console.log(`\n推定過剰ER=${extraEr}`)
