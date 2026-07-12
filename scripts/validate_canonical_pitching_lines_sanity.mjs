#!/usr/bin/env node
/**
 * canonical pitchingLines の列ずれ再発検知。
 *
 * スポナビ投手表の HTML 形が変わると、投球回に投球数が入るなどの列ずれが起きる。
 * Phase2b 直後にこの検証を通して、壊れた投手成績をランキングへ流さない。
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

function parseArgs(argv) {
  const out = {
    year: "2026",
    from: "",
    to: "",
    gameIds: [],
    fail: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--year" && argv[i + 1]) out.year = String(argv[++i]).trim()
    else if (a === "--from" && argv[i + 1]) out.from = String(argv[++i]).trim()
    else if (a === "--to" && argv[i + 1]) out.to = String(argv[++i]).trim()
    else if (a === "--from-date" && argv[i + 1]) out.from = String(argv[++i]).trim()
    else if (a === "--to-date" && argv[i + 1]) out.to = String(argv[++i]).trim()
    else if (a === "--game-ids" && argv[i + 1]) {
      out.gameIds = String(argv[++i])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (a === "--fail") out.fail = true
  }
  return out
}

function ipStringToOuts(ipRaw) {
  if (ipRaw == null) return 0
  const s = String(ipRaw).trim()
  if (!s) return 0
  if (!/^\d+(?:\.[012])?$/.test(s)) return Number.NaN
  const [wholeRaw, thirdRaw = "0"] = s.split(".")
  return (parseInt(wholeRaw, 10) || 0) * 3 + (parseInt(thirdRaw, 10) || 0)
}

function listGameIdsForDateRange(year, from, to) {
  const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  if (!fs.existsSync(idxPath)) return []
  const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"))
  const byDate = idx?.byDate ?? {}
  const out = []
  for (const [day, ids] of Object.entries(byDate)) {
    if (from && day < from) continue
    if (to && day > to) continue
    if (!Array.isArray(ids)) continue
    for (const id of ids) {
      const s = String(id ?? "").trim()
      if (s) out.push(s)
    }
  }
  return [...new Set(out)]
}

function discoverGameIds(args) {
  if (args.gameIds.length > 0) return args.gameIds
  if (args.from || args.to) return listGameIdsForDateRange(args.year, args.from, args.to)

  const canonicalDir = path.join(root, "_data", "scraped_games", "canonical")
  if (!fs.existsSync(canonicalDir)) return []
  return fs
    .readdirSync(canonicalDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/i, ""))
    .sort()
}

function n(v) {
  if (v == null || v === "") return undefined
  const num = Number(v)
  return Number.isFinite(num) ? num : undefined
}

function addIssue(issues, gameId, row, code, detail) {
  issues.push({
    gameId,
    yahooPlayerId: String(row.yahooPlayerId ?? ""),
    playerName: String(row.playerName ?? ""),
    code,
    detail,
    sample: {
      era: row.era,
      ip: row.ip,
      pitches: row.pitches,
      bf: row.bf,
      h: row.h,
      hr: row.hr,
      so: row.so,
      bb: row.bb,
      r: row.r,
      er: row.er,
      inferredFrom: row.inferredFrom,
    },
  })
}

function validatePitchingLine(gameId, row, issues) {
  if (row?.inferredFrom !== "score_table_v0") return

  const outs = ipStringToOuts(row.ip)
  const bf = n(row.bf)
  const pitches = n(row.pitches)
  const h = n(row.h)
  const hr = n(row.hr)
  const r = n(row.r)
  const er = n(row.er)
  const active = outs > 0 || (bf ?? 0) > 0

  if (Number.isNaN(outs)) {
    addIssue(issues, gameId, row, "bad_ip_format", `ip=${JSON.stringify(row.ip)}`)
    return
  }
  if (!active) return

  for (const key of ["pitches", "bf", "h", "hr", "so", "bb", "hbp", "bk", "r", "er"]) {
    if (n(row[key]) == null) {
      addIssue(issues, gameId, row, "missing_numeric_cell", `${key} is missing`)
      break
    }
  }

  if ((bf ?? 0) > 0 && outs > (bf ?? 0) * 3) {
    addIssue(issues, gameId, row, "ip_too_large_for_bf", `outs=${outs}, bf=${bf}`)
  }
  if ((bf ?? 0) > 0 && pitches != null && pitches < (bf ?? 0)) {
    addIssue(issues, gameId, row, "pitches_less_than_bf", `pitches=${pitches}, bf=${bf}`)
  }
  if (h != null && hr != null && hr > h) {
    addIssue(issues, gameId, row, "hr_greater_than_hits", `hr=${hr}, h=${h}`)
  }
  if (r != null && er != null && er > r) {
    addIssue(issues, gameId, row, "er_greater_than_runs", `er=${er}, r=${r}`)
  }
}

function main() {
  const args = parseArgs(process.argv)
  const gameIds = discoverGameIds(args)
  const issues = []
  let checkedGames = 0
  let checkedRows = 0

  for (const gameId of gameIds) {
    const canonicalPath = path.join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
    if (!fs.existsSync(canonicalPath)) continue
    let doc
    try {
      doc = JSON.parse(fs.readFileSync(canonicalPath, "utf8"))
    } catch {
      issues.push({ gameId, code: "bad_canonical_json", detail: canonicalPath })
      continue
    }
    checkedGames += 1
    const rows = Array.isArray(doc?.domain?.pitchingLines) ? doc.domain.pitchingLines : []
    for (const row of rows) {
      if (row?.inferredFrom === "score_table_v0") checkedRows += 1
      validatePitchingLine(gameId, row, issues)
    }
  }

  const scope =
    args.gameIds.length > 0
      ? `gameIds=${args.gameIds.join(",")}`
      : args.from || args.to
        ? `year=${args.year} from=${args.from || "-"} to=${args.to || "-"}`
        : `year=${args.year} all canonical`

  if (issues.length > 0) {
    console.error(
      `[validate_canonical_pitching_lines_sanity] NG scope=${scope} checkedGames=${checkedGames} checkedRows=${checkedRows} issues=${issues.length}`,
    )
    for (const issue of issues.slice(0, 30)) {
      console.error(JSON.stringify(issue))
    }
    if (issues.length > 30) console.error(`... and ${issues.length - 30} more`)
    if (args.fail) process.exit(1)
  } else {
    console.log(
      `[validate_canonical_pitching_lines_sanity] OK scope=${scope} checkedGames=${checkedGames} checkedRows=${checkedRows}`,
    )
  }
}

main()
