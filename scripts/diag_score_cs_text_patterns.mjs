#!/usr/bin/env node
/**
 * score raw HTML 内の盗塁関連表現を走査し、現行パーサで拾えない行を集計する。
 *   node scripts/diag_score_cs_text_patterns.mjs --year 2026
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const year = process.argv.includes("--year")
  ? process.argv[process.argv.indexOf("--year") + 1]
  : "2026"
const root = join(process.cwd(), "_data", "scraped_games", "raw_sportsnavi_score")

const CS_RE =
  /(盗塁失敗|盗塁死|盗塁刺|けん制死|牽制死|けん制アウト|牽制アウト|挟殺|二盗死|三盗死|盗塁を試みるも(?:アウト|タッチアウト))（[^）]{1,24}）/g

const PARSED_RE_LIST = [
  /盗塁成功（([^）]{1,24})）/g,
  /盗塁失敗（([^）]{1,24})）/g,
  /盗塁死（([^）]{1,24})）/g,
  /けん制死（([^）]{1,24})）/g,
  /牽制死（([^）]{1,24})）/g,
  /けん制アウト（([^）]{1,24})）/g,
  /牽制アウト（([^）]{1,24})）/g,
  /挟殺（([^）]{1,24})）/g,
]

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function hasParsedCs(line) {
  for (const re of PARSED_RE_LIST) {
    re.lastIndex = 0
    if (re.test(line)) return true
  }
  return false
}

const unmatched = new Map()
let games = 0
let htmlFiles = 0
let csMentions = 0
let csUnparsed = 0

for (const ent of readdirSync(root)) {
  const p = join(root, ent)
  if (!statSync(p).isDirectory() || ent.startsWith("_")) continue
  games += 1
  for (const fn of readdirSync(p)) {
    if (!fn.endsWith(".html")) continue
    htmlFiles += 1
    const t = stripHtml(readFileSync(join(p, fn), "utf8"))
    if (!/盗塁|けん制|牽制|挟殺|二盗|三盗/.test(t)) continue
    CS_RE.lastIndex = 0
    let m
    while ((m = CS_RE.exec(t)) !== null) {
      csMentions += 1
      const snippet = t.slice(Math.max(0, m.index - 20), m.index + m[0].length + 30)
      if (!hasParsedCs(snippet)) {
        csUnparsed += 1
        const key = m[0].replace(/（[^）]+）/, "（*）")
        unmatched.set(key, (unmatched.get(key) ?? 0) + 1)
      }
    }
    // 括弧形式以外の CS っぽい語
    const loose = [
      /盗塁を試みるもアウト/g,
      /盗塁を試みるもタッチアウト/g,
      /スタートを切っていた[一二三]塁走者[^。]{0,40}もアウト/g,
      /[二三]盗死/g,
      /盗塁刺/g,
    ]
    for (const re of loose) {
      re.lastIndex = 0
      while ((m = re.exec(t)) !== null) {
        if (/盗塁成功率/.test(t.slice(m.index - 8, m.index + 20))) continue
        const frag = t.slice(m.index, m.index + 60)
        if (/（[^）]{1,24}）/.test(frag)) continue
        const key = `loose:${m[0].slice(0, 24)}`
        unmatched.set(key, (unmatched.get(key) ?? 0) + 1)
        csUnparsed += 1
      }
    }
  }
}

console.log(`[diag_score_cs_text] year≈${year} games=${games} html=${htmlFiles}`)
console.log(`  cs-like parenthesis mentions=${csMentions} unparsed-by-current-labels=${csUnparsed}`)
const top = [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
console.log("  top unmatched patterns:")
for (const [k, n] of top) console.log(`    ${n}\t${k}`)
