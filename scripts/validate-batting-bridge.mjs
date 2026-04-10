/**
 * 橋渡し CSV の健全性チェック（個人ページの Yahoo / NPB 解決の前提）。
 *
 * 原因となったパターン:
 * - yahoo_player_id はあるが npb_player_id が空 → 名簿照合・今季 API が繋がらない
 * - 支配下で NPB ID が取れる選手は必ず npb 列を埋める（外国人のみ例外）
 *
 * 許容: NPB 未登録の海外助っ人など、名簿にいない想定の選手名のみ（下記 allowlist）。
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const bridgePath = path.join(
  root,
  "_data",
  "scraped_games",
  "derived",
  "2021038624_batting_master_bridge.csv",
)
const rosterPath = path.join(root, "_data", "npb_roster_2026.csv")

/** npb 欠損を許す行（名簿に NPB ID が無い想定の助っ人等）。追加時は理由をコメントすること。 */
const ALLOW_EMPTY_NPB_NAMES = new Set([
  "カリステ",
  "サノー",
  "モンテロ",
])

function compactNameJa(s) {
  return String(s ?? "")
    .trim()
    .normalize("NFC")
    .replace(/\s+/g, "")
    .replace(/[（）()［\[\]］【】]/g, "")
}

function nameLookupKeysFromCompact(compact) {
  const c = compactNameJa(compact)
  const keys = new Set()
  if (!c) return keys
  keys.add(c)
  // 外国人名の「Ｍ．サノー」「Ｏ．カリステ」等: 先頭イニシャルを除いたキーも追加
  const noInitial = c
    .replace(/^[\uFF21-\uFF3A\uFF41-\uFF5A][．.]/u, "")
    .replace(/^[A-Za-z][.]/u, "")
  if (noInitial) keys.add(noInitial)
  return keys
}

function splitCsvLine(line) {
  const out = []
  let cur = ""
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQ = !inQ
      continue
    }
    if (!inQ && ch === ",") {
      out.push(cur)
      cur = ""
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

function loadRosterNameKeySet() {
  const keys = new Set()
  if (!fs.existsSync(rosterPath)) return keys
  const text = fs.readFileSync(rosterPath, "utf-8")
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return keys
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^\ufeff/, ""))
  const iJa = headers.indexOf("name_ja")
  if (iJa < 0) return keys
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    const nameJa = (cols[iJa] ?? "").trim()
    if (!nameJa) continue
    const k = nameLookupKeysFromCompact(nameJa)
    for (const kk of k) keys.add(kk)
  }
  return keys
}

function main() {
  if (!fs.existsSync(bridgePath)) {
    console.error("[validate-batting-bridge] missing file:", bridgePath)
    process.exit(1)
  }
  const text = fs.readFileSync(bridgePath, "utf-8")
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    console.error("[validate-batting-bridge] empty csv")
    process.exit(1)
  }
  const headers = lines[0].split(",").map((h) => h.trim())
  const iNpb = headers.indexOf("npb_player_id")
  const iYahoo = headers.indexOf("yahoo_player_id")
  const iName = headers.indexOf("player_name")
  if (iNpb < 0 || iYahoo < 0 || iName < 0) {
    console.error("[validate-batting-bridge] required columns missing")
    process.exit(1)
  }

  const rosterNameKeys = loadRosterNameKeySet()

  const violations = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",")
    const npb = (cols[iNpb] ?? "").trim()
    const yahoo = (cols[iYahoo] ?? "").trim()
    const name = (cols[iName] ?? "").trim()
    if (!yahoo) continue
    if (npb) continue
    if (ALLOW_EMPTY_NPB_NAMES.has(name)) {
      // allowlist でも、名簿にいる選手は欠損を許さない（外国人でも名簿にいるなら NPB ID を埋める）
      const nameKeys = nameLookupKeysFromCompact(name)
      let existsInRoster = false
      for (const k of nameKeys) {
        if (rosterNameKeys.has(k)) {
          existsInRoster = true
          break
        }
      }
      if (!existsInRoster) continue
    }
    violations.push({ line: i + 1, name, yahoo })
  }

  if (violations.length > 0) {
    console.error(
      "[validate-batting-bridge] yahoo_player_id があるのに npb_player_id が空の行があります（名簿と紐づかず個人ページが壊れます）。",
    )
    for (const v of violations) {
      console.error(`  行 ${v.line}: ${v.name} (yahoo=${v.yahoo})`)
    }
    console.error(
      "  対処: 名簿の npb_player_id を埋めるか、本当に NPB 無しなら ALLOW_EMPTY_NPB_NAMES に追加。",
    )
    process.exit(1)
  }
  console.log("[validate-batting-bridge] OK")
}

main()
