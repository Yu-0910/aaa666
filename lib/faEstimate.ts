export type FaEstimateStatus = "acquired" | "possible_this_season" | "estimate" | "unknown"

export type FaEstimateDomestic = {
  /** facounter の「国内FAまで」または通算出場成績からの概算 */
  source: "facounter" | "career"
  /** 取得済／今季可能／推定／不明 */
  status: FaEstimateStatus
  /** 残年（facounter 表から取れたときのみ） */
  remainYears: number | null
  /** 残日（facounter 表から取れたときのみ） */
  remainDays: number | null
  /**
   * FA取得年（推定）。取得済や不明の場合は null。
   * “暦日”ではなく “シーズン単位の上限モデル”による概算年。
   */
  estimatedYear: number | null
  /** プロフィール欄セル表示（`2028年` / `取得済` / `—`） */
  displayValue: string
  /** facounter の備考欄等（任意） */
  note?: string
}

export type PlayerFaEstimatesByNpbId = {
  schemaVersion: "player-fa-estimates-v1"
  seasonYear: string
  generatedAt: string
  byNpbPlayerId: Record<string, { domesticFa: FaEstimateDomestic | null }>
}

export type FaEstimateYearCalcInput = {
  /** 例: 2026 */
  seasonYear: number
  /** 例: 125（6月上旬の仮置き） */
  remainingDaysThisSeason: number
  /** NPB の1年換算（既定 145） */
  daysPerServiceYear?: number
}

/**
 * facounter の「国内FAまで」(残年・残日) を、シーズン単位の概算「取得年」に変換する。
 *
 * - 1年=145日として総日数に変換し、今季残り日数で割って次年度以降へ繰り越す上限モデル。
 * - 特例措置などで実際とズレうるため、表示は「推定」前提。
 */
export function estimateDomesticFaYearFromRemain(
  remainYears: number,
  remainDays: number,
  input: FaEstimateYearCalcInput
): number {
  const daysPer = input.daysPerServiceYear ?? 145
  const seasonYear = Math.trunc(input.seasonYear)
  const remThis = Math.max(0, Math.trunc(input.remainingDaysThisSeason))
  const totalDays = Math.max(0, Math.trunc(remainYears) * daysPer + Math.trunc(remainDays))

  if (totalDays <= remThis) return seasonYear
  const afterThis = totalDays - remThis
  const fullYearsAfter = Math.ceil(afterThis / daysPer)
  return seasonYear + fullYearsAfter
}

/** `YYYY年` 形式（例: 2028 → `2028年`） */
export function formatFaEstimateYearJa(year: number): string {
  return `${Math.trunc(year)}年`
}

/** プロフィール欄セル用の表示文字列 */
export function formatFaEstimateDisplayValue(
  status: FaEstimateStatus,
  estimatedYear: number | null,
  seasonYear: number
): string {
  if (status === "acquired") return "取得済"
  if (status === "unknown") return "—"
  const y = estimatedYear ?? seasonYear
  if (y > 0) return formatFaEstimateYearJa(y)
  return "—"
}

export type FacounterDomesticFaParsed =
  | { status: "acquired" | "possible_this_season"; remainYears: null; remainDays: null }
  | { status: "estimate"; remainYears: number; remainDays: number }
  | { status: "unknown"; remainYears: null; remainDays: null }

/** facounter パース行 → 派生JSON用 `domesticFa` */
export function buildDomesticFaFromFacounterParsed(
  parsed: FacounterDomesticFaParsed,
  input: FaEstimateYearCalcInput,
  note?: string
): FaEstimateDomestic {
  const seasonYear = Math.trunc(input.seasonYear)
  let status: FaEstimateStatus = parsed.status
  let remainYears: number | null = null
  let remainDays: number | null = null
  let estimatedYear: number | null = null

  if (parsed.status === "acquired") {
    status = "acquired"
  } else if (parsed.status === "possible_this_season") {
    status = "possible_this_season"
    estimatedYear = seasonYear
  } else if (parsed.status === "estimate") {
    status = "estimate"
    remainYears = parsed.remainYears
    remainDays = parsed.remainDays
    estimatedYear = estimateDomesticFaYearFromRemain(parsed.remainYears, parsed.remainDays, input)
  } else {
    status = "unknown"
  }

  return {
    source: "facounter",
    status,
    remainYears,
    remainDays,
    estimatedYear,
    displayValue: formatFaEstimateDisplayValue(status, estimatedYear, seasonYear),
    ...(note?.trim() ? { note: note.trim() } : {}),
  }
}

