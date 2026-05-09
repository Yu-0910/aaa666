/**
 * 1 試合の pitchingLines を team 別に並べ、buildPitcherIntervalsByTeam の結果と
 * resolvePitchersForBatterInning(... inning=N) の出力を直接表示する。
 *
 * 使い方: npx tsx scripts/diag_phase29_pitch_intervals_for_game.ts <gameId>
 */
import { loadCanonicalGames } from "@/lib/yahooGame/loadCanonicalGames"
import { injectTeamsFromTextPbpIfMissing } from "@/lib/yahooGame/inferTeamsFromTextPbp"
import {
  buildPitcherIntervalsByTeam,
  resolvePitchersForBatterInning,
} from "@/lib/yahooGame/pitcherIntervalsFromPitchingLines"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { teamForYahooPlayerId, inferPitcherTeamForNf3Line } from "@/lib/yahooGame/pitcherPocHelpers"
import { getProjectRoot } from "@/lib/projectRoot"

const gid = process.argv[2]
if (!gid || !/^\d+$/.test(gid)) {
  console.error("usage: tsx scripts/diag_phase29_pitch_intervals_for_game.ts <gameId>")
  process.exit(2)
}
const root = getProjectRoot()
const docs = loadCanonicalGames(root)
const target = docs.find((d) => String(d.gameId ?? "") === gid)
if (!target) {
  console.error("game not found:", gid)
  process.exit(2)
}
const inj = injectTeamsFromTextPbpIfMissing(target)
const board = inj.game?.scoreboard ?? []
const visitor = String(board[0]?.teamName ?? "").trim()
const home = String(board[1]?.teamName ?? "").trim()
console.log(`game: ${gid} visitor=${visitor} home=${home}`)

console.log(`\npitchingLines:`)
for (const pl of inj.domain?.pitchingLines ?? []) {
  const yid = String(pl.yahooPlayerId ?? "")
  const name = String(pl.playerName ?? "")
  const ip = String(pl.ip ?? "")
  const lookupL = teamForYahooPlayerId(inj, yid) || ""
  const lookupP = inferPitcherTeamForNf3Line(inj, yid) || ""
  const r = findRosterPlayerByPublicId(yid)
  const rt = String(r?.team ?? "").trim()
  const rosterMatch = rt && (rt === visitor || rt === home) ? rt : ""
  console.log(
    `  ${yid.padStart(10)}  ${name.padEnd(14)} ip=${ip.padStart(4)}  startingLineup=${JSON.stringify(lookupL)} pa=${JSON.stringify(lookupP)} roster=${JSON.stringify(rt)} match=${JSON.stringify(rosterMatch)}`,
  )
}

const intervals = buildPitcherIntervalsByTeam(inj)
console.log(`\nbuildPitcherIntervalsByTeam:`)
for (const [team, list] of intervals) {
  console.log(`  ${team}:`)
  for (const it of list) {
    console.log(`    ${it.yahooPitcherId} thirds [${it.startThirds}, ${it.endThirds})`)
  }
}

for (const inning of [1, 5, 7, 8, 9]) {
  for (const bt of [visitor, home]) {
    const reso = resolvePitchersForBatterInning(inj, bt, inning)
    console.log(`\nresolvePitchersForBatterInning batterTeam=${bt} inning=${inning} =>`, JSON.stringify(reso))
  }
}
