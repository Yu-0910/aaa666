/**
 * 日程 orphan の球場補完を一覧。
 *   npx tsx scripts/verify_stadium_fallback.ts --year 2026
 */
import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import { loadScheduleStadiumByGameId } from "@/lib/loadScheduleStadiumByGameId"
import {
  inferStadiumFromCanonicalMatchup,
  parseCanonicalMatchup,
} from "@/lib/stadiumInferFromCanonical"

const year = process.argv.includes("--year")
  ? process.argv[process.argv.indexOf("--year") + 1] ?? "2026"
  : "2026"
const root = getProjectRoot()
const canonDir = path.join(root, "_data", "scraped_games", "canonical")
const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
const idx = JSON.parse(fs.readFileSync(idxPath, "utf8")) as { gameIds?: string[] }
const scheduleIds = new Set((idx.gameIds ?? []).map(String))

const withFallback = loadScheduleStadiumByGameId(year, root, { canonicalFallback: true })
const scheduleOnly = loadScheduleStadiumByGameId(year, root, { canonicalFallback: false })

const orphans = fs
  .readdirSync(canonDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .filter((id) => !scheduleIds.has(id))
  .sort()

const rows = orphans.map((gameId) => {
  const doc = JSON.parse(fs.readFileSync(path.join(canonDir, `${gameId}.json`), "utf8"))
  const matchup = parseCanonicalMatchup(doc)
  const inferred = matchup ? inferStadiumFromCanonicalMatchup(matchup) : null
  return {
    gameId,
    matchup: matchup
      ? `${matchup.dateJst} ${matchup.teamLeft} vs ${matchup.teamRight}`
      : null,
    inferred,
    inMap: withFallback.get(gameId) ?? null,
    scheduleOnly: scheduleOnly.get(gameId) ?? null,
  }
})

console.log(JSON.stringify({ orphanCount: orphans.length, rows }, null, 2))
