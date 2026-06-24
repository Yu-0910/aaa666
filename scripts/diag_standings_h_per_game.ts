/**
 * 試合別: スコア表「安」 vs battingLines 合算 vs stats行再推論
 *   npx tsx scripts/diag_standings_h_per_game.ts [巨人|DeNA]
 */
import { inferBattingLineFromStatsRow } from "@/lib/yahooGame/buildCanonical"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { rosterTeamToRankingShort } from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"

const root = process.cwd()
const year = "2026"
const league = "CL" as const
const targetTeam = process.argv[2] ?? "DeNA"

function sumLinesH(doc: CanonicalGameDocument, team: string): number {
  let h = 0
  for (const ln of doc.domain?.battingLines ?? []) {
    const bid = String(ln.yahooPlayerId ?? "").trim()
    if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
    h += ln.h ?? 0
  }
  return h
}

function sumInferFromLinkedRows(doc: CanonicalGameDocument, team: string): number {
  let h = 0
  for (const row of doc.game?.statsPlayerLinkedRows ?? []) {
    const bid = String(row.yahooPlayerId ?? "").trim()
    if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
    const line = inferBattingLineFromStatsRow(row)
    if (line?.h != null) h += line.h
  }
  return h
}

function scoreboardHitsForTeam(
  doc: CanonicalGameDocument,
  team: string,
  gameId: string,
): number | null {
  const board = loadScoreboardFromSportsnaviStatsRaw(root, gameId)
  if (!board) return null
  for (const row of board) {
    const short = rosterTeamToRankingShort(String(row.teamName ?? "").trim())
    if (short !== team) continue
    const raw = String(row.hits ?? "").trim()
    if (!raw || raw === "—" || raw === "-") return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
let totalLines = 0
let totalBoard = 0
let boardGames = 0
const mismatches: string[] = []
const deltas: { gameId: string; delta: number }[] = []

for (const doc of docs) {
  const gameId = String(doc.gameId ?? "").trim()
  const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, gameId) }
  if (!shouldIncludeStandingsGame(doc, year, league, opts)) continue

  const lineH = sumLinesH(doc, targetTeam)
  if (lineH === 0 && !opts.sportsnaviStatsScoreboard) continue

  const boardH = scoreboardHitsForTeam(doc, targetTeam, gameId)
  const linkedH = sumInferFromLinkedRows(doc, targetTeam)

  totalLines += lineH
  if (boardH != null) {
    totalBoard += boardH
    boardGames += 1
    deltas.push({ gameId, delta: lineH - boardH })
  }

  const parts: string[] = []
  if (boardH != null && boardH !== lineH) parts.push(`board=${boardH}≠lines=${lineH}`)
  if (linkedH !== lineH) parts.push(`linked=${linkedH}≠lines=${lineH}`)

  if (parts.length > 0) {
    mismatches.push(`${gameId}  lines=${lineH} linked=${linkedH} board=${boardH ?? "?"}  ${parts.join(" ")}`)
  }
}

console.log(`=== ${targetTeam} 試合別安打 (${boardGames}試合にスコア表安あり) ===\n`)
console.log(`合計 lines=${totalLines} board=${totalBoard}`)
console.log(`\n不一致 ${mismatches.length} 試合:\n`)
for (const m of mismatches) console.log(m)
console.log(`\nlines-board 差が大きい試合:`)
for (const d of deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10)) {
  console.log(`  ${d.gameId} Δ=${d.delta >= 0 ? "+" : ""}${d.delta}`)
}
