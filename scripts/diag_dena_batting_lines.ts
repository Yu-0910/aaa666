/** npx tsx scripts/diag_dena_batting_lines.ts */
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const root = process.cwd()
const team = "DeNA"
const docs = loadCanonicalGamesMergedForDerivedPipeline(root)

let totalH = 0
let totalH2 = 0
const dupGames: string[] = []
const highH: { gameId: string; h: number; lines: number }[] = []

for (const doc of docs) {
  const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
  if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue

  const byPlayer = new Map<string, { h: number; h2: number; n: number; name: string }>()
  let gameH = 0
  for (const ln of doc.domain?.battingLines ?? []) {
    const bid = String(ln.yahooPlayerId ?? "").trim()
    if (!bid || batterTeamShortInGame(doc, bid) !== team) continue
    const h = ln.h ?? 0
    const h2 = ln.h2 ?? (ln as { doubles?: number }).doubles ?? 0
    gameH += h
    totalH += h
    totalH2 += h2
    const prev = byPlayer.get(bid) ?? { h: 0, h2: 0, n: 0, name: ln.playerName ?? bid }
    byPlayer.set(bid, { h: prev.h + h, h2: prev.h2 + h2, n: prev.n + 1, name: prev.name })
  }
  for (const [bid, v] of byPlayer) {
    if (v.n > 1) dupGames.push(`${doc.gameId} ${v.name} x${v.n} H=${v.h}`)
  }
  if (gameH >= 14) highH.push({ gameId: String(doc.gameId), h: gameH, lines: byPlayer.size })
}

console.log(`DeNA lines合算 H=${totalH} h2=${totalH2} 公式 H=521 h2=94`)
console.log(`\n同一選手複数行 (${dupGames.length}):`)
for (const d of dupGames.slice(0, 15)) console.log(" ", d)
if (dupGames.length > 15) console.log(`  ...他${dupGames.length - 15}`)

console.log("\n高得点試合 (H>=14):")
for (const g of highH.sort((a, b) => b.h - a.h).slice(0, 8)) {
  console.log(`  ${g.gameId}: H=${g.h} players=${g.lines}`)
}
