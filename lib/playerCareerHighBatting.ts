import type { CareerColumnDef, CareerDisplayRow } from "@/lib/playerCareerMergedDisplay"
import { formatCareerCell } from "@/lib/playerCareerMergedDisplay"

/** キャリアハイカード（OPS 最高年度の成績を表示） */
export type CareerHighBattingCard = {
  title: string
  value: string
  year: string
}

const CAREER_HIGH_BAT_COLUMNS: CareerColumnDef[] = [
  { key: "ops", label: "OPS", kind: "slash3" },
  { key: "avg", label: "打率", kind: "slash3" },
  { key: "hr", label: "本塁", kind: "int" },
  { key: "rbi", label: "打点", kind: "int" },
  { key: "hits", label: "安打", kind: "int" },
  { key: "rc", label: "RC", kind: "dec2" },
]

function isSeasonRow(row: CareerDisplayRow): boolean {
  if (row.is_total || row.year === "通算") return false
  const y = Number(row.year)
  return Number.isFinite(y) && y > 0
}

function rowYearNumber(row: CareerDisplayRow): number {
  return Number(row.year ?? 0)
}

function rowOps(row: CareerDisplayRow): number {
  const ops = Number(row.ops ?? NaN)
  return Number.isFinite(ops) ? ops : -Infinity
}

function rowPa(row: CareerDisplayRow): number {
  const pa = Number(row.pa ?? NaN)
  return Number.isFinite(pa) ? pa : 0
}

function qualifyingBattingRows(rows: CareerDisplayRow[]): CareerDisplayRow[] {
  const qualified = rows.filter((row) => rowPa(row) >= 350)
  return qualified.length > 0 ? qualified : rows
}

/**
 * キャリアハイの基準年度 = 350打席以上の年が1つでもあれば、その年だけから OPS 最大の年を選ぶ。
 * 350打席到達年が一度もない選手は全年度を対象にする。同率の場合はより新しい年度を採用。
 */
export function pickOpsBestCareerHighRow(rows: CareerDisplayRow[]): CareerDisplayRow | null {
  const pool = qualifyingBattingRows(rows)
  let best: CareerDisplayRow | null = null
  let bestOps = -Infinity

  for (const row of pool) {
    if (!isSeasonRow(row)) continue
    const ops = rowOps(row)
    const y = rowYearNumber(row)
    if (best === null || ops > bestOps || (ops === bestOps && y > rowYearNumber(best))) {
      best = row
      bestOps = ops
    }
  }

  return best
}

export function careerHighBattingSeasonYear(rows: CareerDisplayRow[]): number | null {
  const bestRow = pickOpsBestCareerHighRow(rows)
  if (!bestRow) return null
  const y = rowYearNumber(bestRow)
  return y > 0 ? y : null
}

export function formatCareerHighBattingHeading(seasonYear: number | null): string {
  if (seasonYear == null) return "キャリアハイの打撃成績"
  return `キャリアハイの打撃成績（${seasonYear}年）`
}

export function buildCareerHighBattingCards(rows: CareerDisplayRow[]): CareerHighBattingCard[] {
  const bestRow = pickOpsBestCareerHighRow(rows)

  return CAREER_HIGH_BAT_COLUMNS.map((col) => ({
    title: col.label === "本塁" ? "本塁打" : col.label,
    value: bestRow ? formatCareerCell(col, bestRow) : "—",
    year: "",
  }))
}
