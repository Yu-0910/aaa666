/**
 * 今季日程で球場名が「未設定」の gameId を一覧する。
 * npx tsx scripts/audit_schedule_unset_stadium.ts --year 2026
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "../lib/projectRoot"

const year = process.argv.includes("--year")
  ? process.argv[process.argv.indexOf("--year") + 1] ?? "2026"
  : "2026"

type SeasonIndex = {
  gameIds?: string[]
  byDate?: Record<string, string[]>
  stadiumByGameId?: Record<string, string>
}

type DaySnap = {
  dateJst?: string
  gameIds?: string[]
  games?: Array<{ gameId: string; stadiumName: string }>
  stadiumByGameId?: Record<string, string>
}

function main(): void {
  const root = getProjectRoot()
  const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  const idx = JSON.parse(fs.readFileSync(idxPath, "utf8")) as SeasonIndex
  const map = idx.stadiumByGameId ?? {}
  const total = (idx.gameIds ?? []).length
  const unsetIds = Object.entries(map)
    .filter(([, v]) => v === "未設定")
    .map(([id]) => id)
    .sort()

  const dateByGame = new Map<string, string>()
  for (const [d, ids] of Object.entries(idx.byDate ?? {})) {
    for (const id of ids) dateByGame.set(id, d)
  }

  const canonDir = path.join(root, "_data", "scraped_games", "canonical")
  const canonIds = new Set(
    fs.existsSync(canonDir)
      ? fs.readdirSync(canonDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
      : [],
  )

  const byDateDir = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date")
  const snapDaysAllUnset: string[] = []
  const snapDaysPartial: Array<{ date: string; unset: number; total: number }> = []

  if (fs.existsSync(byDateDir)) {
    for (const f of fs.readdirSync(byDateDir).filter((x) => x.endsWith(".json")).sort()) {
      const snap = JSON.parse(
        fs.readFileSync(path.join(byDateDir, f), "utf8"),
      ) as DaySnap
      const games = snap.games ?? []
      if (!games.length) continue
      const unset = games.filter((g) => g.stadiumName === "未設定").length
      if (unset === games.length) snapDaysAllUnset.push(snap.dateJst ?? f.replace(".json", ""))
      else if (unset > 0) {
        snapDaysPartial.push({
          date: snap.dateJst ?? f.replace(".json", ""),
          unset,
          total: games.length,
        })
      }
    }
  }

  const unknownNotUnset = Object.entries(map).filter(
    ([, v]) => v && v !== "未設定" && !/球場|ドーム|スタジアム|マリン|PayPay|D|Ｆ|地方|弘前|前橋|大宮|きらめき|倉敷|岐阜/i.test(v),
  )

  console.log(
    JSON.stringify(
      {
        year,
        seasonIndexBuiltAt: (idx as { builtAt?: string }).builtAt,
        totalGamesInIndex: total,
        stadiumMapEntries: Object.keys(map).length,
        unsetStadiumCount: unsetIds.length,
        unsetWithCanonical: unsetIds.filter((id) => canonIds.has(id)).length,
        unsetWithoutCanonical: unsetIds.filter((id) => !canonIds.has(id)).length,
        snapDaysAllGamesUnset: snapDaysAllUnset,
        snapDaysPartialUnset: snapDaysPartial,
        unknownStadiumNamesSample: unknownNotUnset.slice(0, 20),
        unsetGameIdsByDate: Object.fromEntries(
          [...new Set(unsetIds.map((id) => dateByGame.get(id) ?? "?"))].sort().map((d) => [
            d,
            unsetIds.filter((id) => dateByGame.get(id) === d),
          ]),
        ),
      },
      null,
      2,
    ),
  )
}

main()
