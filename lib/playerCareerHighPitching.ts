import type { CareerHighBattingCard } from "@/lib/playerCareerHighBatting"
import type { CareerColumnDef, CareerDisplayRow } from "@/lib/playerCareerMergedDisplay"
import { formatCareerCell } from "@/lib/playerCareerMergedDisplay"
import { enrichCareerPitchingRow, ipToOuts } from "@/lib/careerPitchingEnrich"

type CareerHighPitchingColumn =
  | (CareerColumnDef & { kind: CareerColumnDef["kind"] })
  | { key: "wl"; label: "勝敗"; kind: "wl" }

/** 投手キャリアハイカード（表示順固定） */
const CAREER_HIGH_PITCHING_COLUMNS: CareerHighPitchingColumn[] = [
  { key: "era", label: "防御率", kind: "era" },
  { key: "wl", label: "勝敗", kind: "wl" },
  { key: "so", label: "奪三振", kind: "int" },
  { key: "k_bb_pct", label: "K-BB％", kind: "pctSigned" },
  { key: "k_pct", label: "K％", kind: "pct1" },
  { key: "whip", label: "WHIP", kind: "dec2" },
]

/** K-BB％で代表年度を決める階級（①→⑤、該当なしは全年） */
const KBB_CAREER_HIGH_TIERS: Array<{ match: (ip: number, games: number) => boolean }> = [
  { match: (ip, g) => ip >= 140 || g >= 40 },
  { match: (ip, g) => ip >= 120 && g >= 30 },
  { match: (ip, g) => ip >= 100 && g >= 25 },
  { match: (ip, g) => ip >= 70 && g >= 15 },
  { match: (ip, g) => ip >= 35 && g >= 10 },
]

function isSeasonRow(row: CareerDisplayRow): boolean {
  if (row.is_total || row.year === "通算") return false
  const y = Number(row.year)
  return Number.isFinite(y) && y > 0
}

function rowYearNumber(row: CareerDisplayRow): number {
  return Number(row.year ?? 0)
}

function rowIpInnings(row: CareerDisplayRow): number {
  const outs = ipToOuts(row.ip)
  return outs !== null ? outs / 3 : 0
}

function rowGames(row: CareerDisplayRow): number {
  const g = Number(row.games ?? NaN)
  return Number.isFinite(g) ? g : 0
}

function rowKbbPct(row: CareerDisplayRow): number {
  const enriched = enrichCareerPitchingRow(row)
  const k = Number(enriched.k_bb_pct ?? NaN)
  return Number.isFinite(k) ? k : -Infinity
}

function isBetterKbbRow(candidate: CareerDisplayRow, current: CareerDisplayRow): boolean {
  const kCand = rowKbbPct(candidate)
  const kCur = rowKbbPct(current)
  if (kCand !== kCur) return kCand > kCur
  const yCand = rowYearNumber(candidate)
  const yCur = rowYearNumber(current)
  if (yCand !== yCur) return yCand > yCur
  return rowIpInnings(candidate) > rowIpInnings(current)
}

function pickMaxKbbRow(candidates: CareerDisplayRow[]): CareerDisplayRow | null {
  let best: CareerDisplayRow | null = null
  for (const row of candidates) {
    if (!Number.isFinite(rowKbbPct(row))) continue
    if (best === null || isBetterKbbRow(row, best)) {
      best = row
    }
  }
  return best
}

/**
 * キャリアハイの基準年度 = 階級①〜⑤の順で K-BB％ 最大の年。
 * いずれにも該当がなければ全年。同率は新しい年 → IP が長い年。
 */
export function pickKbbBestCareerHighRow(rows: CareerDisplayRow[]): CareerDisplayRow | null {
  const seasonRows = rows.filter(isSeasonRow).map((r) => enrichCareerPitchingRow(r))

  for (const tier of KBB_CAREER_HIGH_TIERS) {
    const pool = seasonRows.filter((row) => tier.match(rowIpInnings(row), rowGames(row)))
    const best = pickMaxKbbRow(pool)
    if (best) return best
  }

  return pickMaxKbbRow(seasonRows)
}

export function formatCareerHighPitchingWinLoss(row: CareerDisplayRow): string {
  const w = row.wins
  const l = row.losses
  if (w == null && l == null) return "—"
  const wins = w != null && Number.isFinite(Number(w)) ? Math.round(Number(w)) : 0
  const losses = l != null && Number.isFinite(Number(l)) ? Math.round(Number(l)) : 0
  return `${wins}-${losses}`
}

function formatCareerHighPitchingCell(col: CareerHighPitchingColumn, row: CareerDisplayRow): string {
  if (col.kind === "wl") {
    return formatCareerHighPitchingWinLoss(row)
  }
  if (col.key === "so") {
    return formatCareerCell({ key: "so", label: "三振", kind: "int" }, row)
  }
  return formatCareerCell(col, row)
}

/** 基準年度行が未決定のとき（カード見出しのみ） */
export function buildCareerHighPitchingPlaceholderCards(): CareerHighBattingCard[] {
  return CAREER_HIGH_PITCHING_COLUMNS.map((col) => ({
    title: col.label,
    value: "—",
    year: "",
  }))
}

export function buildCareerHighPitchingCards(bestRow: CareerDisplayRow | null): CareerHighBattingCard[] {
  const row = bestRow ? enrichCareerPitchingRow(bestRow) : null
  return CAREER_HIGH_PITCHING_COLUMNS.map((col) => ({
    title: col.label,
    value: row ? formatCareerHighPitchingCell(col, row) : "—",
    year: "",
  }))
}

export type CareerHighPitchingBuildResult = {
  cards: CareerHighBattingCard[]
  seasonYear: number | null
}

export function buildCareerHighPitchingFromRows(rows: CareerDisplayRow[]): CareerHighPitchingBuildResult {
  const best = pickKbbBestCareerHighRow(rows)
  const y = best ? rowYearNumber(best) : 0
  return {
    cards: buildCareerHighPitchingCards(best),
    seasonYear: y > 0 ? y : null,
  }
}

export function formatCareerHighPitchingHeading(seasonYear: number | null): string {
  if (seasonYear == null) return "キャリアハイの投手成績"
  return `キャリアハイの投手成績（${seasonYear}年）`
}
