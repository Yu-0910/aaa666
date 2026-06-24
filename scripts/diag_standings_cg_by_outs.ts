/**
 * チーム別: 投手1人のみ登板 & 投球回別の試合数（完投定義の手がかり）
 *   npx tsx scripts/diag_standings_cg_by_outs.ts
 */
import { mergePitchingLinesInGame, rosterTeamToRankingShort, teamNameForYahooInDoc } from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import { injectTeamsFromTextPbpIfMissing } from "@/lib/yahooGame/inferTeamsFromTextPbp"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { ipStringToOuts } from "@/lib/ranking/ipBaseball"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { inferPitcherTeamForNf3Line } from "@/lib/yahooGame/pitcherPocHelpers"

const root = process.cwd()
const OFFICIAL: Record<string, number> = { 巨人: 3, 阪神: 6, ヤクルト: 3, DeNA: 1, 広島: 3, 中日: 4 }

function teamShort(doc: ReturnType<typeof injectTeamsFromTextPbpIfMissing>, yid: string): string {
  const tn = teamNameForYahooInDoc(doc, yid)
  if (tn) return rosterTeamToRankingShort(tn)
  const inf = inferPitcherTeamForNf3Line(doc, yid)
  if (inf) return rosterTeamToRankingShort(inf)
  const r = findRosterPlayerByPublicId(yid)
  return r?.team ? rosterTeamToRankingShort(r.team) : ""
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)

for (const team of Object.keys(OFFICIAL)) {
  let cg27 = 0
  let cg24 = 0
  let solo21 = 0
  let solo24 = 0
  let solo27 = 0
  const soloGames: string[] = []

  for (const doc of docs) {
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
    if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue
    const enriched = injectTeamsFromTextPbpIfMissing(doc)
    const byId = new Map<string, Parameters<typeof mergePitchingLinesInGame>[0]>()
    for (const pl of enriched.domain?.pitchingLines ?? []) {
      const id = String(pl.yahooPlayerId ?? "").trim()
      if (!id) continue
      ;(byId.get(id) ?? byId.set(id, []).get(id)!).push(pl)
    }
    const entries: { outs: number; ip: string }[] = []
    for (const [pid, pls] of byId) {
      const m = mergePitchingLinesInGame(pls)
      if (!m) continue
      const outs = ipStringToOuts(m.ip)
      if (outs === 0 && (m.bf ?? 0) === 0) continue
      if (teamShort(enriched, pid) !== team) continue
      entries.push({ outs, ip: m.ip ?? "?" })
    }
    if (!entries.length) continue
    const max = Math.max(...entries.map((e) => e.outs))
    const solo = entries.length === 1
    if (max >= 27) cg27++
    if (max >= 24) cg24++
    if (solo && max >= 21) solo21++
    if (solo && max >= 24) solo24++
    if (solo && max >= 27) {
      solo27++
      soloGames.push(`${doc.gameId} ip=${entries[0]!.ip}`)
    }
  }
  console.log(
    `【${team}】公式CG=${OFFICIAL[team]} | outs≥27=${cg27} outs≥24=${cg24} | 1人のみ: ≥21=${solo21} ≥24=${solo24} ≥27=${solo27}`,
  )
}
