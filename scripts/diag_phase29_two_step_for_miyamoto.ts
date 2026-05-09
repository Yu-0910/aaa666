/**
 * 試合 2021038765 の宮本丈（1700089）に絞って、injectTeamsFromTextPbpIfMissing 後の
 * scoreboard と各 fallback 段の判定根拠を直接確認する。
 */
import { loadCanonicalGames } from "@/lib/yahooGame/loadCanonicalGames"
import { injectTeamsFromTextPbpIfMissing, parsePregameInfoFromTextPbp } from "@/lib/yahooGame/inferTeamsFromTextPbp"
import { teamForYahooPlayerId } from "@/lib/yahooGame/pitcherPocHelpers"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { getProjectRoot } from "@/lib/projectRoot"

const root = getProjectRoot()
const docs = loadCanonicalGames(root)
const target = docs.find((d) => String(d.gameId ?? "") === "2021038765")
if (!target) {
  console.error("game not found")
  process.exit(2)
}
const bid = "1700089"

const pre = parsePregameInfoFromTextPbp(target)
const inj = injectTeamsFromTextPbpIfMissing(target)
const board = inj.game?.scoreboard ?? []
const teams = inj.game?.teams ?? []
const visitor = String(board[0]?.teamName ?? "").trim()
const home = String(board[1]?.teamName ?? "").trim()

console.log("preParsed:", JSON.stringify(pre, null, 2))
console.log("scoreboard.len:", board.length, "teams.len:", teams.length)
console.log("visitor:", JSON.stringify(visitor), "home:", JSON.stringify(home))

const teamFromLineup = teamForYahooPlayerId(inj, bid)
console.log("teamForYahooPlayerId:", JSON.stringify(teamFromLineup))

const rosterRow = findRosterPlayerByPublicId(bid)
console.log("roster.team:", JSON.stringify(rosterRow?.team))

const rt = String(rosterRow?.team ?? "").trim()
console.log("rosterTeam == visitor :", rt === visitor)
console.log("rosterTeam == home    :", rt === home)
console.log("char codes(visitor) :", [...visitor].map((c) => c.charCodeAt(0)).join(","))
console.log("char codes(rt)      :", [...rt].map((c) => c.charCodeAt(0)).join(","))

const teamsBlock = inj.game?.teams ?? []
console.log("teams block sample:")
for (const t of teamsBlock) {
  const lineup = (t as { startingLineup?: { yahooPlayerId?: string }[] }).startingLineup ?? []
  const names = lineup.map((x) => String((x as { playerName?: string }).playerName ?? ""))
  const ids = lineup.map((x) => String(x.yahooPlayerId ?? ""))
  console.log("  team:", (t as { teamName?: string }).teamName, "lineup:", ids.length, names.slice(0, 3))
  if (ids.includes(bid)) console.log("    ✓ Miyamoto found in this team's lineup")
}
