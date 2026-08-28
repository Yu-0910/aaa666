import fs from "node:fs"
import path from "node:path"
import { getProjectRoot } from "@/lib/projectRoot"
import { readFsTextWithLegacyEncodings } from "@/lib/ranking/readFsTextWithLegacyEncodings"

const JP_CHAR_RE = /[\u3040-\u30ff\u3400-\u9fff]/
const ABBREVIATED_ROMAN_RE = /^[A-Z]\.[A-Za-z][A-Za-z'.-]*$/

let cachedRomanByNpbId: Map<string, string> | null = null

function normalizeNpbId(id: string | undefined): string {
  return String(id ?? "").replace(/\D/g, "").replace(/^0+/, "") || ""
}

function parseCsvSimple(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const headerLine = lines[0].replace(/^\ufeff/, "")
  const headers = headerLine.split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""))
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values: string[] = []
    let current = ""
    let inQuotes = false
    for (let j = 0; j < line.length; j++) {
      const c = line[j]
      if (c === '"') inQuotes = !inQuotes
      else if (c === "," && !inQuotes) {
        values.push(current.trim())
        current = ""
      } else current += c
    }
    values.push(current.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? ""
    })
    rows.push(row)
  }
  return rows
}

function candidateScore(value: string): number {
  const v = value.trim()
  if (!v) return Number.NEGATIVE_INFINITY
  let score = v.length
  if (!JP_CHAR_RE.test(v)) score += 1000
  if (v.includes(" ")) score += 50
  if (ABBREVIATED_ROMAN_RE.test(v)) score -= 200
  if (/^[A-Za-z'.\-\s]+$/.test(v)) score += 100
  return score
}

function shouldReplaceRoman(current: string | undefined, next: string): boolean {
  const a = String(current ?? "").trim()
  const b = next.trim()
  if (!b) return false
  if (!a) return true
  return candidateScore(b) > candidateScore(a)
}

function listRomanSourceCsvPaths(projectRoot: string): string[] {
  const dirs = [
    path.join(projectRoot, "_data", "master_csv_calculated"),
    path.join(projectRoot, "_data", "master_csv"),
  ]
  const csvPaths: string[] = []
  const seen = new Set<string>()
  for (const dir of dirs) {
    let names: string[] = []
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!/^(batting|pitching)_\d{4}_(CL|PL)_(from_master|qualifying)\.csv$/i.test(name)) continue
      const full = path.join(dir, name)
      if (seen.has(full)) continue
      seen.add(full)
      csvPaths.push(full)
    }
  }
  return csvPaths
}

function buildRomanByNpbIdMap(): Map<string, string> {
  if (cachedRomanByNpbId) return cachedRomanByNpbId
  const map = new Map<string, string>()
  const projectRoot = getProjectRoot()
  for (const csvPath of listRomanSourceCsvPaths(projectRoot)) {
    const content = readFsTextWithLegacyEncodings(csvPath)
    if (!content) continue
    for (const row of parseCsvSimple(content)) {
      const npbPlayerId = normalizeNpbId(
        row["player_id"] ?? row["npbPlayerId"] ?? row["npb_player_id"] ?? "",
      )
      const roman = String(
        row["player_name_en"] ?? row["romanName"] ?? row["name_en"] ?? "",
      ).trim()
      if (!npbPlayerId || !roman) continue
      if (shouldReplaceRoman(map.get(npbPlayerId), roman)) {
        map.set(npbPlayerId, roman)
      }
    }
  }
  cachedRomanByNpbId = map
  return map
}

export function preferredRomanNameFromRankingSource(npbPlayerId: string | undefined): string {
  const id = normalizeNpbId(npbPlayerId)
  if (!id) return ""
  return buildRomanByNpbIdMap().get(id) ?? ""
}
