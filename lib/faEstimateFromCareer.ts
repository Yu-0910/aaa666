import fs from "fs"
import path from "path"
import {
  estimateDomesticFaYearFromRemain,
  formatFaEstimateDisplayValue,
  type FaEstimateDomestic,
  type FaEstimateYearCalcInput,
} from "@/lib/faEstimate"

/** 国内FA（一軍登録9年）の概算しきい値。facounter と同じ 1年=145日 */
export const DOMESTIC_FA_FIRST_TEAM_DAYS_REQUIRED = 9 * 145

/** facounter 未掲載で通算出場成績から個別推定する選手 */
export const FA_ESTIMATE_FROM_CAREER_NPB_IDS = new Set([
  "41945152", // 佐藤 龍月
  "21925157", // 荘司 康誠
  "93295157", // Ｈ．メヒア
])

/**
 * 2026シーズン分の補完（マスタCSV未収録時）。
 * NPB公式通算登板から career_from_master の年度合計を差し引いた値（2026-06時点）。
 */
export const FA_CAREER_GAMES_2026_SUPPLEMENT: Record<string, { pitching?: number; batting?: number }> = {
  "21925157": { pitching: 9 },
  "93295157": { pitching: 18 },
}

type CareerGamesRow = { year: number; games?: number }

type CareerFromMasterFile = {
  career_batting?: { rows: CareerGamesRow[] }
  career_pitching?: { rows: CareerGamesRow[] } | null
}

/** 登板・試合出場1回あたりの一軍登録日数の概算係数（facounter実績に合わせた下限モデル） */
const DAYS_PER_GAME_ESTIMATE = 2.8
const SEASON_FLOOR_DAYS = 45

function seasonGamesByYear(pitching: CareerGamesRow[], batting: CareerGamesRow[]): Map<number, number> {
  const byYear = new Map<number, number>()
  for (const rows of [pitching, batting]) {
    for (const r of rows) {
      const y = Number(r.year)
      if (!Number.isFinite(y)) continue
      const g = Math.max(0, Math.trunc(Number(r.games) || 0))
      byYear.set(y, Math.max(byYear.get(y) ?? 0, g))
    }
  }
  return byYear
}

function estimatedFirstTeamDaysForSeasonGames(games: number): number {
  if (games <= 0) return 0
  return Math.min(145, Math.round(games * DAYS_PER_GAME_ESTIMATE + SEASON_FLOOR_DAYS))
}

function remainFromAccumulatedDays(accumulatedDays: number): { remainYears: number; remainDays: number } {
  const remain = Math.max(0, DOMESTIC_FA_FIRST_TEAM_DAYS_REQUIRED - Math.max(0, accumulatedDays))
  return { remainYears: Math.floor(remain / 145), remainDays: remain % 145 }
}

/** 一軍出場実績がほぼ無い入団直後選手（プロ在籍年のみ） */
function accumulatedDaysForProOnlyRookie(proSeasons: number): number {
  return Math.min(DOMESTIC_FA_FIRST_TEAM_DAYS_REQUIRED - 1, Math.max(0, proSeasons) * 55)
}

export function loadCareerFromMasterJson(root: string, npbId: string): CareerFromMasterFile | null {
  const p = path.join(root, "_data", "derived", "player_profile", "career_from_master", `${npbId}.json`)
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, "utf8")) as CareerFromMasterFile
}

export function accumulatedFirstTeamDaysFromCareerFile(
  career: CareerFromMasterFile,
  seasonYear: number,
  npbId: string
): number {
  const pitching = career.career_pitching?.rows ?? []
  const batting = career.career_batting?.rows ?? []
  const byYear = seasonGamesByYear(pitching, batting)

  const sup = FA_CAREER_GAMES_2026_SUPPLEMENT[npbId]
  if (sup) {
    const g = Math.max(sup.pitching ?? 0, sup.batting ?? 0, byYear.get(seasonYear) ?? 0)
    if (g > 0) byYear.set(seasonYear, g)
  }

  let total = 0
  for (const g of byYear.values()) total += estimatedFirstTeamDaysForSeasonGames(g)
  return total
}

/**
 * 通算の出場成績（年度別試合・登板数）から国内FAまでの残りを概算し、表示用オブジェクトを返す。
 */
export function buildDomesticFaFromCareer(
  npbId: string,
  input: FaEstimateYearCalcInput,
  root: string
): FaEstimateDomestic | null {
  const career = loadCareerFromMasterJson(root, npbId)
  if (!career) return null

  const seasonYear = Math.trunc(input.seasonYear)
  let accumulated = accumulatedFirstTeamDaysFromCareerFile(career, seasonYear, npbId)

  if (npbId === "41945152" && accumulated === 0) {
    accumulated = accumulatedDaysForProOnlyRookie(2)
  }

  const { remainYears, remainDays } = remainFromAccumulatedDays(accumulated)
  const note = "通算出場成績から推定"

  if (remainYears === 0 && remainDays === 0) {
    return {
      source: "career",
      status: "acquired",
      remainYears: null,
      remainDays: null,
      estimatedYear: null,
      displayValue: formatFaEstimateDisplayValue("acquired", null, seasonYear),
      note,
    }
  }

  const estimatedYear = estimateDomesticFaYearFromRemain(remainYears, remainDays, input)
  return {
    source: "career",
    status: "estimate",
    remainYears,
    remainDays,
    estimatedYear,
    displayValue: formatFaEstimateDisplayValue("estimate", estimatedYear, seasonYear),
    note,
  }
}
