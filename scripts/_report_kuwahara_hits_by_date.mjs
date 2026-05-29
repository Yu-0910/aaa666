/**
 * 西武・桑原将志（Yahoo 打者 ID 1100061）の安打を試合日別に集計。
 * 判定は canonicalBattingSeasonAgg.ts の isAtBat + hitBases と同一。
 */
import fs from "node:fs"
import path from "node:path"

const YAHOO_BATTER_ID = "1100061"

function isWalkLike(s) {
  return /四球|敬遠|故意四球/.test(s)
}
function isHbp(s) {
  return /死球/.test(s)
}
function isSacBunt(s) {
  return /犠打|送りバント/.test(s)
}
function isSacFly(s) {
  return /犠飛/.test(s)
}
function lastPitchResult(pa) {
  const pe = pa.pitchEvents ?? []
  const last = pe.length > 0 ? pe[pe.length - 1] : null
  return ((pa.resultSummaryJa ?? "").trim() || String(last?.resultJa ?? "").trim() || "")
}
function stripBracketNotes(s) {
  return String(s ?? "").replace(/\[[^\]]*\]/g, "")
}
function hitBases(result) {
  const core = stripBracketNotes(result)
  if (/本塁打|ホームラン|HR/.test(result)) return 4
  if (/左中本|右中本|左本|右本|中本(?:$)/.test(core)) return 4
  if (/三塁打|左３|中３|右３|左3|中3|右3/.test(core)) return 3
  if (/二塁打|左２|中２|右２|左2|中2|右2/.test(core)) return 2
  if (/内安|内野安打/.test(core)) return 1
  if (/二安/.test(core)) return 1
  if (/三安/.test(core)) return 1
  if (/安打|ヒット|左安|中安|右安|遊安|投安/.test(core)) return 1
  return 0
}
function isAtBat(result) {
  if (!result) return false
  if (isWalkLike(result) || isHbp(result) || isSacBunt(result) || isSacFly(result)) return false
  if (/妨害/.test(result)) return false
  return true
}
function isHitPa(pa) {
  const r = lastPitchResult(pa)
  return isAtBat(r) && hitBases(r) > 0
}
function gameDateIso(doc) {
  const t = doc?.game?.meta?.documentTitle ?? doc?.game?.meta?.ogTitle ?? ""
  const m = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return null
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
}

const root = process.cwd()
const canonDir = path.join(root, "_data", "scraped_games", "canonical")
const byDate = new Map()
const detail = []

for (const f of fs.readdirSync(canonDir).filter((x) => x.endsWith(".json"))) {
  const doc = JSON.parse(fs.readFileSync(path.join(canonDir, f), "utf8"))
  const gameId = doc.gameId ?? f.replace(/\.json$/, "")
  const pas = doc.domain?.plateAppearances ?? []
  let hits = 0
  for (const pa of pas) {
    if (String(pa.yahooBatterId ?? "").trim() !== YAHOO_BATTER_ID) continue
    if (isHitPa(pa)) hits++
  }
  if (hits === 0) continue
  const d = gameDateIso(doc)
  if (!d) continue
  byDate.set(d, (byDate.get(d) ?? 0) + hits)
  detail.push({ gameId, date: d, hitsInGame: hits })
}

const sortedDates = [...byDate.keys()].sort()
let total = 0
const rows = sortedDates.map((d) => {
  const n = byDate.get(d)
  total += n
  return { 日付: d, 安打数: n }
})

console.log(
  JSON.stringify(
    {
      選手: "桑原 将志",
      球団: "埼玉西武ライオンズ",
      yahooBatterId: YAHOO_BATTER_ID,
      データ: "canonical の plateAppearances（Yahoo 一球マージ後）／集計ロジックは Phase11 と同じ",
      試合別: detail.sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId)),
      日付別合計: rows,
      安打合計: total,
    },
    null,
    2
  )
)
