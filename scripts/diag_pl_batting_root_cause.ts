/** PL打撃 根本原因診断 npx tsx scripts/diag_pl_batting_root_cause.ts */
import { readFileSync } from "fs"
import { join } from "path"
import { aggregateTeamStandingsByLeagueFromCanonical } from "@/lib/standings/aggregateTeamStandingsFromCanonical"
import { teamShortFromCode } from "@/lib/standings/teamCodes"
import {
  aggregateBattingForBatterInGameHybrid,
  aggregateBattingSeasonByYahooBatterFromAppearanceSlots,
  emptyBattingSeasonAggYahoo,
  mergeBattingSeasonAggYahoo,
  updateRispFromPasInGame,
} from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import { dedupePlateAppearancesByInningHalfOrder } from "@/lib/yahooGame/dedupePlateAppearances"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"

const root = process.cwd()
const year = "2026"
const league = "PL" as const

const OFFICIAL: Record<
  string,
  { avg: number; h: number; hr: number; d2: number; ops: number; risp: number; rispAb: number; ab: number }
> = {
  西武: { avg: 0.249, h: 541, hr: 50, d2: 89, ops: 0.677, risp: 0.268, rispAb: 497, ab: 2173 },
  ソフトバンク: { avg: 0.25, h: 516, hr: 67, d2: 95, ops: 0.725, risp: 0.266, rispAb: 488, ab: 2068 },
  日本ハム: { avg: 0.242, h: 523, hr: 74, d2: 79, ops: 0.703, risp: 0.271, rispAb: 468, ab: 2159 },
  オリックス: { avg: 0.244, h: 500, hr: 36, d2: 97, ops: 0.657, risp: 0.266, rispAb: 462, ab: 2048 },
  ロッテ: { avg: 0.236, h: 501, hr: 45, d2: 78, ops: 0.637, risp: 0.228, rispAb: 491, ab: 2121 },
  楽天: { avg: 0.237, h: 482, hr: 39, d2: 69, ops: 0.64, risp: 0.247, rispAb: 446, ab: 2034 },
}

function opts(doc: CanonicalGameDocument) {
  return { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
}

function teamBatting(
  docs: CanonicalGameDocument[],
  team: string,
  mode: "hybrid" | "slots" | "lines_only",
) {
  const bucket = emptyBattingSeasonAggYahoo()
  if (mode === "lines_only") {
    for (const doc of docs) {
      if (!shouldIncludeStandingsGame(doc, year, league, opts(doc))) continue
      for (const ln of doc.domain?.battingLines ?? []) {
        const bid = String(ln.yahooPlayerId ?? "").trim()
        if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
        bucket.h += ln.h ?? 0
        bucket.ab += ln.ab ?? 0
        bucket.h2 += ln.h2 ?? (ln as { doubles?: number }).doubles ?? 0
        bucket.hr += ln.hr ?? 0
      }
    }
    return bucket
  }
  if (mode === "slots") {
    const season = aggregateBattingSeasonByYahooBatterFromAppearanceSlots(docs)
    for (const [bid, agg] of season) {
      for (const doc of docs) {
        if (!shouldIncludeStandingsGame(doc, year, league, opts(doc))) continue
        if (batterTeamShortInGame(doc, bid) === team) {
          mergeBattingSeasonAggYahoo(bucket, agg)
          break
        }
      }
    }
    return bucket
  }
  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, year, league, opts(doc))) continue
    const bids = new Set<string>()
    for (const ln of doc.domain?.battingLines ?? []) {
      const bid = String(ln.yahooPlayerId ?? "").trim()
      if (bid) bids.add(bid)
    }
    for (const pa of doc.domain?.plateAppearances ?? []) {
      const bid = String(pa.yahooBatterId ?? "").trim()
      if (bid) bids.add(bid)
    }
    for (const bid of bids) {
      if (batterTeamShortInGame(doc, bid) !== team) continue
      const g = aggregateBattingForBatterInGameHybrid(doc, bid, { projectRoot: root, skipRisp: true })
      if (g) mergeBattingSeasonAggYahoo(bucket, g)
    }
  }
  return bucket
}

function rispTotals(docs: CanonicalGameDocument[], team: string) {
  let rispAb = 0
  let rispH = 0
  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, year, league, opts(doc))) continue
    const gameId = String(doc.gameId ?? "").trim()
    const pas = dedupePlateAppearancesByInningHalfOrder(doc.domain?.plateAppearances ?? [], gameId)
    const byBatter = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()
    updateRispFromPasInGame(byBatter, gameId, doc, pas, root)
    for (const [bid, r] of byBatter) {
      if (batterTeamShortInGame(doc, bid) !== team) continue
      rispAb += r.risp_ab
      rispH += r.risp_h
    }
  }
  return { rispAb, rispH, avg: rispAb > 0 ? rispH / rispAb : 0 }
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
const json = JSON.parse(readFileSync(join(root, "_data/derived/team_standings/2026/PL.json"), "utf8"))

console.log("=== PL打撃: 現状 vs 公式 ===\n")
for (const row of json.rows) {
  const t = teamShortFromCode(row.team)
  const o = OFFICIAL[t]
  if (!o) continue
  const d = (a: number | null | undefined, b: number, n = 0) =>
    a == null ? "—" : n === 0 ? `${a} (${a - b >= 0 ? "+" : ""}${a - b})` : `${a.toFixed(n)} (${(a - b) >= 0 ? "+" : ""}${(a - b).toFixed(n)})`
  console.log(`【${t}】`)
  console.log(`  安打   現=${d(row.h, o.h)} 公式=${o.h}`)
  console.log(`  打率   現=${d(row.avg, o.avg, 3)} 公式=${o.avg.toFixed(3)}`)
  console.log(`  二塁打 現=${d(row.doubles, o.d2)} 公式=${o.d2}`)
  console.log(`  OPS    現=${d(row.ops, o.ops, 3)} 公式=${o.ops.toFixed(3)}`)
  console.log(`  得点圏 現=${d(row.risp_avg, o.risp, 3)} 公式=${o.risp.toFixed(3)}`)
  console.log()
}

console.log("=== 集計方式比較 ===\n")
for (const team of Object.keys(OFFICIAL)) {
  const o = OFFICIAL[team]!
  const lines = teamBatting(docs, team, "lines_only")
  const hybrid = teamBatting(docs, team, "hybrid")
  const slots = teamBatting(docs, team, "slots")
  const risp = rispTotals(docs, team)
  const row = json.rows.find((r: { team: string }) => teamShortFromCode(r.team) === team)
  console.log(`【${team}】公式 H=${o.h} 2B=${o.d2} AB=${o.ab}`)
  console.log(`  lines:   H=${lines.h}(${lines.h - o.h >= 0 ? "+" : ""}${lines.h - o.h}) 2B=${lines.h2}(${lines.h2 - o.d2 >= 0 ? "+" : ""}${lines.h2 - o.d2}) AB=${lines.ab}`)
  console.log(`  hybrid:  H=${hybrid.h} 2B=${hybrid.h2} AB=${hybrid.ab} (JSON H=${row?.h})`)
  console.log(`  slots:   H=${slots.h} 2B=${slots.h2} AB=${slots.ab}`)
  console.log(`  RISP:    AB=${risp.rispAb}(${risp.rispAb - o.rispAb >= 0 ? "+" : ""}${risp.rispAb - o.rispAb}) AVG=${risp.avg.toFixed(3)} vs ${o.risp.toFixed(3)}`)
  console.log()
}

console.log("=== 原因分類 ===\n")
for (const team of Object.keys(OFFICIAL)) {
  const o = OFFICIAL[team]!
  const lines = teamBatting(docs, team, "lines_only")
  const hybrid = teamBatting(docs, team, "hybrid")
  const row = json.rows.find((r: { team: string }) => teamShortFromCode(r.team) === team)
  const dh = (row?.h ?? 0) - o.h
  let cause = ""
  if (dh === 0 && Math.abs((row?.doubles ?? 0) - o.d2) === 0) cause = "公式一致"
  else if (lines.h - o.h === dh) cause = "canonical出場成績行の合算が公式とズレ（データ取り込み）"
  else if (hybrid.h - o.h === dh && lines.h !== hybrid.h) cause = "hybridのPA補正が一部試合で差分"
  else cause = "複合要因"
  console.log(`${team}: ΔH=${dh >= 0 ? "+" : ""}${dh} Δ2B=${(row?.doubles ?? 0) - o.d2} linesΔH=${lines.h - o.h} → ${cause}`)
}

console.log("\n=== hybrid vs lines 不一致試合（ソフトバンク・西武）===\n")
for (const team of ["ソフトバンク", "西武"] as const) {
  let n = 0
  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, year, league, opts(doc))) continue
    let lh = 0, hh = 0
    const bids = new Set<string>()
    for (const ln of doc.domain?.battingLines ?? []) {
      const bid = String(ln.yahooPlayerId ?? "").trim()
      if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
      bids.add(bid)
      lh += ln.h ?? 0
    }
    for (const bid of bids) {
      const g = aggregateBattingForBatterInGameHybrid(doc, bid, { projectRoot: root, skipRisp: true })
      if (g) hh += g.h
    }
    if (lh !== hh) {
      n++
      if (n <= 5) console.log(`  ${team} ${doc.gameId}: linesH=${lh} hybridH=${hh} Δ=${hh - lh}`)
    }
  }
  console.log(`  ${team}: 不一致${n}試合`)
}
