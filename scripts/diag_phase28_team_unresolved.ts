/**
 * Phase 28 の `cellTeamUnresolvedPas` がゼロにならない原因を調査するための診断スクリプト。
 * 各 batter の reconciliation を見て、teamUnresolved>0 の batter を抽出し、
 * その canonical の scoreboard / teams / textPlayByPlay 状況を表示する。
 */
import { existsSync, readFileSync, readdirSync } from "fs"
import { join } from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import { loadCanonicalGames } from "@/lib/yahooGame/loadCanonicalGames"
import {
  injectTeamsFromTextPbpIfMissing,
  parsePregameInfoFromTextPbp,
} from "@/lib/yahooGame/inferTeamsFromTextPbp"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"

const root = getProjectRoot()
const splitsDir = join(root, "_data", "derived", "player_season_batting_splits", "2026")

interface Recon {
  cellTeamUnresolvedPas?: number
  appliedDelta?: { pa?: number }
}

const offending: Array<{ bid: string; teamUnresolvedPas: number }> = []
for (const f of readdirSync(splitsDir)) {
  if (!f.startsWith("yahoo_") || !f.endsWith(".json")) continue
  const bid = f.replace(/^yahoo_/, "").replace(/\.json$/, "")
  const obj = JSON.parse(readFileSync(join(splitsDir, f), "utf8")) as { reconciliation?: Recon }
  const v = Number(obj.reconciliation?.cellTeamUnresolvedPas ?? 0)
  if (v > 0) offending.push({ bid, teamUnresolvedPas: v })
}
offending.sort((a, b) => b.teamUnresolvedPas - a.teamUnresolvedPas)
console.log(`[diag] batters with teamUnresolvedPas>0: ${offending.length}`)
const top = offending.slice(0, 5)
for (const o of top) {
  console.log(`  yahoo_${o.bid} = ${o.teamUnresolvedPas}`)
}

if (offending.length === 0) process.exit(0)

const targetBid = top[0]!.bid
console.log(`\n[diag] inspecting yahoo_${targetBid}…`)
const docs = loadCanonicalGames(root)
console.log(`[diag] total canonical docs: ${docs.length}`)

let scanned = 0
let scoreboardEmptyAfterInject = 0
let teamsEmptyAfterInject = 0
let preParseFailed = 0
let rosterFallbackUsed = 0
const sampleFailedGames: string[] = []
for (const d of docs) {
  scanned += 1
  const before = d.game?.scoreboard?.length ?? 0
  const pre = parsePregameInfoFromTextPbp(d)
  if (!pre || !pre.visitorFullName || !pre.homeFullName) {
    preParseFailed += 1
    if (sampleFailedGames.length < 3) sampleFailedGames.push(String(d.gameId ?? ""))
  }
  const inj = injectTeamsFromTextPbpIfMissing(d)
  const sbLen = inj.game?.scoreboard?.length ?? 0
  const teamsLen = inj.game?.teams?.length ?? 0
  if (sbLen < 2) scoreboardEmptyAfterInject += 1
  if (teamsLen < 2) teamsEmptyAfterInject += 1
  if (sbLen >= 2 && before < 2 && (!pre || !pre.visitorFullName)) rosterFallbackUsed += 1
}
console.log(`  scanned                       = ${scanned}`)
console.log(`  preParseFailed                = ${preParseFailed}`)
console.log(`  scoreboardEmptyAfterInject    = ${scoreboardEmptyAfterInject}`)
console.log(`  teamsEmptyAfterInject         = ${teamsEmptyAfterInject}`)
console.log(`  rosterFallbackUsed            = ${rosterFallbackUsed}`)
if (sampleFailedGames.length > 0) {
  console.log(`  sample preParseFailed games:`)
  for (const g of sampleFailedGames) console.log(`    ${g}`)
}

const rosterRow = findRosterPlayerByPublicId(targetBid)
console.log(`\n[diag] target batter roster: team='${rosterRow?.team ?? ""}', name='${rosterRow?.name_ja ?? ""}'`)

// 試合 1 つピックして詳細を出す
const g0 = docs[0]
if (g0) {
  console.log(`\n[diag] sample doc gameId=${g0.gameId}`)
  console.log(`  raw scoreboard.length=${g0.game?.scoreboard?.length ?? 0}`)
  console.log(`  raw teams.length=${g0.game?.teams?.length ?? 0}`)
  const inj = injectTeamsFromTextPbpIfMissing(g0)
  console.log(`  after injection scoreboard.length=${inj.game?.scoreboard?.length ?? 0}`)
  console.log(`  after injection teams.length=${inj.game?.teams?.length ?? 0}`)
  if ((inj.game?.scoreboard?.length ?? 0) >= 2) {
    console.log(`  visitor=${inj.game!.scoreboard[0]!.teamName}`)
    console.log(`  home   =${inj.game!.scoreboard[1]!.teamName}`)
  }
  const pre = parsePregameInfoFromTextPbp(g0)
  console.log(`  pregame parsed=${pre ? "yes" : "no"}`)
  if (pre) {
    console.log(`    visitorFullName=${pre.visitorFullName}`)
    console.log(`    homeFullName   =${pre.homeFullName}`)
    console.log(`    visitorStarter =${pre.visitorStarterName}`)
    console.log(`    homeStarter    =${pre.homeStarterName}`)
  }
}
