import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "..")
const PILOT = path.join(ROOT, "_data", "yahoo_games_pilot")
const GAME_ID = "2021040036"
const CARP_TEAM = "広島東洋カープ"

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = parseCsvLine(lines[0])
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    const o = {}
    headers.forEach((h, i) => {
      o[h] = cells[i] ?? ""
    })
    return o
  })
  return { headers, rows }
}

function parseCsvLine(line) {
  const out = []
  let cur = ""
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          q = false
        }
      } else cur += c
    } else {
      if (c === '"') q = true
      else if (c === ",") {
        out.push(cur)
        cur = ""
      } else cur += c
    }
  }
  out.push(cur)
  return out
}

function escapeCell(s) {
  if (s == null) return ""
  const t = String(s)
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`
  return t
}

function writeCsv(filePath, headers, rows) {
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(",")),
  ]
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8")
}

const normPath = path.join(PILOT, "plate_appearances_normalized.csv")
const rawNorm = fs.readFileSync(normPath, "utf8")
const { headers: nf, rows: normRows } = parseCsv(rawNorm)

const carpBatters = new Set()
const carpPitchers = new Set()
const keptNorm = []

for (const row of normRows) {
  if (row.game_id !== GAME_ID) {
    keptNorm.push(row)
    continue
  }
  if (row.batting_team === CARP_TEAM) {
    const b = String(row.batter_id || "").trim()
    if (b) carpBatters.add(b)
    continue
  }
  keptNorm.push(row)
  const pid = String(row.pitcher_id || "").trim()
  if (pid) carpPitchers.add(pid)
}

writeCsv(normPath, nf, keptNorm)

const paPath = path.join(PILOT, "plate_appearances.csv")
const { headers: pf, rows: paRows } = parseCsv(fs.readFileSync(paPath, "utf8"))
const keptPa = paRows.filter(
  (row) => !(row.game_id === GAME_ID && row.top_bottom === "表")
)
writeCsv(paPath, pf, keptPa)

const pdPath = path.join(PILOT, "pitch_details.csv")
const { headers: pdf, rows: pdRows } = parseCsv(fs.readFileSync(pdPath, "utf8"))
const keptPd = pdRows.filter((row) => row.game_id !== GAME_ID)
writeCsv(pdPath, pdf, keptPd)

const bsPath = path.join(PILOT, "batting_stats.csv")
const { headers: bsf, rows: bsRows } = parseCsv(fs.readFileSync(bsPath, "utf8"))
const keptBs = bsRows.filter((row) => !carpBatters.has(String(row.player_id || "").trim()))
writeCsv(bsPath, bsf, keptBs)

const psPath = path.join(PILOT, "pitching_stats.csv")
const { headers: psf, rows: psRows } = parseCsv(fs.readFileSync(psPath, "utf8"))
const keptPs = psRows.filter((row) => !carpPitchers.has(String(row.player_id || "").trim()))
writeCsv(psPath, psf, keptPs)

const kjson = path.join(PILOT, "kikuchi_20260304_blocks.json")
fs.writeFileSync(
  kjson,
  JSON.stringify(
    {
      meta: {
        batter_id: "1100082",
        batter_name: "菊池涼介",
        date: "",
        pa_count: 0,
        game_ids: [],
      },
      blocks: {},
    },
    null,
    2
  ),
  "utf8"
)

console.log("Carp batters removed:", [...carpBatters].sort().join(", "))
console.log("Carp pitchers removed:", [...carpPitchers].sort().join(", "))
console.log("Done.")
