/**
 * NPB公式の「公式記録の訂正に関するお知らせ」を canonical に反映する。
 *
 * この修復は個人ページ、ランキング、順位表、トップ表示、投手/捕手/対戦/状況別など
 * canonical 由来の全派生を再生成する前に実行する。
 *
 *   npx tsx scripts/apply_npb_official_record_corrections.ts --year 2026
 *   npx tsx scripts/apply_npb_official_record_corrections.ts --year 2026 --write
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { hitBases } from "../lib/yahooGame/resultJaHitBases"

type SetMap = Record<string, number>
type CorrectionTarget = {
  yahooPlayerId: string
  playerName?: string
  set?: SetMap
  replaceSlots?: { from: string; to: string }
}
type Correction = {
  id: string
  gameId: string
  batting?: CorrectionTarget[]
  pitching?: CorrectionTarget[]
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

function parseArgs(): { year: string; write: boolean } {
  const out = { year: "2026", write: false }
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) out.year = args[++i]!
    else if (args[i] === "--write") out.write = true
  }
  return out
}

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function setIfChanged(target: any, key: string, value: number): boolean {
  if (!target || typeof target !== "object") return false
  if (target[key] === value) return false
  target[key] = value
  return true
}

function statCellIndex(key: string): number | null {
  const map: Record<string, number> = {
    ab: 3,
    r: 4,
    h: 5,
    rbi: 6,
    so: 7,
    bb: 8,
    hbp: 9,
    sh: 10,
    sb: 11,
    e: 12,
    hr: 13,
  }
  return map[key] ?? null
}

function replaceSlotsInCells(cells: unknown[], from: string, to: string): boolean {
  let changed = false
  for (let i = 14; i < cells.length; i++) {
    if (String(cells[i] ?? "").trim() !== from) continue
    cells[i] = to
    changed = true
  }
  return changed
}

function replaceSlotsInLine(line: any, from: string, to: string): boolean {
  const slots = line?.appearancePaSlotsJa
  if (!Array.isArray(slots)) return false
  let changed = false
  for (let i = 0; i < slots.length; i++) {
    if (String(slots[i] ?? "").trim() !== from) continue
    slots[i] = to
    changed = true
  }
  return changed
}

function refreshExtraBaseFields(line: any): void {
  const slots = Array.isArray(line?.appearancePaSlotsJa) ? line.appearancePaSlotsJa : []
  let h2 = 0
  let h3 = 0
  let hr = 0
  for (const raw of slots) {
    const bases = hitBases(String(raw ?? ""))
    if (bases === 2) h2 += 1
    if (bases === 3) h3 += 1
    if (bases === 4) hr += 1
  }
  if (h2 > 0) line.h2 = h2
  else delete line.h2
  if (h3 > 0) line.h3 = h3
  else delete line.h3
  if (hr > 0 || typeof line.hr === "number") line.hr = hr
}

function applyBattingCorrection(doc: any, target: CorrectionTarget): string[] {
  const changes: string[] = []
  const rows = Array.isArray(doc?.game?.statsPlayerLinkedRows) ? doc.game.statsPlayerLinkedRows : []
  const row = rows.find((r: any) => String(r?.yahooPlayerId ?? "").trim() === target.yahooPlayerId)
  if (row?.cells && target.replaceSlots) {
    if (replaceSlotsInCells(row.cells, target.replaceSlots.from, target.replaceSlots.to)) {
      changes.push(`stats slots ${target.playerName ?? target.yahooPlayerId}: ${target.replaceSlots.from}->${target.replaceSlots.to}`)
    }
  }
  if (row?.cells && target.set) {
    for (const [key, value] of Object.entries(target.set)) {
      const idx = statCellIndex(key)
      if (idx == null) continue
      if (String(row.cells[idx] ?? "") !== String(value)) {
        row.cells[idx] = String(value)
        changes.push(`stats ${target.playerName ?? target.yahooPlayerId}.${key}=${value}`)
      }
    }
  }

  const lines = Array.isArray(doc?.domain?.battingLines) ? doc.domain.battingLines : []
  const line = lines.find((l: any) => String(l?.yahooPlayerId ?? "").trim() === target.yahooPlayerId)
  if (line && target.replaceSlots) {
    if (replaceSlotsInLine(line, target.replaceSlots.from, target.replaceSlots.to)) {
      changes.push(`line slots ${target.playerName ?? target.yahooPlayerId}: ${target.replaceSlots.from}->${target.replaceSlots.to}`)
      refreshExtraBaseFields(line)
    }
  }
  if (line && target.set) {
    for (const [key, value] of Object.entries(target.set)) {
      if (setIfChanged(line, key, value)) changes.push(`line ${target.playerName ?? target.yahooPlayerId}.${key}=${value}`)
    }
  }
  return changes
}

function applyPitchingCorrection(doc: any, target: CorrectionTarget): string[] {
  const changes: string[] = []
  const lines = Array.isArray(doc?.domain?.pitchingLines) ? doc.domain.pitchingLines : []
  const line = lines.find((l: any) => String(l?.yahooPlayerId ?? "").trim() === target.yahooPlayerId)
  if (!line || !target.set) return changes
  for (const [key, value] of Object.entries(target.set)) {
    if (setIfChanged(line, key, value)) changes.push(`pitching ${target.playerName ?? target.yahooPlayerId}.${key}=${value}`)
  }
  return changes
}

function main(): void {
  const { year, write } = parseArgs()
  const correctionsPath = path.join(root, "_data", "official_record_corrections", year, "corrections.json")
  const payload = readJson(correctionsPath)
  const corrections = Array.isArray(payload?.corrections) ? (payload.corrections as Correction[]) : []
  let changedGames = 0
  let changeCount = 0

  for (const correction of corrections) {
    const filePath = path.join(root, "_data", "scraped_games", "canonical", `${correction.gameId}.json`)
    const doc = readJson(filePath)
    const changes: string[] = []
    for (const target of correction.batting ?? []) changes.push(...applyBattingCorrection(doc, target))
    for (const target of correction.pitching ?? []) changes.push(...applyPitchingCorrection(doc, target))

    if (changes.length === 0) {
      console.log(`[npb-official-corrections] ok ${correction.id}: no changes needed`)
      continue
    }
    changedGames += 1
    changeCount += changes.length
    console.log(`[npb-official-corrections] ${write ? "apply" : "detect"} ${correction.id}`)
    for (const change of changes) console.log(`  - ${change}`)
    if (write) writeJson(filePath, doc)
  }

  console.log(
    `[npb-official-corrections] mode=${write ? "write" : "dry-run"} corrections=${corrections.length} changedGames=${changedGames} changes=${changeCount}`,
  )
}

main()
