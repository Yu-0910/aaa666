/**
 * セ・リーグ打撃 — 公式値との差分と根本原因診断
 *   npx tsx scripts/diag_cl_batting_root_cause.ts
 */
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
  type BattingSeasonAggYahoo,
} from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import { dedupePlateAppearancesByInningHalfOrder } from "@/lib/yahooGame/dedupePlateAppearances"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"

const root = process.cwd()
const year = "2026"
const league = "CL" as const

/** ユーザー提示スポナビ公式（2026 CL） */
const OFFICIAL: Record<
  string,
  { avg: number; h: number; hr: number; d2: number; d3: number; ops: number; risp: number; ab: number; pa: number }
> = {
  巨人: { avg: 0.228, h: 472, hr: 51, d2: 79, d3: 7, ops: 0.63, risp: 0.242, ab: 2066, pa: 2264 },
  阪神: { avg: 0.248, h: 494, hr: 45, d2: 85, d3: 8, ops: 0.686, risp: 0.274, ab: 1992, pa: 2269 },
  ヤクルト: { avg: 0.235, h: 493, hr: 38, d2: 84, d3: 7, ops: 0.631, risp: 0.253, ab: 2095, pa: 2295 },
  DeNA: { avg: 0.244, h: 510, hr: 36, d2: 93, d3: 1, ops: 0.649, risp: 0.29, ab: 2092, pa: 2322 },
  広島: { avg: 0.214, h: 426, hr: 37, d2: 67, d3: 9, ops: 0.59, risp: 0.231, ab: 1987, pa: 2217 },
  中日: { avg: 0.232, h: 480, hr: 44, d2: 72, d3: 9, ops: 0.64, risp: 0.24, ab: 2067, pa: 2334 },
}

function scoreOpts(doc: CanonicalGameDocument) {
  return { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
}

function sumBattingLinesOnly(docs: CanonicalGameDocument[], teamShort: string): BattingSeasonAggYahoo {
  const bucket = emptyBattingSeasonAggYahoo()
  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, year, league, scoreOpts(doc))) continue
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = String(line.yahooPlayerId ?? "").trim()
      if (!bid || batterTeamShortInGame(doc, bid) !== teamShort) continue
      bucket.ab += line.ab ?? 0
      bucket.h += line.h ?? 0
      bucket.h2 += line.doubles ?? line.h2 ?? 0
      bucket.h3 += line.triples ?? line.h3 ?? 0
      bucket.hr += line.hr ?? 0
      bucket.bb += line.bb ?? 0
      bucket.so += line.so ?? 0
      bucket.hbp += line.hbp ?? 0
      bucket.pa += line.pa ?? 0
    }
  }
  return bucket
}

function teamBattingByMode(
  docs: CanonicalGameDocument[],
  teamShort: string,
  mode: "hybrid" | "slots" | "lines_only",
): BattingSeasonAggYahoo & { risp_avg: number | null } {
  const bucket = emptyBattingSeasonAggYahoo()

  if (mode === "lines_only") {
    return { ...sumBattingLinesOnly(docs, teamShort), risp_avg: null }
  }

  if (mode === "slots") {
    const season = aggregateBattingSeasonByYahooBatterFromAppearanceSlots(docs)
    for (const [bid, agg] of season) {
      for (const doc of docs) {
        if (!shouldIncludeStandingsGame(doc, year, league, scoreOpts(doc))) continue
        if (batterTeamShortInGame(doc, bid) === teamShort) {
          mergeBattingSeasonAggYahoo(bucket, agg)
          break
        }
      }
    }
  } else {
    const bids = new Set<string>()
    for (const doc of docs) {
      if (!shouldIncludeStandingsGame(doc, year, league, scoreOpts(doc))) continue
      for (const line of doc.domain?.battingLines ?? []) {
        const bid = String(line.yahooPlayerId ?? "").trim()
        if (bid) bids.add(bid)
      }
      for (const pa of doc.domain?.plateAppearances ?? []) {
        const bid = String(pa.yahooBatterId ?? "").trim()
        if (bid) bids.add(bid)
      }
    }
    for (const doc of docs) {
      if (!shouldIncludeStandingsGame(doc, year, league, scoreOpts(doc))) continue
      for (const bid of bids) {
        if (batterTeamShortInGame(doc, bid) !== teamShort) continue
        const g = aggregateBattingForBatterInGameHybrid(doc, bid, { projectRoot: root, skipRisp: true })
        if (g) mergeBattingSeasonAggYahoo(bucket, g)
      }
    }
  }

  let rispAb = 0
  let rispH = 0
  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, year, league, scoreOpts(doc))) continue
    const gameId = String(doc.gameId ?? "").trim()
    const pas = dedupePlateAppearancesByInningHalfOrder(doc.domain?.plateAppearances ?? [], gameId)
    const rispByBatter = new Map<string, BattingSeasonAggYahoo>()
    updateRispFromPasInGame(rispByBatter, gameId, doc, pas, root)
    for (const [bid, r] of rispByBatter) {
      if (batterTeamShortInGame(doc, bid) !== teamShort) continue
      rispAb += r.risp_ab
      rispH += r.risp_h
    }
  }

  return { ...bucket, risp_avg: rispAb > 0 ? rispH / rispAb : null }
}

function findGameHGap(
  docs: CanonicalGameDocument[],
  teamShort: string,
  mode: "hybrid" | "lines_only",
): { gameId: string; h: number; deltaVsLines: number }[] {
  const gaps: { gameId: string; h: number; deltaVsLines: number }[] = []
  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, year, league, scoreOpts(doc))) continue
    let hHybrid = 0
    let hLines = 0
    const bids = new Set<string>()
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = String(line.yahooPlayerId ?? "").trim()
      if (bid && batterTeamShortInGame(doc, bid) === teamShort) {
        bids.add(bid)
        hLines += line.h ?? 0
      }
    }
    for (const bid of bids) {
      if (mode === "hybrid") {
        const g = aggregateBattingForBatterInGameHybrid(doc, bid, { projectRoot: root, skipRisp: true })
        if (g) hHybrid += g.h
      }
    }
    if (mode === "lines_only") hHybrid = hLines
    const delta = hHybrid - hLines
    if (delta !== 0) gaps.push({ gameId: String(doc.gameId ?? ""), h: hHybrid, deltaVsLines: delta })
  }
  return gaps
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
const standings = aggregateTeamStandingsByLeagueFromCanonical(docs, year, { projectRoot: root })
const clJson = JSON.parse(readFileSync(join(root, "_data/derived/team_standings/2026/CL.json"), "utf8"))

console.log("=== CL打撃: 現状 vs 公式 ===\n")
for (const row of clJson.rows) {
  const team = teamShortFromCode(row.team)
  const o = OFFICIAL[team === "横浜" ? "DeNA" : team]
  if (!o) continue
  const d = (a: number | null | undefined, b: number, n = 0) =>
    a == null ? "—" : n === 0 ? `${a} (${a - b >= 0 ? "+" : ""}${a - b})` : `${a.toFixed(n)} (${(a - b) >= 0 ? "+" : ""}${(a - b).toFixed(n)})`
  console.log(`【${team}】`)
  console.log(`  安打   現=${d(row.h, o.h)} 公式=${o.h}`)
  console.log(`  打率   現=${d(row.avg, o.avg, 3)} 公式=${o.avg.toFixed(3)}`)
  console.log(`  二塁打 現=${d(row.doubles, o.d2)} 公式=${o.d2}`)
  console.log(`  OPS    現=${d(row.ops, o.ops, 3)} 公式=${o.ops.toFixed(3)}`)
  console.log(`  得点圏 現=${d(row.risp_avg, o.risp, 3)} 公式=${o.risp.toFixed(3)}`)
  console.log()
}

console.log("=== 集計方式比較（安打・打数）===\n")
for (const team of Object.keys(OFFICIAL)) {
  const o = OFFICIAL[team]!
  const lines = teamBattingByMode(docs, team, "lines_only")
  const hybrid = teamBattingByMode(docs, team, "hybrid")
  const slots = teamBattingByMode(docs, team, "slots")
  const row = standings.CL.find((r) => teamShortFromCode(r.team) === team)
  console.log(`【${team}】公式H=${o.h} AB=${o.ab}`)
  console.log(`  battingLines合算:  H=${lines.h} AB=${lines.ab} ΔH=${lines.h - o.h}`)
  console.log(`  hybrid(順位表):    H=${hybrid.h} AB=${hybrid.ab} ΔH=${hybrid.h - o.h} RISP=${hybrid.risp_avg?.toFixed(3) ?? "—"}`)
  console.log(`  appearance_slots:  H=${slots.h} AB=${slots.ab} ΔH=${slots.h - o.h}`)
  console.log(`  JSON:              H=${row?.h} AB≈${row ? "—" : "—"}`)
  console.log()
}

console.log("=== hybrid vs battingLines の不一致試合（安打差≠0）===\n")
for (const team of Object.keys(OFFICIAL)) {
  const gaps = findGameHGap(docs, team, "hybrid")
  const totalDelta = gaps.reduce((s, g) => s + g.deltaVsLines, 0)
  console.log(`【${team}】不一致${gaps.length}試合 合計ΔH=${totalDelta}`)
  for (const g of gaps.slice(0, 5)) {
    console.log(`  gameId=${g.gameId} hybridH=${g.h} ΔvsLines=${g.deltaVsLines >= 0 ? "+" : ""}${g.deltaVsLines}`)
  }
  if (gaps.length > 5) console.log(`  ...他${gaps.length - 5}試合`)
  console.log()
}

console.log("=== 公式との差が残る球団 — 原因分類 ===\n")
for (const team of Object.keys(OFFICIAL)) {
  const o = OFFICIAL[team]!
  const lines = sumBattingLinesOnly(docs, team)
  const hybrid = teamBattingByMode(docs, team, "hybrid")
  const row = standings.CL.find((r) => teamShortFromCode(r.team) === team)
  const dh = (row?.h ?? 0) - o.h
  const linesDh = lines.h - o.h
  const hybridDh = hybrid.h - o.h

  let cause = ""
  if (dh === 0) cause = "公式一致"
  else if (linesDh === dh) cause = "canonical出場成績行の合算が公式とズレ（データ取り込み）"
  else if (hybridDh === dh && linesDh !== hybridDh)
    cause = "ハイブリッドが出場成績行とPAの合成でズレ（ロジック）"
  else if (hybridDh !== dh) cause = "順位表パイプラインと診断集計の差（要調査）"
  else cause = "複合要因"

  console.log(`${team}: ΔH=${dh >= 0 ? "+" : ""}${dh} | linesΔ=${linesDh} hybridΔ=${hybridDh} → ${cause}`)
}
