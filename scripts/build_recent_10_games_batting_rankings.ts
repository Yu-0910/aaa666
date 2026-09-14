import { existsSync, mkdirSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { buildRecentGamesBattingRankings, validRecentDate } from "../lib/ranking/buildRecentGamesBattingRankings"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { readScheduleDaySnapshot } from "../lib/probables/loadScheduleSnapshots"
import { findRosterPlayerByPublicId } from "../lib/npbRoster"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"
import { isRegularSeasonCanonicalGame } from "../lib/npbRegularSeason"
import { buildRecentGamesV2 } from "../lib/ranking/buildRecentGamesV2"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const v2 = args.includes("--v2")
let asOf = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" })
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--v2") continue
  else if (args[i] === "--as-of" && args[i + 1]) asOf = args[++i]
  else if (args[i] === "--year" && args[i + 1] === "2026") i++
  else throw new Error(`Unsupported argument: ${args[i]}`)
}
if (!validRecentDate(asOf)) throw new Error("--as-of must be a valid date in 2026")
console.log(`[recent-10] Loading merged canonical through ${asOf}`)
const docs = loadCanonicalGamesMergedForDerivedPipeline(root, { year: "2026", to: asOf })
if (!docs.length) throw new Error("No canonical input; existing output was not replaced")
const schedules = new Map<string, ReturnType<typeof readScheduleDaySnapshot>>()
const completedTeamGames: Array<{ gameId: string; gameDate: string; team: string }> = []
const scheduleDir = join(root, "_data/sportsnavi_schedule_snapshots/by_date")
for (const file of existsSync(scheduleDir) ? readdirSync(scheduleDir).sort() : []) {
  const date = file.replace(/\.json$/, "")
  if (!validRecentDate(date) || date > asOf) continue
  const snapshot = readScheduleDaySnapshot(root, date)
  schedules.set(date, snapshot)
  for (const game of snapshot?.games ?? []) {
    if (!isRegularSeasonCanonicalGame("2026", date, `${game.homeTeamShort} ${game.awayTeamShort}`)) continue
    if (/中止|ノーゲーム/.test(game.statusText ?? "")) continue
    if (game.gameState !== "completed" && !/試合終了/.test(game.statusText ?? "")) continue
    for (const team of [game.homeTeamShort, game.awayTeamShort]) if (team) completedTeamGames.push({ gameId: game.gameId, gameDate: date, team })
  }
}
const result = buildRecentGamesBattingRankings(docs, {
  asOf, generatedAt: new Date().toISOString(),
  completedTeamGames,
  scheduleStatus: (date, id) => {
    if (!schedules.has(date)) schedules.set(date, readScheduleDaySnapshot(root, date))
    const game = schedules.get(date)?.games?.find(g => g.gameId === id)
    return game?.statusText || game?.gameState || ""
  },
  npbId: id => findRosterPlayerByPublicId(id)?.npb_player_id ?? null,
  currentTeam: id => findRosterPlayerByPublicId(id)?.team ?? null,
})
const output = v2 ? buildRecentGamesV2(docs, result) : result
const auditPath = join(root, `_data/derived/recent_10_games_batting${v2 ? '_v2' : ''}/2026/audit.json`)
mkdirSync(dirname(auditPath), { recursive: true })
writeJsonFileWithRetrySync(auditPath, output.audit)
for (const league of ["CL", "PL"] as const) {
  const path = join(root, `public/data/rankings/${v2 ? 'recent-games-v2' : 'recent-games'}/2026/${league}/batting.json`)
  mkdirSync(dirname(path), { recursive: true })
  writeJsonFileWithRetrySync(path, output.snapshots[league])
  console.log(`[recent-10] ${league}: ${result.snapshots[league].rows.length} players`)
}
console.log(`[recent-10] ${result.audit.excluded.length} exclusions; audit: ${auditPath}`)
