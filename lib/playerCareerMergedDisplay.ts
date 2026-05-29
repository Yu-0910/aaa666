import { formatEra, formatStat } from "@/lib/formatStat"

export type CareerDisplayRow = Record<string, unknown> & {
  year?: number | string
  is_total?: boolean
  salary_yen?: number | null
}

export type CareerColumnDef = {
  key: string
  label: string
  kind: "slash3" | "int" | "pct1" | "dec2" | "dec3" | "era" | "ip" | "pctSigned" | "wpct"
}

/** Phase 7 §9: 野手36指標（順番固定） */
export const BATTING_STAT_COLUMNS: CareerColumnDef[] = [
  { key: "ops", label: "OPS", kind: "slash3" },
  { key: "avg", label: "打率", kind: "slash3" },
  { key: "hits", label: "安打", kind: "int" },
  { key: "hr", label: "本塁", kind: "int" },
  { key: "rbi", label: "打点", kind: "int" },
  { key: "games", label: "試合", kind: "int" },
  { key: "pa", label: "打席", kind: "int" },
  { key: "ab", label: "打数", kind: "int" },
  { key: "singles", label: "単打", kind: "int" },
  { key: "doubles", label: "二塁", kind: "int" },
  { key: "triples", label: "三塁", kind: "int" },
  { key: "runs", label: "得点", kind: "int" },
  { key: "obp", label: "出塁", kind: "slash3" },
  { key: "slg", label: "長打", kind: "slash3" },
  { key: "bb", label: "四球", kind: "int" },
  { key: "ibb", label: "敬遠", kind: "int" },
  { key: "hbp", label: "死球", kind: "int" },
  { key: "so", label: "三振", kind: "int" },
  { key: "tb", label: "塁打", kind: "int" },
  { key: "sb", label: "盗塁", kind: "int" },
  { key: "cs", label: "盗塁死", kind: "int" },
  { key: "sh", label: "犠打", kind: "int" },
  { key: "sf", label: "犠飛", kind: "int" },
  { key: "gidp", label: "併殺", kind: "int" },
  { key: "isop", label: "IsoP", kind: "dec3" },
  { key: "isod", label: "IsoD", kind: "dec3" },
  { key: "bb_pct", label: "BB%", kind: "pct1" },
  { key: "k_pct", label: "K%", kind: "pct1" },
  { key: "bb_k", label: "BB/K", kind: "dec2" },
  { key: "rc", label: "RC", kind: "dec2" },
  { key: "xr", label: "XR", kind: "dec2" },
  { key: "babip", label: "BABIP", kind: "dec3" },
  { key: "seca", label: "SecA", kind: "dec3" },
  { key: "ta", label: "TA", kind: "dec3" },
  { key: "noi", label: "NOI", kind: "dec2" },
  { key: "gpa", label: "GPA", kind: "dec3" },
]

/** Phase 7 §9.1: 投手25指標（順番固定） */
export const PITCHING_STAT_COLUMNS: CareerColumnDef[] = [
  { key: "era", label: "ERA", kind: "era" },
  { key: "k_bb_pct", label: "K-BB%", kind: "pctSigned" },
  { key: "whip", label: "WHIP", kind: "dec3" },
  { key: "wins", label: "W", kind: "int" },
  { key: "losses", label: "L", kind: "int" },
  { key: "games", label: "G", kind: "int" },
  { key: "ip", label: "IP", kind: "ip" },
  { key: "saves", label: "SV", kind: "int" },
  { key: "bf", label: "BF", kind: "int" },
  { key: "hits_allowed", label: "H", kind: "int" },
  { key: "hr_allowed", label: "HR", kind: "int" },
  { key: "bb", label: "BB", kind: "int" },
  { key: "ibb", label: "IBB", kind: "int" },
  { key: "hbp", label: "HBP", kind: "int" },
  { key: "so", label: "SO", kind: "int" },
  { key: "er", label: "ER", kind: "int" },
  { key: "r", label: "R", kind: "int" },
  { key: "holds", label: "HOLD", kind: "int" },
  { key: "hp", label: "HP", kind: "int" },
  { key: "cg", label: "CG", kind: "int" },
  { key: "sho", label: "SHO", kind: "int" },
  { key: "wpct", label: "WPCT", kind: "wpct" },
  { key: "k_pct", label: "K%", kind: "pct1" },
  { key: "bb_pct", label: "BB%", kind: "pct1" },
  { key: "wp", label: "WP", kind: "int" },
]

const BATTING_SPLIT_AT = 17

export function splitBattingColumns(): {
  left: CareerColumnDef[]
  right: CareerColumnDef[]
} {
  return {
    left: BATTING_STAT_COLUMNS.slice(0, BATTING_SPLIT_AT),
    right: BATTING_STAT_COLUMNS.slice(BATTING_SPLIT_AT),
  }
}

const PITCHING_SPLIT_AT = 13

export function splitPitchingColumns(): {
  left: CareerColumnDef[]
  right: CareerColumnDef[]
} {
  return {
    left: PITCHING_STAT_COLUMNS.slice(0, PITCHING_SPLIT_AT),
    right: PITCHING_STAT_COLUMNS.slice(PITCHING_SPLIT_AT),
  }
}

function parseBirthYear(raw: string): number | null {
  const m = String(raw || "").match(/^(\d{4})年/)
  if (!m) return null
  const y = Number(m[1])
  return Number.isFinite(y) ? y : null
}

export function careerYearLabel(row: CareerDisplayRow): string {
  if (row.year === "通算" || row.is_total) return "通算"
  const y = row.year
  if (typeof y === "number" && Number.isFinite(y)) return String(y)
  return String(y ?? "")
}

export function careerAgeAtYear(birthRaw: string, row: CareerDisplayRow): string {
  if (row.is_total || row.year === "通算") return "—"
  const birthY = parseBirthYear(birthRaw)
  const statY = typeof row.year === "number" ? row.year : Number(row.year)
  if (birthY === null || !Number.isFinite(statY)) return "—"
  return String(statY - birthY)
}

export function formatSalaryManFromRow(row: CareerDisplayRow): string {
  if (row.is_total || row.year === "通算") return "—"
  const yen = row.salary_yen
  if (yen == null || !Number.isFinite(Number(yen)) || Number(yen) <= 0) return "—"
  return Math.round(Number(yen) / 10000).toLocaleString()
}

function battingSingles(row: CareerDisplayRow): number | null {
  const s = row.singles
  if (s != null && Number.isFinite(Number(s))) return Number(s)
  const hits = Number(row.hits ?? NaN)
  const d = Number(row.doubles ?? 0)
  const t = Number(row.triples ?? 0)
  const hr = Number(row.hr ?? 0)
  if (!Number.isFinite(hits)) return null
  return Math.max(0, hits - d - t - hr)
}

/** 通算表の列ラベル → ランキング `formatStat` 用ラベル */
const CAREER_FORMAT_LABEL: Record<string, string> = {
  本塁: "本塁打",
  WPCT: "勝率",
  W: "勝利",
  L: "敗戦",
  SV: "セーブ",
  HOLD: "HLD",
  HP: "ＨＰ",
  CG: "完投",
  SHO: "完封",
}

function careerMetricFormatLabel(col: CareerColumnDef): string {
  return CAREER_FORMAT_LABEL[col.label] ?? col.label
}

/** ランキングと同じルールで表示（欠損は em dash） */
function formatRankingStat(metricLabel: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  const s = formatStat(metricLabel, value)
  return s === "-" ? "—" : s
}

export function formatCareerCell(col: CareerColumnDef, row: CareerDisplayRow): string {
  if (col.key === "singles") {
    const s = battingSingles(row)
    if (s === null) return "—"
    return formatRankingStat("単打", s)
  }

  if (col.kind === "ip") {
    const s = String(row[col.key] ?? "").trim()
    return s || "—"
  }

  if (col.key === "era" || col.label === "ERA") {
    return formatEra(row[col.key])
  }

  return formatRankingStat(careerMetricFormatLabel(col), row[col.key])
}

export function appendCareerTotalRow(
  rows: CareerDisplayRow[],
  total: CareerDisplayRow | null | undefined,
): CareerDisplayRow[] {
  const out = [...rows]
  if (total && Object.keys(total).length > 0) {
    out.push({ ...total, year: "通算", is_total: true })
  }
  return out
}
