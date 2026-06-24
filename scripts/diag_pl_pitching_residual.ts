/** PL 残差深掘り: ロッテ生カウント・完投ギャップ npx tsx scripts/diag_pl_pitching_residual.ts */
import {
  mergePitchingLinesInGame,
  rosterTeamToRankingShort,
  teamNameForYahooInDoc,
} from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
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
const year = "2026"

function teamShort(doc: CanonicalGameDocument, yid: string): string {
  const tn = teamNameForYahooInDoc(doc, yid)
  if (tn) return rosterTeamToRankingShort(tn)
  const inf = inferPitcherTeamForNf3Line(doc, yid)
  if (inf) return rosterTeamToRankingShort(inf)
  const r = findRosterPlayerByPublicId(yid)
  return r?.team ? rosterTeamToRankingShort(r.team) : ""
}

function teamTotals(docs: CanonicalGameDocument[], team: string) {
  let er = 0, h = 0, bf = 0, ipOuts = 0, games = 0
  const perGame: { gameId: string; er: number; h: number; bf: number; pitchers: number }[] = []

  for (const doc of docs) {
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
    if (!shouldIncludeStandingsGame(doc, year, "PL", opts)) continue
    const enriched = injectTeamsFromTextPbpIfMissing(doc)
    const byId = new Map<string, NonNullable<typeof enriched.domain>["pitchingLines"]>()
    for (const pl of enriched.domain?.pitchingLines ?? []) {
      const id = String(pl.yahooPlayerId ?? "").trim()
      if (!id) continue
      ;(byId.get(id) ?? byId.set(id, []).get(id)!).push(pl)
    }
    let ger = 0, gh = 0, gbf = 0, pc = 0
    for (const [pid, pls] of byId) {
      const m = mergePitchingLinesInGame(pls)
      if (!m) continue
      const outs = ipStringToOuts(m.ip)
      if (outs === 0 && (m.bf ?? 0) === 0) continue
      if (teamShort(enriched, pid) !== team) continue
      ger += m.er ?? 0
      gh += m.h ?? 0
      gbf += m.bf ?? 0
      ipOuts += outs
      pc++
    }
    if (pc === 0) continue
    games++
    er += ger; h += gh; bf += gbf
    perGame.push({ gameId: String(doc.gameId ?? ""), er: ger, h: gh, bf: gbf, pitchers: pc })
  }
  return { er, h, bf, ipOuts, games, perGame }
}

function cgAnalysis(docs: CanonicalGameDocument[], team: string) {
  let cgStarter27 = 0, cgAny27 = 0
  const missing: string[] = []
  for (const doc of docs) {
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
    if (!shouldIncludeStandingsGame(doc, year, "PL", opts)) continue
    const enriched = injectTeamsFromTextPbpIfMissing(doc)
    const starters = collectStarterYahooIdByRankingShort(enriched)
    const byId = new Map<string, NonNullable<typeof enriched.domain>["pitchingLines"]>()
    for (const pl of enriched.domain?.pitchingLines ?? []) {
      const id = String(pl.yahooPlayerId ?? "").trim()
      if (!id) continue
      ;(byId.get(id) ?? byId.set(id, []).get(id)!).push(pl)
    }
    const entries: { pid: string; outs: number; name: string; isStarter: boolean }[] = []
    for (const [pid, pls] of byId) {
      const m = mergePitchingLinesInGame(pls)
      if (!m) continue
      const outs = ipStringToOuts(m.ip)
      if (outs === 0 && (m.bf ?? 0) === 0) continue
      if (teamShort(enriched, pid) !== team) continue
      entries.push({ pid, outs, name: m.playerName ?? pid, isStarter: starters.get(team) === pid })
    }
    if (entries.length === 0) continue
    const any27 = entries.filter((e) => e.outs >= 27)
    if (any27.length) cgAny27++
    const st27 = entries.find((e) => e.isStarter && e.outs >= 27)
    if (st27) cgStarter27++
    else if (any27.length) {
      missing.push(`${doc.gameId}: ${any27.map((e) => `${e.name} ${e.outs}outs st=${e.isStarter}`).join("; ")}`)
    }
  }
  return { cgStarter27, cgAny27, missing }
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)

console.log("=== ロッテ: 試合別 ER/H/BF（上位）===\n")
const lotte = teamTotals(docs, "ロッテ")
console.log(`合計 ER=${lotte.er} H=${lotte.h} BF=${lotte.bf} games=${lotte.games}`)
console.log("公式 ER=210 H=489 BF=2247\n")
for (const g of [...lotte.perGame].sort((a, b) => b.bf - a.bf).slice(0, 8)) {
  console.log(`  ${g.gameId}: ER=${g.er} H=${g.h} BF=${g.bf} pitchers=${g.pitchers}`)
}

console.log("\n=== 西武 ER+2 / 日本ハム CG 調査 ===\n")
const seibu = teamTotals(docs, "西武")
console.log(`西武 ER=${seibu.er} (公式158) H=${seibu.h} BF=${seibu.bf}`)

for (const team of ["西武", "日本ハム"] as const) {
  const officialCg = team === "西武" ? 6 : 7
  const { cgStarter27, cgAny27, missing } = cgAnalysis(docs, team)
  console.log(`\n${team}: CG starter27=${cgStarter27} any27=${cgAny27} 公式=${officialCg}`)
  if (missing.length) {
    console.log(`  27outsだが先発CGでない:`)
    for (const m of missing.slice(0, 3)) console.log(`    ${m}`)
  }
  if (cgAny27 > cgStarter27) {
    console.log(`  → ${cgAny27 - cgStarter27}試合は27outs投手がいるが先発判定でない`)
  }
  if (officialCg > cgStarter27 && cgAny27 <= cgStarter27) {
    console.log(`  → canonicalに27outsデータ自体が不足（公式より${officialCg - cgStarter27}本）`)
  }
}

console.log("\n=== 所属不明の投手行（PL全試合）===\n")
let unknownGames = 0, unknownLines = 0
for (const doc of docs) {
  const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
  if (!shouldIncludeStandingsGame(doc, year, "PL", opts)) continue
  const enriched = injectTeamsFromTextPbpIfMissing(doc)
  let ug = 0
  for (const pl of enriched.domain?.pitchingLines ?? []) {
    const id = String(pl.yahooPlayerId ?? "").trim()
    if (!id) continue
    const outs = ipStringToOuts(pl.ip)
    if (outs === 0 && (pl.bf ?? 0) === 0) continue
    if (!teamShort(enriched, id)) { unknownLines++; ug++ }
  }
  if (ug) unknownGames++
}
console.log(`所属不明行: ${unknownLines}件 / ${unknownGames}試合`)
