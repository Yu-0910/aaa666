/**
 * 1 選手の打席を canonical から列挙し、投手の投球腕（名簿）で L/R に振り分けたときの
 * PA/AB/SH/SF 相当を表示する（seasonStatsPilot の vs_hand 集計と同系の判定）。
 *
 * Usage: node scripts/diag_batter_vs_pitcher_hand.mjs 1700135 L
 */
import fs from "node:fs"
import path from "node:path"

const bid = String(process.argv[2] ?? "").trim()
const want = String(process.argv[3] ?? "L").trim().toUpperCase() // R | L
if (!/^\d+$/.test(bid) || (want !== "L" && want !== "R")) {
  console.error("Usage: node scripts/diag_batter_vs_pitcher_hand.mjs <yahooBatterId> <L|R>")
  process.exit(1)
}

const root = process.cwd()
const canonicalDir = path.join(root, "_data", "scraped_games", "canonical")
const bridgePath = path.join(root, "_data", "scraped_games", "derived", "yahoo_pitcher_to_npb.json")
const rosterPath = path.join(root, "_data", "npb_roster_2026.csv")
const splitsPath = path.join(root, "_data", "derived", "player_season_batting_splits", "2026", `yahoo_${bid}.json`)

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"))
}

function loadThrowByNpb() {
  const csv = fs.readFileSync(rosterPath, "utf8")
  const lines = csv.split(/\r?\n/).filter(Boolean)
  const header = lines[0].split(",")
  const idxId = header.indexOf("npb_player_id")
  const idxThrow = header.indexOf("throw_hand")
  const m = new Map()
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",")
    const id = cols[idxId]?.trim()
    const th = cols[idxThrow]?.trim().toUpperCase()
    if (id && (th === "R" || th === "L")) m.set(id, th)
  }
  return m
}

function yahooPitcherToNpb() {
  const o = loadJson(bridgePath)
  return new Map(Object.entries(o).map(([k, v]) => [k, String(v).trim()]))
}

function lastResult(pa) {
  const pe = pa.pitchEvents ?? []
  const last = pe.length > 0 ? pe[pe.length - 1] : null
  return String(pa.resultSummaryJa ?? "").trim() || String(last?.resultJa ?? "").trim() || ""
}

function isWalk(s) {
  return /四球|敬遠|故意四球|申告敬遠|フォアボール|ボールフォー/.test(s)
}
function isHbp(s) {
  return /死球/.test(s)
}
function isSacBunt(s) {
  return /犠打|送りバント/.test(s)
}
function isSacFly(s) {
  return /犠飛|犠牲フライ|犠牲飛/.test(s)
}
function isAtBat(s) {
  if (!s) return false
  if (isWalk(s) || isHbp(s) || isSacBunt(s) || isSacFly(s)) return false
  return true
}

const throwByNpb = loadThrowByNpb()
const yahooToNpb = yahooPitcherToNpb()

let gameIds = []
if (fs.existsSync(splitsPath)) {
  try {
    gameIds = loadJson(splitsPath).source?.canonicalGames ?? []
  } catch {
    gameIds = []
  }
}
if (gameIds.length === 0) {
  gameIds = fs.readdirSync(canonicalDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
}

const rows = []
let pa = 0,
  ab = 0,
  sh = 0,
  sf = 0,
  bb = 0,
  hbp = 0

for (const gid of gameIds) {
  const fp = path.join(canonicalDir, `${gid}.json`)
  if (!fs.existsSync(fp)) continue
  let doc
  try {
    doc = loadJson(fp)
  } catch {
    continue
  }
  const pas = doc?.domain?.plateAppearances ?? []
  for (const p of pas) {
    if (String(p.yahooBatterId ?? "").trim() !== bid) continue
    const rt = lastResult(p)
    if (!rt) continue
    const pid = String(p.yahooPitcherId ?? "").trim()
    const npb = yahooToNpb.get(pid) ?? ""
    const th = npb ? throwByNpb.get(npb) ?? "" : ""
    if (th !== want) continue
    pa += 1
    if (isWalk(rt)) bb += 1
    if (isHbp(rt)) hbp += 1
    if (isSacBunt(rt)) sh += 1
    if (isSacFly(rt)) sf += 1
    if (isAtBat(rt)) ab += 1
    rows.push({
      game: gid,
      paId: p.paId,
      pitcherYahoo: pid,
      pitcherNpb: npb || "(no bridge)",
      throw: th || "?",
      resultSummaryJa: rt,
      countsAs: { ab: isAtBat(rt) ? 1 : 0, sh: isSacBunt(rt) ? 1 : 0, sf: isSacFly(rt) ? 1 : 0 },
    })
  }
}

rows.sort((a, b) => a.paId.localeCompare(b.paId))

console.log(
  JSON.stringify(
    {
      batter: bid,
      filterPitcherThrow: want,
      totals: { pa, ab, sh, sf, bb, hbp },
      note:
        "投手腕は _data/npb_roster_2026.csv と yahoo_pitcher_to_npb。canonical の yahooPitcherId のみ使用（対左右 API の BF 補完・実況タイムラインは未再現）。",
      rows,
    },
    null,
    2,
  ),
)
