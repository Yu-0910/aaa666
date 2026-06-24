/**
 * domain.battingLines vs statsPlayerLinkedRows 再推論の差
 *   npx tsx scripts/diag_lines_vs_linked_rows.ts
 */
import { inferBattingLineFromStatsRow } from "@/lib/yahooGame/buildCanonical"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const root = process.cwd()
const teams = ["巨人", "DeNA"] as const

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)

for (const team of teams) {
  let lineH = 0
  let linkedH = 0
  const gaps: string[] = []
  for (const doc of docs) {
    const gameId = String(doc.gameId ?? "").trim()
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, gameId) }
    if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue

    let gh = 0
    let gl = 0
    for (const ln of doc.domain?.battingLines ?? []) {
      const bid = String(ln.yahooPlayerId ?? "").trim()
      if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
      gh += ln.h ?? 0
    }
    for (const row of doc.game?.statsPlayerLinkedRows ?? []) {
      const bid = String(row.yahooPlayerId ?? "").trim()
      if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
      const inf = inferBattingLineFromStatsRow(row)
      if (inf?.h != null) gl += inf.h
    }
    lineH += gh
    linkedH += gl
    if (gh !== gl) gaps.push(`${gameId} lines=${gh} linked=${gl}`)
  }
  console.log(`\n【${team}】合計 lines=${lineH} linked=${linkedH} Δ=${lineH - linkedH}`)
  console.log(`不一致試合 ${gaps.length}`)
  for (const g of gaps.slice(0, 8)) console.log(`  ${g}`)
}
