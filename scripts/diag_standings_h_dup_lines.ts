/**
 * DeNA/巨人: 試合内 battingLines の重複・チーム誤帰属を検出
 *   npx tsx scripts/diag_standings_h_dup_lines.ts
 */
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { teamForYahooPlayerId } from "@/lib/yahooGame/pitcherPocHelpers"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const root = process.cwd()
const teams = ["DeNA", "巨人"] as const

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)

for (const team of teams) {
  let multiRowPlayers = 0
  let multiRowExtraH = 0
  let wrongTeamH = 0
  const wrongTeamSamples: string[] = []

  for (const doc of docs) {
    const gameId = String(doc.gameId ?? "").trim()
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, gameId) }
    if (!shouldIncludeStandingsGame(doc, "2026", "CL", opts)) continue

    const byPlayer = new Map<string, { rows: number; h: number; names: string[] }>()
    for (const ln of doc.domain?.battingLines ?? []) {
      const bid = String(ln.yahooPlayerId ?? "").trim()
      if (!bid) continue
      const teamShort = batterTeamShortInGame(doc, bid)
      const lineupTeam = teamForYahooPlayerId(doc, bid)
      const h = ln.h ?? 0

      if (teamShort === team) {
        const cur = byPlayer.get(bid) ?? { rows: 0, h: 0, names: [] }
        cur.rows += 1
        cur.h += h
        const nm = String(ln.playerName ?? "").trim()
        if (nm && !cur.names.includes(nm)) cur.names.push(nm)
        byPlayer.set(bid, cur)
      }

      if (teamShort === team && lineupTeam && team !== lineupTeam) {
        wrongTeamH += h
        if (wrongTeamSamples.length < 10) {
          wrongTeamSamples.push(`${gameId} ${bid} lineup=${lineupTeam} counted=${team} h=${h}`)
        }
      }
    }

    for (const [bid, info] of byPlayer) {
      if (info.rows > 1) {
        multiRowPlayers += 1
        multiRowExtraH += info.h
      }
    }
  }

  console.log(`\n=== ${team} ===`)
  console.log(`同一試合内で複数 battingLine を持つ打者エントリ数: ${multiRowPlayers}`)
  console.log(`（複数行打者の H 合計・参考）: ${multiRowExtraH}`)
  console.log(`lineup と batterTeamShort 不一致で ${team} に計上した H: ${wrongTeamH}`)
  for (const s of wrongTeamSamples) console.log(`  ${s}`)
}
