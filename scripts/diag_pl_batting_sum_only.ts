/** PL打撃 高速診断 npx tsx scripts/diag_pl_batting_sum_only.ts */
import { readFileSync } from "fs"
import { join } from "path"
import { teamShortFromCode } from "@/lib/standings/teamCodes"
import {
  aggregateBattingForBatterInGameHybrid,
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
const opts = (d: CanonicalGameDocument) => ({
  sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, d.gameId),
})

const OFFICIAL: Record<string, { h: number; d2: number; ab: number; rispAb: number; risp: number }> = {
  西武: { h: 541, d2: 89, ab: 2173, rispAb: 497, risp: 0.268 },
  ソフトバンク: { h: 516, d2: 95, ab: 2068, rispAb: 488, risp: 0.266 },
  日本ハム: { h: 523, d2: 79, ab: 2159, rispAb: 468, risp: 0.271 },
  オリックス: { h: 500, d2: 97, ab: 2048, rispAb: 462, risp: 0.266 },
  ロッテ: { h: 501, d2: 78, ab: 2121, rispAb: 491, risp: 0.228 },
  楽天: { h: 482, d2: 69, ab: 2034, rispAb: 446, risp: 0.247 },
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
const json = JSON.parse(readFileSync(join(root, "_data/derived/team_standings/2026/PL.json"), "utf8"))

for (const team of Object.keys(OFFICIAL)) {
  const lines = emptyBattingSeasonAggYahoo()
  const hybrid = emptyBattingSeasonAggYahoo()
  let rispAb = 0, rispH = 0
  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, "2026", "PL", opts(doc))) continue
    const bids = new Set<string>()
    for (const ln of doc.domain?.battingLines ?? []) {
      const bid = String(ln.yahooPlayerId ?? "").trim()
      if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
      bids.add(bid)
      lines.h += ln.h ?? 0
      lines.ab += ln.ab ?? 0
      lines.h2 += ln.h2 ?? (ln as { doubles?: number }).doubles ?? 0
    }
    for (const bid of bids) {
      const g = aggregateBattingForBatterInGameHybrid(doc, bid, { projectRoot: root, skipRisp: true })
      if (g) mergeBattingSeasonAggYahoo(hybrid, g)
    }
    const pas = dedupePlateAppearancesByInningHalfOrder(doc.domain?.plateAppearances ?? [], String(doc.gameId ?? ""))
    const rb = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()
    updateRispFromPasInGame(rb, String(doc.gameId ?? ""), doc, pas, root)
    for (const [bid, r] of rb) {
      if (batterTeamShortInGame(doc, bid) !== team) continue
      rispAb += r.risp_ab
      rispH += r.risp_h
    }
  }
  const o = OFFICIAL[team]!
  const row = json.rows.find((r: { team: string }) => teamShortFromCode(r.team) === team)
  console.log(
    `${team}: lines H=${lines.h}(${lines.h - o.h >= 0 ? "+" : ""}${lines.h - o.h}) 2B=${lines.h2}(${lines.h2 - o.d2 >= 0 ? "+" : ""}${lines.h2 - o.d2}) AB=${lines.ab} | hybrid H=${hybrid.h} JSON=${row?.h} | RISP AB=${rispAb}(${rispAb - o.rispAb >= 0 ? "+" : ""}${rispAb - o.rispAb}) avg=${rispAb > 0 ? (rispH / rispAb).toFixed(3) : "—"}`,
  )
}

console.log("\n=== ソフトバンク: lines vs hybrid 試合別 ===")
const team = "ソフトバンク"
for (const doc of docs) {
  if (!shouldIncludeStandingsGame(doc, "2026", "PL", opts(doc))) continue
  let lh = 0, hh = 0, lh2 = 0, hh2 = 0
  const bids = new Set<string>()
  for (const ln of doc.domain?.battingLines ?? []) {
    const bid = String(ln.yahooPlayerId ?? "").trim()
    if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
    bids.add(bid)
    lh += ln.h ?? 0
    lh2 += ln.h2 ?? (ln as { doubles?: number }).doubles ?? 0
  }
  for (const bid of bids) {
    const g = aggregateBattingForBatterInGameHybrid(doc, bid, { projectRoot: root, skipRisp: true })
    if (g) { hh += g.h; hh2 += g.h2 }
  }
  if (lh !== hh || lh2 !== hh2) {
    console.log(`  ${doc.gameId}: lines H=${lh} h2=${lh2} | hybrid H=${hh} h2=${hh2}`)
  }
}

console.log("\n=== ソフトバンク: lines合算 vs 公式の差分試合（H欠損候補）===")
let totalGap = 0
for (const doc of docs) {
  if (!shouldIncludeStandingsGame(doc, "2026", "PL", opts(doc))) continue
  let lh = 0
  for (const ln of doc.domain?.battingLines ?? []) {
    const bid = String(ln.yahooPlayerId ?? "").trim()
    if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
    lh += ln.h ?? 0
  }
  // can't compare per-game to official - just show if any line has suspicious zero
}
// Show total
const o = OFFICIAL[team]!
let sum = 0
for (const doc of docs) {
  if (!shouldIncludeStandingsGame(doc, "2026", "PL", opts(doc))) continue
  for (const ln of doc.domain?.battingLines ?? []) {
    const bid = String(ln.yahooPlayerId ?? "").trim()
    if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
    sum += ln.h ?? 0
  }
}
console.log(`  lines合算 H=${sum} 公式=${o.h} 差=${sum - o.h}`)
if (sum === o.h - 1) console.log("  → canonical出場成績行が公式より1本少ない（集計ロジックは一致）")
