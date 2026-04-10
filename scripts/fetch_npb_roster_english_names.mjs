/**
 * NPB 英語公式（/bis/eng/players/{id}.html）から名簿の英字①フル・②略式を埋める。
 * - 投手: ①または②が空なら取得（②のみ空ならフルから算出のみのこともある）
 * - 野手: ①が空のときのみ取得
 * - 既に値がある列は上書きしない
 *
 * 使い方:
 *   node scripts/fetch_npb_roster_english_names.mjs
 *   node scripts/fetch_npb_roster_english_names.mjs --dry-run
 *   node scripts/fetch_npb_roster_english_names.mjs --limit 5
 *   node scripts/fetch_npb_roster_english_names.mjs --migrate-only
 *     （列追加・既存 name_en から name_en_full / name_en_short を埋めるのみ。NPB 取得なし）
 *
 * 名簿の日本人は英字を「姓 名」順で保持（NPB 英語ページは名 姓のため取得後に入れ替え）。
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV_PATH = path.join(__dirname, "..", "_data", "npb_roster_2026.csv")

function formatRomanNameForRanking(romanName) {
  const trimmed = String(romanName || "").trim()
  if (!trimmed) return ""
  const alreadyFormattedPattern = /^[A-Z]\.([A-Z][a-z]+|[A-Z]+)$/
  if (alreadyFormattedPattern.test(trimmed)) return trimmed
  const parts = trimmed.split(/\s+/)
  if (parts.length === 0) return ""
  if (parts.length === 1) {
    const name = parts[0]
    return name.length > 0 ? `${name[0].toUpperCase()}.${name}` : ""
  }
  const firstName = parts[parts.length - 1]
  const lastName = parts.slice(0, -1).join(" ")
  const initial = lastName.length > 0 ? lastName[0].toUpperCase() : ""
  return `${initial}.${firstName}`
}

function parseCsvLine(line) {
  const result = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuotes = !inQuotes
    else if (inQuotes) current += c
    else if (c === ",") {
      result.push(current)
      current = ""
    } else current += c
  }
  result.push(current)
  return result
}

function migrateHeaderAndRows(lines) {
  const header = parseCsvLine(lines[0])
  if (header.includes("name_en_full")) {
    const bodyLines = lines
      .slice(1)
      .map((line) => parseCsvLine(line))
      .filter((r) => r.length > 0 && !(r.length === 1 && r[0] === ""))
    return { header, bodyLines }
  }
  const iEn = header.indexOf("name_en")
  if (iEn < 0) throw new Error("name_en column missing")
  const newHeader = [...header.slice(0, iEn + 1), "name_en_full", "name_en_short", ...header.slice(iEn + 1)]
  const bodyLines = []
  for (let li = 1; li < lines.length; li++) {
    const row = parseCsvLine(lines[li])
    if (row.length === 1 && row[0] === "") continue
    const extended = [...row.slice(0, iEn + 1), "", "", ...row.slice(iEn + 1)]
    bodyLines.push(extended)
  }
  return { header: newHeader, bodyLines }
}

function rowToLine(row) {
  return row.join(",")
}

function parseTitleLastFirst(html) {
  const tm = html.match(/<title>\s*([^<]+?)\s*</i)
  if (!tm) return null
  let chunk = tm[1].replace(/\s*\|\s*.*$/i, "").trim()
  chunk = chunk.replace(/[（(].*$/, "").trim()
  const comma = chunk.indexOf(",")
  if (comma < 0) return null
  const last = chunk.slice(0, comma).trim()
  const first = chunk
    .slice(comma + 1)
    .trim()
    .replace(/,+$/g, "")
  if (!last || !first) return null
  const westernFull = `${first} ${last}`
  return { westernFull, short: formatRomanNameForRanking(westernFull, "") }
}

async function fetchEngPlayer(npbId, delayMs) {
  const url = `https://npb.jp/bis/eng/players/${npbId}.html`
  await new Promise((r) => setTimeout(r, delayMs))
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; TopPageRosterEn/1.0; +https://npb.jp/)",
      Accept: "text/html,application/xhtml+xml",
    },
  })
  if (!res.ok) return null
  const html = await res.text()
  return parseTitleLastFirst(html)
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const out = { dryRun: false, limit: 0, delayMs: 400, migrateOnly: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--migrate-only") out.migrateOnly = true
    else if (argv[i] === "--dry-run") out.dryRun = true
    else if (argv[i] === "--limit" && argv[i + 1]) {
      out.limit = parseInt(argv[i + 1], 10) || 0
      i++
    } else if (argv[i] === "--delay" && argv[i + 1]) {
      out.delayMs = parseInt(argv[i + 1], 10) || 400
      i++
    }
  }
  return out
}

async function main() {
  const { dryRun, limit, delayMs, migrateOnly } = parseArgs()
  const raw = fs.readFileSync(CSV_PATH, "utf-8")
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length < 2) throw new Error("empty csv")

  const { header, bodyLines } = migrateHeaderAndRows(lines)
  const idx = (name) => header.indexOf(name)
  const iId = idx("npb_player_id")
  const iJa = idx("name_ja")
  const iEn = idx("name_en")
  const iFull = idx("name_en_full")
  const iShort = idx("name_en_short")
  const iPos = idx("position")
  if (iId < 0 || iJa < 0 || iEn < 0 || iFull < 0 || iShort < 0 || iPos < 0) {
    throw new Error("missing required columns")
  }

  let fetched = 0
  let derivedShort = 0
  let fetchSkipped = 0
  let errors = 0
  let copiedFull = 0

  for (const row of bodyLines) {
    while (row.length < header.length) row.push("")
    const npbId = (row[iId] || "").trim()
    const legacy = (row[iEn] || "").trim()

    if (!(row[iFull] || "").trim() && legacy) {
      row[iFull] = legacy
      copiedFull++
    }

    const fullCell = (row[iFull] || "").trim()

    if (!(row[iShort] || "").trim() && (fullCell || legacy)) {
      const base = fullCell || legacy
      const next = formatRomanNameForRanking(base)
      if (next) {
        row[iShort] = next
        derivedShort++
      }
    }

    if (migrateOnly) continue

    const fullNow = (row[iFull] || "").trim() || (row[iEn] || "").trim()
    const needNetwork = !fullNow && npbId.length >= 8

    if (!needNetwork) {
      fetchSkipped++
      continue
    }

    if (limit > 0 && fetched >= limit) {
      fetchSkipped++
      continue
    }

    if (dryRun) {
      console.log(`[dry-run] fetch ${npbId} ${row[iJa]}`)
      fetched++
      continue
    }

    try {
      const data = await fetchEngPlayer(npbId, delayMs)
      if (!data) {
        errors++
        console.warn(`no data: ${npbId} ${row[iJa]}`)
        fetchSkipped++
        continue
      }
      if (!(row[iFull] || "").trim() && !(row[iEn] || "").trim()) {
        let full = data.westernFull
        if (isJapaneseRosterFlipTarget(row[iJa])) {
          const flipped = flipTwoWordWesternToSurnameFirst(full)
          if (flipped) full = flipped
        }
        row[iFull] = full
        row[iEn] = full
      }
      if (!(row[iShort] || "").trim()) {
        const fullNow = ((row[iFull] || "").trim() || (row[iEn] || "").trim() || data.westernFull).trim()
        row[iShort] = formatRomanNameForRanking(fullNow, row[iJa]) || data.short
      }
      fetched++
      console.log(`ok ${npbId} ${row[iJa]} -> ${data.westernFull} / ${data.short}`)
    } catch (e) {
      errors++
      console.warn(`error ${npbId}`, e?.message || e)
    }
  }

  if (!dryRun) {
    const outLines = [rowToLine(header), ...bodyLines.map(rowToLine)]
    fs.writeFileSync(CSV_PATH, outLines.join("\n") + "\n", "utf-8")
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        migrateOnly,
        fetched,
        derivedShort,
        copiedFullFromLegacy: copiedFull,
        fetchSkipped,
        errors,
        delayMs,
        totalRows: bodyLines.length,
      },
      null,
      0
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
