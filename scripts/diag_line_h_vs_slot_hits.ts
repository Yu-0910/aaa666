/**
 * battingLine.h vs 出場スロット文言から数えた安打の差（チーム合算）
 *   npx tsx scripts/diag_line_h_vs_slot_hits.ts DeNA
 */
import { hitBases, isAtBat } from "@/lib/yahooGame/resultJaHitBases"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const root = process.cwd()
const team = process.argv[2] ?? "DeNA"

// appearanceSlotsForBatterInDoc is not exported - inline copy
function slotsFor(doc: Parameters<typeof batterTeamShortInGame>[0], bid: string): string[] {
  const out: string[] = []
  for (const line of doc.domain?.battingLines ?? []) {
    if (String(line.yahooPlayerId ?? "").trim() !== bid) continue
    const s = line.appearancePaSlotsJa
    if (Array.isArray(s)) for (const x of s) out.push(String(x ?? "").trim())
  }
  if (out.length) return out
  for (const row of doc.game?.statsPlayerLinkedRows ?? []) {
    if (String(row.yahooPlayerId ?? "").trim() !== bid) continue
    const c = row.cells ?? []
    if (c.length > 14) return c.slice(14).map((x) => String(x ?? "").trim())
  }
  return []
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
let lineH = 0
let slotH = 0
const overs: string[] = []

for (const doc of docs) {
  const gameId = String(doc.gameId ?? "").trim()
  const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, gameId) }
  if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue

  for (const ln of doc.domain?.battingLines ?? []) {
    const bid = String(ln.yahooPlayerId ?? "").trim()
    if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
    const h = ln.h ?? 0
    lineH += h
    let sh = 0
    for (const t of slotsFor(doc, bid)) {
      if (!t) continue
      if (isAtBat(t) && hitBases(t) > 0) sh += 1
    }
    slotH += sh
    if (h > sh) overs.push(`${gameId} ${ln.playerName} line.h=${h} slotH=${sh}`)
  }
}

console.log(`【${team}】lineH=${lineH} slotH=${slotH} Δ=${lineH - slotH}`)
console.log(`line.h > slotH: ${overs.length} 件`)
for (const o of overs.slice(0, 15)) console.log(`  ${o}`)
