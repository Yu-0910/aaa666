import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { ScheduleGameEntry } from "@/lib/sportsnaviScheduleParse"
import type { ScheduleDayGame } from "@/lib/probables/types"

type DaySnapshotLike = {
  schemaVersion?: string
  dateJst?: string
  games?: ScheduleGameEntry[]
  gameIds?: string[]
}

export function scheduleByDatePath(projectRoot: string, dateJst: string): string {
  return path.join(
    projectRoot,
    "_data",
    "sportsnavi_schedule_snapshots",
    "by_date",
    `${dateJst}.json`,
  )
}

export function readScheduleDaySnapshot(
  projectRoot: string,
  dateJst: string,
): DaySnapshotLike | null {
  const p = scheduleByDatePath(projectRoot, dateJst)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as DaySnapshotLike
  } catch {
    return null
  }
}

export function gamesFromDaySnapshot(
  snap: DaySnapshotLike | null,
  dateJst: string,
): ScheduleDayGame[] {
  if (!snap) return []
  const games = Array.isArray(snap.games) ? snap.games : []
  const out: ScheduleDayGame[] = []
  for (const g of games) {
    const gameId = String(g.gameId ?? "").trim()
    const homeTeamCode = String(g.homeTeamCode ?? "").trim()
    const awayTeamCode = String(g.awayTeamCode ?? "").trim()
    if (!gameId || !homeTeamCode || !awayTeamCode) continue
    out.push({
      dateJst,
      gameId,
      homeTeamCode,
      awayTeamCode,
      homeTeamShort: g.homeTeamShort,
      awayTeamShort: g.awayTeamShort,
      statusText: g.statusText,
      gameState: g.gameState,
    })
  }
  return out
}

export function* dateRangeYmd(from: string, to: string): Generator<string> {
  const d0 = new Date(`${from}T00:00:00+09:00`)
  const d1 = new Date(`${to}T00:00:00+09:00`)
  for (let t = d0.getTime(); t <= d1.getTime(); t += 86400_000) {
    const d = new Date(t)
    const y = d.toLocaleString("en-CA", { timeZone: "Asia/Tokyo", year: "numeric" })
    const m = d.toLocaleString("en-CA", { timeZone: "Asia/Tokyo", month: "2-digit" })
    const day = d.toLocaleString("en-CA", { timeZone: "Asia/Tokyo", day: "2-digit" })
    yield `${y}-${m}-${day}`
  }
}

export function loadScheduleGamesInRange(
  projectRoot: string,
  from: string,
  to: string,
): ScheduleDayGame[] {
  const all: ScheduleDayGame[] = []
  for (const ymd of dateRangeYmd(from, to)) {
    const snap = readScheduleDaySnapshot(projectRoot, ymd)
    all.push(...gamesFromDaySnapshot(snap, ymd))
  }
  return all
}

export function todayJstYmd(now = new Date()): string {
  return now.toLocaleString("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00+09:00`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toLocaleString("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
}

export function readSeasonIndexBuiltAt(projectRoot: string, year: string): string | null {
  const p = path.join(projectRoot, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  if (!fs.existsSync(p)) return null
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as { builtAt?: string }
    return j.builtAt ?? null
  } catch {
    return null
  }
}
