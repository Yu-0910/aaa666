/**
 * canonical と Phase0 stadiumByGameId の差分を一覧する。
 *   npx tsx scripts/diag_stadium_gap.ts --year 2026
 */
import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import { loadScheduleStadiumByGameId } from "@/lib/loadScheduleStadiumByGameId"

const year = process.argv.includes("--year")
  ? process.argv[process.argv.indexOf("--year") + 1] ?? "2026"
  : "2026"
const root = getProjectRoot()
const canonDir = path.join(root, "_data", "scraped_games", "canonical")
const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)

const stadium = loadScheduleStadiumByGameId(year, root)
const idx = JSON.parse(fs.readFileSync(idxPath, "utf8")) as {
  gameIds?: string[]
  byDate?: Record<string, string[]>
}
const scheduleIds = new Set((idx.gameIds ?? []).map(String))
const canonicalIds = fs
  .readdirSync(canonDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))

const missingStadium = canonicalIds.filter((id) => !stadium.has(id)).sort()
const orphanCanonical = missingStadium.filter((id) => !scheduleIds.has(id))
const inScheduleNoStadium = missingStadium.filter((id) => scheduleIds.has(id))

console.log(JSON.stringify({
  canonicalCount: canonicalIds.length,
  scheduleGameIds: scheduleIds.size,
  stadiumMapSize: stadium.size,
  missingStadiumCount: missingStadium.length,
  missingStadiumGameIds: missingStadium,
  orphanCanonicalNotInScheduleIndex: orphanCanonical,
  inScheduleIndexButNoStadium: inScheduleNoStadium,
  emptyScheduleDays: Object.entries(idx.byDate ?? {})
    .filter(([, ids]) => !ids?.length)
    .map(([d]) => d),
}, null, 2))
