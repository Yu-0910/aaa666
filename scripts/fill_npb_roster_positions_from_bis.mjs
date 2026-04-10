/**
 * NPB公式 球団別選手一覧 HTML から position を抽出し npb_roster_2026.csv を更新する。
 *
 * 方式A（推奨・オフライン）: HTML を先に保存したディレクトリを渡す
 *   PowerShell 例:
 *     $d = Join-Path $env:TEMP "npb_bis_html"; New-Item -ItemType Directory -Force -Path $d | Out-Null
 *     @(
 *       @{f='rst_t.html';u='https://npb.jp/bis/teams/rst_t.html'},
 *       @{f='rst_db.html';u='https://npb.jp/bis/teams/rst_db.html'},
 *       @{f='rst_g.html';u='https://npb.jp/bis/teams/rst_g.html'},
 *       @{f='rst_d.html';u='https://npb.jp/bis/teams/rst_d.html'},
 *       @{f='rst_c.html';u='https://npb.jp/bis/teams/rst_c.html'},
 *       @{f='rst_s.html';u='https://npb.jp/bis/teams/rst_s.html'},
 *       @{f='rst_h.html';u='https://npb.jp/bis/teams/rst_h.html'},
 *       @{f='rst_f.html';u='https://npb.jp/bis/teams/rst_f.html'},
 *       @{f='rst_b.html';u='https://npb.jp/bis/teams/rst_b.html'},
 *       @{f='rst_e.html';u='https://npb.jp/bis/teams/rst_e.html'},
 *       @{f='rst_l.html';u='https://npb.jp/bis/teams/rst_l.html'},
 *       @{f='rst_m.html';u='https://npb.jp/bis/teams/rst_m.html'}
 *     ) | ForEach-Object { Invoke-WebRequest -Uri $_.u -OutFile (Join-Path $d $_.f) -UseBasicParsing }
 *     node scripts/fill_npb_roster_positions_from_bis.mjs --html-dir $d
 *
 * 方式B: 直接取得（ネットワークあり）
 *   node scripts/fill_npb_roster_positions_from_bis.mjs
 *
 * 基準ページ: https://npb.jp/bis/teams/
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "..")
const DEFAULT_CSV = path.join(ROOT, "_data", "npb_roster_2026.csv")

const FETCH_URLS = [
  "https://npb.jp/bis/teams/rst_t.html",
  "https://npb.jp/bis/teams/rst_db.html",
  "https://npb.jp/bis/teams/rst_g.html",
  "https://npb.jp/bis/teams/rst_d.html",
  "https://npb.jp/bis/teams/rst_c.html",
  "https://npb.jp/bis/teams/rst_s.html",
  "https://npb.jp/bis/teams/rst_h.html",
  "https://npb.jp/bis/teams/rst_f.html",
  "https://npb.jp/bis/teams/rst_b.html",
  "https://npb.jp/bis/teams/rst_e.html",
  "https://npb.jp/bis/teams/rst_l.html",
  "https://npb.jp/bis/teams/rst_m.html",
]

const POS_LABELS = ["投手", "捕手", "内野手", "外野手"]
/** 一覧が1行HTMLのため、セクション見出し〜選手リンクが 2k 超になることがある */
const LOOKBACK_CHARS = 25000

function extractPositionsFromHtml(html) {
  const map = new Map()
  const linkRe = /\/bis\/players\/(\d+)\.html/g
  let m
  while ((m = linkRe.exec(html)) !== null) {
    const id = m[1]
    const absIdx = m.index
    const chunk = html.slice(Math.max(0, absIdx - LOOKBACK_CHARS), absIdx)
    let found = null
    let bestJ = -1
    for (const lab of POS_LABELS) {
      const needles = [`>${lab}</th`, `>${lab}</td`, `>${lab}</`]
      for (const needle of needles) {
        const j = chunk.lastIndexOf(needle)
        if (j > bestJ) {
          bestJ = j
          found = lab
        }
      }
    }
    if (found) map.set(id, found)
  }
  return map
}

function splitCsvLine(line) {
  const out = []
  let cur = ""
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQ = !inQ
      continue
    }
    if (!inQ && c === ",") {
      out.push(cur)
      cur = ""
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

function escapeCsvField(s) {
  const t = String(s ?? "")
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`
  return t
}

function parseArgs() {
  const a = process.argv.slice(2)
  let htmlDir = null
  let csvPath = DEFAULT_CSV
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--html-dir" && a[i + 1]) {
      htmlDir = a[++i]
    } else if (a[i] === "--csv" && a[i + 1]) {
      csvPath = a[++i]
    }
  }
  return { htmlDir, csvPath }
}

async function main() {
  const { htmlDir, csvPath } = parseArgs()
  const globalPos = new Map()

  if (htmlDir) {
    const names = FETCH_URLS.map((u) => path.basename(u))
    for (const name of names) {
      const fp = path.join(htmlDir, name)
      if (!fs.existsSync(fp)) {
        console.error(`skip missing: ${fp}`)
        continue
      }
      const html = fs.readFileSync(fp, "utf8")
      const local = extractPositionsFromHtml(html)
      for (const [id, pos] of local) globalPos.set(id, pos)
      console.error(`OK file ${name} → ${local.size} links`)
    }
  } else {
    for (const url of FETCH_URLS) {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "TopPage-roster-sync/1.0 (NPB bis roster; local maintenance)",
        },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
      const html = await res.text()
      const local = extractPositionsFromHtml(html)
      for (const [id, pos] of local) globalPos.set(id, pos)
      console.error(`OK ${url} → ${local.size} links`)
    }
  }

  const raw = fs.readFileSync(csvPath, "utf8")
  const lines = raw.split(/\r?\n/)
  const header = lines[0]
  const headerCols = splitCsvLine(header)
  const iPos = headerCols.indexOf("position")
  const iId = headerCols.indexOf("npb_player_id")
  if (iPos < 0 || iId < 0) throw new Error("CSV header missing npb_player_id or position")

  let updated = 0
  let missing = 0
  const outLines = [header]

  for (let li = 1; li < lines.length; li++) {
    const line = lines[li]
    if (!line.trim()) {
      outLines.push(line)
      continue
    }
    const cols = splitCsvLine(line)
    if (cols.length < headerCols.length) {
      while (cols.length < headerCols.length) cols.push("")
    }
    const id = (cols[iId] ?? "").trim()
    const pos = globalPos.get(id)
    if (pos) {
      if (cols[iPos] !== pos) updated++
      cols[iPos] = pos
    } else if (id) {
      missing++
    }
    outLines.push(cols.map(escapeCsvField).join(","))
  }

  fs.writeFileSync(csvPath, outLines.join("\n") + (raw.endsWith("\n") ? "\n" : ""), "utf8")
  console.error(`Wrote ${csvPath}`)
  console.error(`Cells updated: ${updated}`)
  console.error(`Rows still without BIS match: ${missing}`)
  console.error(`Unique player IDs from HTML: ${globalPos.size}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
