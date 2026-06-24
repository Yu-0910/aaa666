/** npx tsx scripts/diag_giants_h_gap.ts */
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const root = process.cwd()
const team = "巨人"
const docs = loadCanonicalGamesMergedForDerivedPipeline(root)

for (const doc of docs) {
  const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
  if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue
  let h = 0
  const lines = (doc.domain?.battingLines ?? []).filter((ln) => {
    const bid = String(ln.yahooPlayerId ?? "").trim()
    return bid && batterTeamShortInGame(doc, bid) === team
  })
  for (const ln of lines) h += ln.h ?? 0
  if (lines.length > 0 && h <= 4) {
    console.log(`${doc.gameId}: H=${h} lines=${lines.length} (低打撃試合)`)
  }
}

let total = 0
for (const doc of docs) {
  const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
  if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue
  for (const ln of doc.domain?.battingLines ?? []) {
    const bid = String(ln.yahooPlayerId ?? "").trim()
    if (bid && batterTeamShortInGame(doc, bid) === team) total += ln.h ?? 0
  }
}
console.log(`\n合計 H=${total} 公式478 差=${total - 478}`)
