/**
 * season インデックスの「未設定」球場を canonical から修復して書き戻す。
 * Phase0 全巡回なしで 51 試合などを直すとき用。
 *
 *   npx tsx scripts/repair_schedule_unset_from_canonical.ts --year 2026
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "../lib/projectRoot"
import { loadScheduleStadiumByGameId } from "../lib/loadScheduleStadiumByGameId"
import { isUnsetStadiumSplitValue } from "../lib/stadiumVenueNormalize"

const year = process.argv.includes("--year")
  ? process.argv[process.argv.indexOf("--year") + 1] ?? "2026"
  : "2026"

function main(): void {
  const root = getProjectRoot()
  const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  if (!fs.existsSync(idxPath)) {
    console.error(`[repair:schedule-unset] missing ${idxPath}`)
    process.exit(1)
  }

  const idx = JSON.parse(fs.readFileSync(idxPath, "utf8")) as {
    stadiumByGameId?: Record<string, string>
    builtAt?: string
  }
  const before = Object.values(idx.stadiumByGameId ?? {}).filter((v) =>
    isUnsetStadiumSplitValue(v),
  ).length

  const map = loadScheduleStadiumByGameId(year, root, { canonicalFallback: true })
  const stadiumByGameId = Object.fromEntries(map)
  const after = Object.values(stadiumByGameId).filter((v) => isUnsetStadiumSplitValue(v)).length

  idx.stadiumByGameId = stadiumByGameId
  idx.builtAt = new Date().toISOString()
  fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2), "utf8")

  console.log(
    JSON.stringify(
      {
        year,
        indexPath: idxPath,
        unsetBefore: before,
        unsetAfter: after,
        stadiumEntries: Object.keys(stadiumByGameId).length,
      },
      null,
      2,
    ),
  )
  if (after > 0) {
    console.warn(
      `[repair:schedule-unset] WARN: ${after} game(s) still 未設定 (canonical 無し or タイトル未解析)`,
    )
  }
}

main()
