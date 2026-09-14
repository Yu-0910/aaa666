import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { getRankingsBaseUrl } from "../displayData/rankingsBaseUrl"
import { parseRecentGamesSnapshot } from "./recentGamesPage"

export async function loadRecentGamesSnapshot(league: "CL" | "PL") {
  const relative = `data/rankings/recent-games/2026/${league}/batting.json`
  const base = getRankingsBaseUrl()
  if (!base || process.env.RANKINGS_PREFER_LOCAL === "1") {
    return parseRecentGamesSnapshot(JSON.parse(await readFile(join(process.cwd(), "public", relative), "utf8")), league)
  }
  const response = await fetch(`${base}/${relative}`, { cache: "no-store", signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Recent-games data unavailable: ${response.status}`)
  return parseRecentGamesSnapshot(await response.json(), league)
}
