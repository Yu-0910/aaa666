/**
 * 一括取得済み canonical から球団別「取得試合数」を集計（Phase 1 / Phase 0 改定 SSOT）。
 */

import type { CanonicalGameDocument } from "./types"
import { parseGameDateYmdFromCanonical } from "./gameDateFromCanonical"
import {
  leagueBucketForTeamShort,
  rosterTeamToRankingShort,
} from "./canonicalPitchingSeasonAgg"

export type TeamGamesByLeague = {
  CL: Record<string, number>
  PL: Record<string, number>
}

export function isCancelledCanonicalGame(doc: CanonicalGameDocument): boolean {
  const miss = doc.game?.missingOrPartial ?? []
  return miss.some((s) => String(s).includes("game cancelled"))
}

/** 試合日が JST 今日以降ならカウントしない（未消化扱い） */
export function isFutureOrTodayGameYmd(ymd: string): boolean {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return false
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  const now = new Date()
  const ty = now.getFullYear()
  const tm = now.getMonth() + 1
  const td = now.getDate()
  if (y > ty) return true
  if (y < ty) return false
  if (mo > tm) return true
  if (mo < tm) return false
  return d >= td
}

/** スコアボード優先で対戦両球団の略称を返す（最大 2） */
export function rankingTeamShortsFromCanonicalGame(doc: CanonicalGameDocument): string[] {
  const out = new Set<string>()
  for (const line of doc.game?.scoreboard ?? []) {
    const name = String(line.teamName ?? "").trim()
    if (!name) continue
    const short = rosterTeamToRankingShort(name)
    if (short) out.add(short)
  }
  if (out.size >= 2) return [...out]
  for (const block of doc.game?.teams ?? []) {
    const name = String(block.teamName ?? "").trim()
    if (!name) continue
    const short = rosterTeamToRankingShort(name)
    if (short) out.add(short)
  }
  return [...out]
}

function weekYmdEndInclusive(tuesdayYmd: string): string | null {
  const m = tuesdayYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10) - 1
  const d = parseInt(m[3], 10)
  const sun = new Date(Date.UTC(y, mo, d, 3, 0, 0))
  sun.setUTCDate(sun.getUTCDate() + 5)
  const yy = sun.getUTCFullYear()
  const mm = String(sun.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(sun.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

function isYmdInWeek(ymd: string, weekKeyTuesday: string): boolean {
  const end = weekYmdEndInclusive(weekKeyTuesday)
  if (!end) return false
  return ymd >= weekKeyTuesday && ymd <= end
}

function emptyByLeague(): TeamGamesByLeague {
  return { CL: {}, PL: {} }
}

function shouldCountGame(
  doc: CanonicalGameDocument,
  year: string,
  weekKey?: string
): boolean {
  if (isCancelledCanonicalGame(doc)) return false
  const ymd = parseGameDateYmdFromCanonical(doc)
  if (!ymd || !ymd.startsWith(`${year}-`)) return false
  if (isFutureOrTodayGameYmd(ymd)) return false
  if (weekKey && !isYmdInWeek(ymd, weekKey)) return false
  return true
}

/**
 * シーズン通算: 年度に含まれる canonical 試合を球団別にカウント。
 */
export function aggregateSeasonTeamGamesFromCanonical(
  docs: CanonicalGameDocument[],
  year: string
): TeamGamesByLeague {
  const out = emptyByLeague()
  for (const doc of docs) {
    if (!shouldCountGame(doc, year)) continue
    const teams = rankingTeamShortsFromCanonicalGame(doc)
    if (teams.length < 2) continue
    for (const short of teams) {
      const lg = leagueBucketForTeamShort(short)
      out[lg][short] = (out[lg][short] ?? 0) + 1
    }
  }
  return out
}

/**
 * 当該週（火曜始まり）に含まれる試合のみ。
 */
export function aggregateWeeklyTeamGamesFromCanonical(
  docs: CanonicalGameDocument[],
  year: string,
  weekKey: string
): TeamGamesByLeague {
  const out = emptyByLeague()
  for (const doc of docs) {
    if (!shouldCountGame(doc, year, weekKey)) continue
    const teams = rankingTeamShortsFromCanonicalGame(doc)
    if (teams.length < 2) continue
    for (const short of teams) {
      const lg = leagueBucketForTeamShort(short)
      out[lg][short] = (out[lg][short] ?? 0) + 1
    }
  }
  return out
}
