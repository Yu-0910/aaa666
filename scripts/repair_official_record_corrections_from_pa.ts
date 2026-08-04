/**
 * 後日公式記録訂正で、出場成績行（statsPlayerLinkedRows / battingLines）と
 * 一球・打席ログ（domain.plateAppearances）が割れた canonical を修復する。
 *
 * 例: 旧記録「一失」→ 訂正後 PA「三安」のように、打数は同じで安打系だけが変わるケース。
 *
 * Dry-run:
 *   npx tsx scripts/repair_official_record_corrections_from_pa.ts --year 2026
 * Write:
 *   npx tsx scripts/repair_official_record_corrections_from_pa.ts --year 2026 --write
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { hitBases, isAtBat } from "../lib/yahooGame/resultJaHitBases"
import { parseGameDateYmdFromCanonical } from "../lib/yahooGame/gameDateFromCanonical"

type Args = {
  year: string
  from: string
  to: string
  gameIds: Set<string> | null
  write: boolean
}

type Metrics = {
  ab: number
  h: number
  hr: number
  h2: number
  h3: number
  so: number
  bb: number
  hbp: number
  sh: number
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const out: Args = {
    year: "2026",
    from: "",
    to: "",
    gameIds: null,
    write: false,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--year" && args[i + 1]) out.year = args[++i]!
    else if (a === "--from" && args[i + 1]) out.from = args[++i]!
    else if (a === "--to" && args[i + 1]) out.to = args[++i]!
    else if (a === "--game-ids" && args[i + 1]) {
      out.gameIds = new Set(
        args[++i]!
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    } else if (a === "--write") {
      out.write = true
    }
  }
  return out
}

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function officialCorrectionSkipSet(year: string): Set<string> {
  const out = new Set<string>()
  const filePath = path.join(root, "_data", "official_record_corrections", year, "corrections.json")
  if (!fs.existsSync(filePath)) return out
  const payload = readJson(filePath)
  const corrections = Array.isArray(payload?.corrections) ? payload.corrections : []
  for (const correction of corrections) {
    const gameId = String(correction?.gameId ?? "").trim()
    if (!gameId) continue
    for (const target of correction?.batting ?? []) {
      const yahooPlayerId = String(target?.yahooPlayerId ?? "").trim()
      if (yahooPlayerId) out.add(`${gameId}:${yahooPlayerId}`)
    }
  }
  return out
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function inRange(ymd: string, args: Args): boolean {
  if (!ymd.startsWith(args.year)) return false
  if (args.from && ymd < args.from) return false
  if (args.to && ymd > args.to) return false
  return true
}

function compactPaResult(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\[[^\]]*\]/g, "")
}

function nonemptySlots(cells: readonly unknown[]): string[] {
  return cells
    .slice(14)
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
}

function metricsFromResults(results: readonly string[]): Metrics {
  const m: Metrics = { ab: 0, h: 0, hr: 0, h2: 0, h3: 0, so: 0, bb: 0, hbp: 0, sh: 0 }
  for (const r of results) {
    if (!r) continue
    if (/四球|敬遠|故意四/.test(r)) m.bb += 1
    if (/死球/.test(r)) m.hbp += 1
    if (/犠打|送りバント|セーフティスクイズ|スクイズ|犠野/.test(r)) m.sh += 1
    if (/三振/.test(r)) m.so += 1
    if (isAtBat(r)) m.ab += 1
    const bases = hitBases(r)
    if (bases > 0) m.h += 1
    if (bases === 2) m.h2 += 1
    if (bases === 3) m.h3 += 1
    if (bases === 4) m.hr += 1
  }
  return m
}

function cellInt(cells: readonly unknown[], i: number): number {
  const n = Number.parseInt(String(cells[i] ?? ""), 10)
  return Number.isFinite(n) ? n : 0
}

function setCellInt(cells: unknown[], i: number, value: number): void {
  cells[i] = String(value)
}

function patchSlotsPreservingColumns(cells: unknown[], replacementNonempty: readonly string[]): void {
  let j = 0
  for (let i = 14; i < cells.length; i++) {
    const current = String(cells[i] ?? "").trim()
    if (!current) continue
    cells[i] = replacementNonempty[j] ?? current
    j += 1
  }
}

function findBattingLine(doc: any, yahooPlayerId: string): any | null {
  const lines = doc?.domain?.battingLines
  if (!Array.isArray(lines)) return null
  return lines.find((line) => String(line?.yahooPlayerId ?? "").trim() === yahooPlayerId) ?? null
}

function applyLinePatch(line: any, replacementSlots: readonly string[], metrics: Metrics): void {
  line.ab = metrics.ab
  line.h = metrics.h
  line.hr = metrics.hr
  if (metrics.h2 > 0) line.h2 = metrics.h2
  else delete line.h2
  if (metrics.h3 > 0) line.h3 = metrics.h3
  else delete line.h3
  line.so = metrics.so
  line.bb = metrics.bb
  line.hbp = metrics.hbp
  line.sh = metrics.sh
  line.appearancePaSlotsJa = [...replacementSlots]
}

function main(): void {
  const args = parseArgs()
  const officialSkips = officialCorrectionSkipSet(args.year)
  const canonicalDir = path.join(root, "_data", "scraped_games", "canonical")
  const files = fs
    .readdirSync(canonicalDir)
    .filter((f) => f.endsWith(".json"))
    .sort()

  let scanned = 0
  let candidates = 0
  let repaired = 0
  const reports: string[] = []

  for (const file of files) {
    const gameId = file.replace(/\.json$/, "")
    if (args.gameIds && !args.gameIds.has(gameId)) continue

    const filePath = path.join(canonicalDir, file)
    const doc = readJson(filePath)
    const ymd = parseGameDateYmdFromCanonical(doc)
    if (!ymd || !inRange(ymd, args)) continue

    scanned += 1
    let changed = false
    const rows = Array.isArray(doc?.game?.statsPlayerLinkedRows) ? doc.game.statsPlayerLinkedRows : []
    const pas = Array.isArray(doc?.domain?.plateAppearances) ? doc.domain.plateAppearances : []

    for (const row of rows) {
      const yahooPlayerId = String(row?.yahooPlayerId ?? "").trim()
      if (!yahooPlayerId || !Array.isArray(row?.cells)) continue
      if (officialSkips.has(`${gameId}:${yahooPlayerId}`)) continue

      const rowSlots = nonemptySlots(row.cells)
      if (rowSlots.length === 0) continue
      const paResults = pas
        .filter((pa: any) => String(pa?.yahooBatterId ?? "").trim() === yahooPlayerId)
        .map((pa: any) => compactPaResult(pa?.resultSummaryJa))
        .filter(Boolean)

      if (paResults.length !== rowSlots.length) continue

      const rowMetrics = {
        ab: cellInt(row.cells, 3),
        h: cellInt(row.cells, 5),
        hr: cellInt(row.cells, 13),
      }
      const paMetrics = metricsFromResults(paResults)
      if (paMetrics.ab !== rowMetrics.ab) continue
      if (paMetrics.h === rowMetrics.h && paMetrics.hr === rowMetrics.hr) continue

      candidates += 1
      reports.push(
        `${args.write ? "repair" : "detect"} ${ymd} ${gameId} ${row.playerName ?? yahooPlayerId}: ` +
          `H ${rowMetrics.h}->${paMetrics.h}, HR ${rowMetrics.hr}->${paMetrics.hr}, ` +
          `slots "${rowSlots.join("/")}" -> "${paResults.join("/")}"`,
      )

      if (!args.write) continue

      patchSlotsPreservingColumns(row.cells, paResults)
      setCellInt(row.cells, 5, paMetrics.h)
      setCellInt(row.cells, 7, paMetrics.so)
      setCellInt(row.cells, 8, paMetrics.bb)
      setCellInt(row.cells, 9, paMetrics.hbp)
      setCellInt(row.cells, 10, paMetrics.sh)
      setCellInt(row.cells, 13, paMetrics.hr)

      const line = findBattingLine(doc, yahooPlayerId)
      if (line) applyLinePatch(line, paResults, paMetrics)
      changed = true
    }

    if (changed) {
      repaired += 1
      writeJson(filePath, doc)
    }
  }

  console.log(
    `[official-record-corrections] scanned=${scanned} candidates=${candidates} repairedGames=${repaired} mode=${
      args.write ? "write" : "dry-run"
    }`,
  )
  for (const line of reports) console.log(line)
}

main()
