/**
 * 完投(CG)の数え方比較
 *   npx tsx scripts/diag_standings_cg.ts
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
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"

const root = process.cwd()
const OFFICIAL_CG: Record<string, number> = {
  巨人: 3, 阪神: 6, ヤクルト: 3, DeNA: 1, 広島: 3, 中日: 4,
}

function teamShort(doc: CanonicalGameDocument, yid: string): string {
  const tn = teamNameForYahooInDoc(doc, yid)
  if (tn) return rosterTeamToRankingShort(tn)
  const inf = inferPitcherTeamForNf3Line(doc, yid)
  if (inf) return rosterTeamToRankingShort(inf)
  const r = findRosterPlayerByPublicId(yid)
  return r?.team ? rosterTeamToRankingShort(r.team) : ""
}

type Entry = { pid: string; outs: number; name: string; order: number }

function gameEntries(doc: CanonicalGameDocument, team: string): Entry[] {
  const enriched = injectTeamsFromTextPbpIfMissing(doc)
  const byId = new Map<string, ReturnType<typeof mergePitchingLinesInGame>[]>()
  for (const pl of enriched.domain?.pitchingLines ?? []) {
    const id = String(pl.yahooPlayerId ?? "").trim()
    if (!id) continue
    const arr = byId.get(id) ?? []
    arr.push(pl)
    byId.set(id, arr)
  }
  const out: Entry[] = []
  let order = 0
  for (const [pid, pls] of byId) {
    const m = mergePitchingLinesInGame(pls)
    if (!m) continue
    const outs = ipStringToOuts(m.ip)
    if (outs === 0 && (m.bf ?? 0) === 0) continue
    if (teamShort(enriched, pid) !== team) continue
    out.push({ pid, outs, name: m.playerName ?? pid, order: order++ })
  }
  return out
}

function countCg(docs: ReturnType<typeof loadCanonicalGamesMergedForDerivedPipeline>, team: string, mode: "starter27" | "any27" | "maxIp27" | "lineFirst27") {
  let cg = 0
  const games: string[] = []
  for (const doc of docs) {
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
    if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue
    const enriched = injectTeamsFromTextPbpIfMissing(doc)
    const entries = gameEntries(doc, team)
    if (!entries.length) continue
    const gameId = String(doc.gameId ?? "").trim()
    const starters = collectStarterYahooIdByRankingShort(enriched)

    let cgPid = ""
    if (mode === "any27") {
      const e = entries.find((x) => x.outs >= 27)
      if (e) cgPid = e.pid
    } else if (mode === "maxIp27") {
      const max = Math.max(...entries.map((e) => e.outs))
      const e = entries.find((x) => x.outs === max && x.outs >= 27)
      if (e) cgPid = e.pid
    } else if (mode === "lineFirst27") {
      const e = [...entries].sort((a, b) => a.order - b.order).find((x) => x.outs >= 27)
      if (e) cgPid = e.pid
    } else {
      const sp = starters.get(team)
      const e = entries.find((x) => x.pid === sp && x.outs >= 27)
      if (e) cgPid = e.pid
    }
    if (cgPid) {
      cg++
      games.push(gameId)
    }
  }
  return { cg, games }
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
console.log("=== 完投(CG) 集計方式比較 ===\n")
for (const team of Object.keys(OFFICIAL_CG)) {
  const o = OFFICIAL_CG[team]!
  const s = countCg(docs, team, "starter27")
  const a = countCg(docs, team, "any27")
  const m = countCg(docs, team, "maxIp27")
  const l = countCg(docs, team, "lineFirst27")
  console.log(`【${team}】公式=${o}`)
  console.log(`  starter27=${s.cg}  any27=${a.cg}  maxIp27=${m.cg}  lineFirst27=${l.cg}`)
  if (o !== s.cg && a.cg === o) console.log(`  → any27 が一致`)
  if (o !== s.cg && m.cg === o) console.log(`  → maxIp27 が一致`)
  if (o !== s.cg && l.cg === o) console.log(`  → lineFirst27 が一致`)
  console.log()
}
