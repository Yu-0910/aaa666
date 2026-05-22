import fs from "fs"
import path from "path"
import { enrichStadiumMapFromCanonicalFallback } from "@/lib/stadiumInferFromCanonical"
import {
  isUnsetStadiumSplitValue,
  normalizeStadiumSplitValue,
} from "@/lib/stadiumVenueNormalize"
import { getProjectRoot } from "@/lib/projectRoot"

function setStadiumNormalized(out: Map<string, string>, gameId: string, rawName: string): void {
  const id = String(gameId).trim()
  if (!id) return
  const stadium = normalizeStadiumSplitValue(String(rawName ?? "").trim())
  if (stadium) out.set(id, stadium)
}

export type ScheduleDaySnapshot = {
  schemaVersion?: string
  dateJst?: string
  gameIds?: string[]
  games?: Array<{ gameId: string; stadiumName: string }>
  stadiumByGameId?: Record<string, string>
}

export type ScheduleSeasonIndex = {
  schemaVersion?: string
  year?: string
  stadiumByGameId?: Record<string, string>
  byDate?: Record<string, string[]>
}

export type LoadScheduleStadiumOptions = {
  /** 日程に無い canonical 試合へ、対戦表記から球場を補完（本拠地 / 地方球場ルール） */
  canonicalFallback?: boolean
}

/** Phase 0 日程スナップショット + season インデックスから gameId→球場名を構築。 */
export function loadScheduleStadiumByGameId(
  year: string,
  projectRoot?: string,
  options?: LoadScheduleStadiumOptions,
): Map<string, string> {
  const root = projectRoot ?? getProjectRoot()
  const out = new Map<string, string>()

  const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  if (fs.existsSync(idxPath)) {
    try {
      const idx = JSON.parse(fs.readFileSync(idxPath, "utf8")) as ScheduleSeasonIndex
      for (const [gid, name] of Object.entries(idx.stadiumByGameId ?? {})) {
        setStadiumNormalized(out, gid, String(name ?? ""))
      }
    } catch {
      // ignore
    }
  }

  const byDateDir = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date")
  if (!fs.existsSync(byDateDir)) return out

  for (const f of fs.readdirSync(byDateDir)) {
    if (!f.endsWith(".json")) continue
    const snapPath = path.join(byDateDir, f)
    let snap: ScheduleDaySnapshot
    try {
      snap = JSON.parse(fs.readFileSync(snapPath, "utf8")) as ScheduleDaySnapshot
    } catch {
      continue
    }

    if (snap.games?.length) {
      for (const g of snap.games) {
        setStadiumNormalized(out, g.gameId, String(g.stadiumName ?? ""))
      }
    }
    for (const [gid, name] of Object.entries(snap.stadiumByGameId ?? {})) {
      setStadiumNormalized(out, gid, String(name ?? ""))
    }
  }

  if (options?.canonicalFallback !== false) {
    const canonDir = path.join(root, "_data", "scraped_games", "canonical")
    const repaired = enrichStadiumMapFromCanonicalFallback(out, canonDir)
    if (repaired > 0) {
      console.log(
        `[loadScheduleStadiumByGameId] canonical fallback repaired ${repaired} game(s) (未設定→球場名)`,
      )
    }
  }

  return out
}
