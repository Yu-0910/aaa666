/**
 * 西武: 試合別 ER 合算（+2 原因探索）
 *   npx tsx scripts/diag_pl_seibu_er_per_game.ts
 */
import {
  mergePitchingLinesInGame,
  rosterTeamToRankingShort,
  teamNameForYahooInDoc,
} from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import { injectTeamsFromTextPbpIfMissing } from "@/lib/yahooGame/inferTeamsFromTextPbp"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { getGameScoreSides, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
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

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
let totalEr = 0
const mismatches: string[] = []

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
  let gameEr = 0
  let pitcherCount = 0
  for (const [pid, pls] of byId) {
    const m = mergePitchingLinesInGame(pls)
    if (!m) continue
    if (ts(enriched, pid) !== team) continue
    if ((m.bf ?? 0) === 0 && !m.ip) continue
    gameEr += m.er ?? 0
    pitcherCount += 1
    if (pls.length > 1) {
      mismatches.push(`${doc.gameId} ${m.playerName} lines=${pls.length} er=${m.er}`)
    }
  }
  totalEr += gameEr
  const sides = getGameScoreSides(doc, opts)
  const allowed = sides?.find((s) => s.teamShort === team)
    ? sides.find((s) => s.teamShort !== team)?.runs
    : null
  if (allowed != null && gameEr !== allowed && Math.abs(gameEr - allowed) <= 3) {
    mismatches.push(`${doc.gameId} erSum=${gameEr} runsAllowed=${allowed} pitchers=${pitcherCount}`)
  }
}

console.log(`totalEr=${totalEr} (official 158)`)
console.log(`notes (${mismatches.length}):`)
for (const m of mismatches.slice(0, 20)) console.log(`  ${m}`)
