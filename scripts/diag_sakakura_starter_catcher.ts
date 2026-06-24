/**
 * 坂倉将吾の捕手出場（スタメン/途中）を canonical から再集計する診断スクリプト。
 * npx tsx scripts/diag_sakakura_starter_catcher.ts
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import { mergePhase10RestoredIntoDocIfPresent } from "@/lib/seasonStatsPilot"
import { injectTeamsFromTextPbpIfMissing } from "@/lib/yahooGame/inferTeamsFromTextPbp"
import {
  getStartingCatcherForTeam,
  teamsRoughlyMatch,
} from "@/lib/yahooGame/startingCatcherFromCanonical"
import { catcherYahooIdsFromCanonical } from "@/lib/catcherAppearances"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"
import { parseGameDateYmdFromCanonical } from "@/lib/yahooGame/gameDateFromCanonical"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { getGameScoreSides } from "@/lib/standings/leagueGameFilter"

const NPB = "11915134"
const YAHOO = "1600124"

function isHiroshimaTeam(name: string): boolean {
  const t = name.trim()
  return teamsRoughlyMatch(t, "広島") || teamsRoughlyMatch(t, "広島東洋カープ")
}

function readDoc(root: string, gameId: string) {
  const p = path.join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
  if (!fs.existsSync(p)) return null
  const j = JSON.parse(fs.readFileSync(p, "utf8"))
  if (!j?.gameId) return null
  return injectTeamsFromTextPbpIfMissing(mergePhase10RestoredIntoDocIfPresent(j))
}

function main() {
  const root = getProjectRoot()
  const dir = path.join(root, "_data", "scraped_games", "canonical")
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))

  const hiroGames: Array<{ gameId: string; date: string; starter: string }> = []
  const sakakuraStarter: Array<{ gameId: string; date: string }> = []
  const sakakuraAny: Array<{ gameId: string; date: string; starter: boolean }> = []

  for (const f of files) {
    const doc = readDoc(root, f.replace(/\.json$/, ""))
    if (!doc) continue

    const date = parseGameDateYmdFromCanonical(doc) ?? ""
    const yids = catcherYahooIdsFromCanonical(doc)
    const isAny = [...yids].some((y) => resolveNpbPlayerIdFromPublicId(y) === NPB || y === YAHOO)

    let isStarter = false
    for (const t of doc.game.teams ?? []) {
      const team = (t.teamName ?? "").trim()
      if (!isHiroshimaTeam(team)) continue
      const cat = getStartingCatcherForTeam(doc, team)
      const label = cat ? `${cat.playerName}|${cat.yahooPlayerId}` : "—"
      hiroGames.push({ gameId: doc.gameId, date, starter: label })
      if (cat && (cat.yahooPlayerId === YAHOO || resolveNpbPlayerIdFromPublicId(cat.yahooPlayerId) === NPB)) {
        isStarter = true
        sakakuraStarter.push({ gameId: doc.gameId, date })
      }
    }
    if (isAny) sakakuraAny.push({ gameId: doc.gameId, date, starter: isStarter })
  }

  hiroGames.sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId))
  sakakuraStarter.sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId))
  sakakuraAny.sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId))

  const appearancesPath = path.join(
    root,
    "_data",
    "derived",
    "player_catcher_appearances",
    "2026",
    `npb_${NPB}.json`,
  )
  const summaryPath = path.join(
    root,
    "_data",
    "derived",
    "player_catcher_starting_summary",
    "2026",
    `npb_${NPB}.json`,
  )
  const appearances = fs.existsSync(appearancesPath)
    ? (JSON.parse(fs.readFileSync(appearancesPath, "utf8")) as { gamesAsCatcher: number })
    : null
  const summary = fs.existsSync(summaryPath)
    ? (JSON.parse(fs.readFileSync(summaryPath, "utf8")) as {
        starts: number
        teamWins: number
        teamLosses: number
      })
    : null

  let wins = 0
  let losses = 0
  for (const g of sakakuraStarter) {
    const doc = readDoc(root, g.gameId)
    if (!doc) continue
    const sides = getGameScoreSides(doc, {
      sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, g.gameId),
    })
    if (!sides) continue
    const h = sides.find((s) => s.teamShort === "広島")
    const o = sides.find((s) => s.teamShort !== "広島")
    if (!h || !o) continue
    if (h.runs > o.runs) wins += 1
    else if (h.runs < o.runs) losses += 1
  }

  const subOnly = sakakuraAny.filter((g) => !g.starter)

  const byStarter = new Map<string, number>()
  for (const g of hiroGames) {
    byStarter.set(g.starter, (byStarter.get(g.starter) ?? 0) + 1)
  }

  console.log("=== 坂倉将吾 捕手出場 再調査 ===")
  console.log(`canonical 試合数: ${files.length}`)
  console.log(`広島試合数: ${hiroGames.length}`)
  console.log(`捕手出場（途中含む）: ${sakakuraAny.length}`)
  console.log(`スタメン捕手: ${sakakuraStarter.length}`)
  console.log(`途中出場のみ: ${subOnly.length}`)
  console.log(`スタメン試合 勝敗: ${wins}勝 ${losses}敗`)
  if (appearances) console.log(`phase22 derived 試合: ${appearances.gamesAsCatcher}`)
  if (summary) {
    console.log(
      `phase25 derived: starts=${summary.starts} wins=${summary.teamWins} losses=${summary.teamLosses}`,
    )
  }
  console.log("広島スタメン捕手内訳:")
  for (const [k, v] of [...byStarter.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`)
  }
  if (subOnly.length) {
    console.log("途中出場のみ（日付順）:")
    for (const g of subOnly) console.log(`  ${g.date} ${g.gameId}`)
  }
}

main()
