/**
 * Sportsnavi stats: 同一 `<td>` 内の複数 `dataDetail` が別スロットになること。
 * `npm run validate:sportsnavi-stats-data-detail`
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseSportsnaviStatsHtml } from "../lib/yahooGame/sportsnaviStatsTextParse.mjs"
import {
  extractDataDetailTextsFromTdInner,
  statCellEntriesFromTd,
} from "../lib/yahooGame/sportsnaviStatsRowCells.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const DIV = "div"

function stripTags(html) {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const twoPaTdInner =
  `<${DIV} class="bb-statsTable__dataDetail">中飛</${DIV}>` +
  `<${DIV} class="bb-statsTable__dataDetail">空三振</${DIV}>`

const entries = statCellEntriesFromTd(
  ' class="bb-statsTable__data bb-statsTable__data--inning"',
  twoPaTdInner,
  stripTags,
)
assert.deepEqual(entries, ["中飛", "空三振"], `statCellEntriesFromTd: ${JSON.stringify(entries)}`)

const details = extractDataDetailTextsFromTdInner(twoPaTdInner)
assert.equal(details.length, 2)

const samplePath = join(root, "_data/scraped_games/raw_sportsnavi_stats/2021038741.html")
const html = readFileSync(samplePath, "utf8")
const rows = parseSportsnaviStatsHtml(html)
const w = rows.find((r) => r.yahooPlayerId === "1950417")
assert.ok(w, "渡部聖弥 row")
const slots = w.cells.slice(14).filter((c) => String(c).trim() !== "")
assert.ok(slots.includes("中飛"), `slots=${JSON.stringify(slots)}`)
assert.ok(slots.includes("空三振"), `slots=${JSON.stringify(slots)}`)
assert.ok(!slots.some((s) => s.includes("中飛 空三振")), `merged slot present: ${JSON.stringify(slots)}`)
const abCol = parseInt(w.cells[3], 10)
assert.equal(abCol, 5)
let slotsAb = 0
for (const s of w.cells.slice(14)) {
  const t = String(s).trim()
  if (!t) continue
  if (!/四球|敬遠|故意四|死球|犠打|犠飛/.test(t)) slotsAb += 1
}
assert.equal(slotsAb, abCol, `slotsAb=${slotsAb} abCol=${abCol}`)

console.log("[validate:sportsnavi-stats-data-detail] OK")
