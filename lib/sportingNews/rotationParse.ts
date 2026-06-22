import { teamCodeFromShort } from "@/lib/standings/teamCodes"
import type { SportingNewsRotationRow } from "@/lib/sportingNews/types"

const EMPTY_PITCHER_MARKERS = new Set(["", "ー", "―", "－", "-", "—", "未定", " ", "\u00a0"])

function stripHtmlToText(fragment: string): string {
  return fragment
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeCellText(raw: string): string {
  return stripHtmlToText(raw).replace(/\u00a0/g, " ").trim()
}

function isEmptyPitcherCell(text: string): boolean {
  const t = text.trim()
  return EMPTY_PITCHER_MARKERS.has(t)
}

/** `6月14日（日）` → `{ month: 6, day: 14 }` */
export function parseJapaneseScheduleDateCell(
  cell: string,
  seasonYear: string,
): { dateJst: string } | null {
  const text = normalizeCellText(cell)
  const m = text.match(/^(\d{1,2})月(\d{1,2})日/)
  if (!m) return null
  const month = parseInt(m[1]!, 10)
  const day = parseInt(m[2]!, 10)
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null
  const year = parseInt(seasonYear, 10)
  if (!Number.isFinite(year)) return null
  const dateJst = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return { dateJst }
}

function extractRotationForecastTableHtml(html: string): string | null {
  const headingRe =
    /<h2[^>]*>\s*[^<]*先発ローテーション投手予想[^<]*<\/h2>/gi
  let match: RegExpExecArray | null
  while ((match = headingRe.exec(html))) {
    const headingText = stripHtmlToText(match[0] ?? "")
    if (headingText.includes("候補")) continue
    const after = html.slice(match.index! + match[0]!.length)
    const tableMatch = after.match(/<table\b[\s\S]*?<\/table>/i)
    if (tableMatch) return tableMatch[0]!
  }
  return null
}

function parseTableRows(tableHtml: string, seasonYear: string): {
  rows: SportingNewsRotationRow[]
  warnings: string[]
} {
  const rows: SportingNewsRotationRow[] = []
  const warnings: string[] = []
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let tr: RegExpExecArray | null
  while ((tr = trRe.exec(tableHtml))) {
    const cells: string[] = []
    const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
    let td: RegExpExecArray | null
    while ((td = tdRe.exec(tr[1]!))) {
      cells.push(normalizeCellText(td[1]!))
    }
    if (cells.length < 1) continue
    const first = cells[0] ?? ""
    if (first.includes("月") && first.includes("日")) {
      // date row
    } else if (/投手名|2025|2026|成績/.test(first)) {
      continue
    } else {
      continue
    }

    const parsedDate = parseJapaneseScheduleDateCell(first, seasonYear)
    if (!parsedDate) {
      warnings.push(`日付セルを解釈できません: "${first}"`)
      continue
    }

    const pitcherRaw = cells[1] ?? ""
    const opponentRaw = cells[2] ?? ""
    const pitcherNameJa = isEmptyPitcherCell(pitcherRaw) ? null : pitcherRaw
    const opponentTeamShort = isEmptyPitcherCell(opponentRaw) ? null : opponentRaw
    const opponentTeamCode =
      opponentTeamShort != null ? teamCodeFromShort(opponentTeamShort) : null

    rows.push({
      dateJst: parsedDate.dateJst,
      pitcherNameJa,
      opponentTeamShort,
      opponentTeamCode,
    })
  }
  return { rows, warnings }
}

export function parseSportingNewsRotationHtml(
  html: string,
  seasonYear: string,
): { rows: SportingNewsRotationRow[]; warnings: string[] } {
  const tableHtml = extractRotationForecastTableHtml(html)
  if (!tableHtml) {
    return {
      rows: [],
      warnings: ["先発ローテーション投手予想テーブルが見つかりません"],
    }
  }
  return parseTableRows(tableHtml, seasonYear)
}
