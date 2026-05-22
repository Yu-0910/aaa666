/**
 * 今週タブ用 current-week.json の生成・読み取り
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { weekLabelForKey } from "@/lib/ranking/weeklyRankingsWeekKeys"
import { hasBattingRankingsAtLeagueDir } from "@/lib/ranking/leadersFromRankingsAtLeagueDir"
import { weeklyBattingRankingsLeagueDir } from "@/lib/ranking/leadersFromRankingsAtLeagueDir"
import { topWeeklyLeadersSnapshotFilePath } from "@/lib/topPage/weeklyLeadersSnapshotBuild"

export type WeeklyCurrentWeekJson = {
  /** 暦上の今週（火曜 weekKey） */
  calendarWeekKey: string
  calendarWeekLabel: string
  /** トップ表示に使う週（データが無いときは直近週へフォールバック） */
  weekKey: string
  weekLabel: string
  isFallbackWeek: boolean
  availableWeekKeys: string[]
  generatedAt: string
}

export function weeklyCurrentWeekJsonPath(projectRoot: string, year: string): string {
  return join(projectRoot, "public", "data", "rankings", "weekly", year, "current-week.json")
}

function weekHasBattingRankings(projectRoot: string, year: string, weekKey: string): boolean {
  return (
    hasBattingRankingsAtLeagueDir(weeklyBattingRankingsLeagueDir(projectRoot, year, weekKey, "CL")) ||
    hasBattingRankingsAtLeagueDir(weeklyBattingRankingsLeagueDir(projectRoot, year, weekKey, "PL"))
  )
}

function weekHasTopLeadersSnapshot(projectRoot: string, year: string, weekKey: string): boolean {
  return (
    existsSync(topWeeklyLeadersSnapshotFilePath(projectRoot, year, weekKey, "CL", "batting")) ||
    existsSync(topWeeklyLeadersSnapshotFilePath(projectRoot, year, weekKey, "PL", "batting"))
  )
}

/**
 * 暦の今週＋ビルド済み週一覧から、トップ表示用メタを決定して current-week.json を書く。
 */
export function writeWeeklyCurrentWeekJson(
  projectRoot: string,
  year: string,
  calendarWeekKey: string,
  builtWeekKeys: string[]
): WeeklyCurrentWeekJson {
  const calendarWeekLabel = weekLabelForKey(calendarWeekKey)
  const availableWeekKeys = [...new Set(builtWeekKeys)].sort().reverse()

  let displayWeekKey = calendarWeekKey
  if (!weekHasTopLeadersSnapshot(projectRoot, year, calendarWeekKey)) {
    const snapshotFallback = availableWeekKeys.find(
      (wk) => wk !== calendarWeekKey && weekHasTopLeadersSnapshot(projectRoot, year, wk)
    )
    if (snapshotFallback) {
      displayWeekKey = snapshotFallback
    } else {
      const rankingFallback = availableWeekKeys.find((wk) => {
        if (wk === calendarWeekKey) return false
        if (!weekHasBattingRankings(projectRoot, year, wk)) return false
        try {
          const p = join(weeklyBattingRankingsLeagueDir(projectRoot, year, wk, "CL"), "OPS.json")
          if (!existsSync(p)) return false
          const rows = JSON.parse(readFileSync(p, "utf-8")) as unknown[]
          return Array.isArray(rows) && rows.length > 0
        } catch {
          return false
        }
      })
      if (rankingFallback) displayWeekKey = rankingFallback
    }
  }

  const payload: WeeklyCurrentWeekJson = {
    calendarWeekKey,
    calendarWeekLabel,
    weekKey: displayWeekKey,
    weekLabel: weekLabelForKey(displayWeekKey),
    isFallbackWeek: displayWeekKey !== calendarWeekKey,
    availableWeekKeys,
    generatedAt: new Date().toISOString(),
  }

  const outPath = weeklyCurrentWeekJsonPath(projectRoot, year)
  mkdirSync(join(projectRoot, "public", "data", "rankings", "weekly", year), { recursive: true })
  writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8")

  if (payload.isFallbackWeek) {
    console.log(
      `[weekly-current-week] calendar ${calendarWeekKey} (${calendarWeekLabel}) has no stats; display → ${displayWeekKey} (${payload.weekLabel})`
    )
  }

  return payload
}

export function readWeeklyCurrentWeekJson(
  projectRoot: string,
  year: string
): WeeklyCurrentWeekJson | null {
  const p = weeklyCurrentWeekJsonPath(projectRoot, year)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as WeeklyCurrentWeekJson
  } catch {
    return null
  }
}
