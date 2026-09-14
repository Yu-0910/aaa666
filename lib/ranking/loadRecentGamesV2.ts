import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { getRankingsBaseUrl } from "../displayData/rankingsBaseUrl"
import { parseRecentV2 } from "./recentGamesV2"

export async function loadRecentGamesV2(league: "CL" | "PL", metrics: { key: string; label: string }[]) {
  const relative = `data/rankings/recent-games-v2/2026/${league}/batting.json`
  const base = getRankingsBaseUrl()
  if (!base || process.env.RANKINGS_PREFER_LOCAL === "1") {
    return parseRecentV2(JSON.parse(await readFile(join(process.cwd(), "public", relative), "utf8")), league, metrics)
  }
  const response = await fetch(`${base}/${relative}`, { cache: "no-store", signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Recent-games V2 unavailable: ${response.status}`)
  return parseRecentV2(await response.json(), league, metrics)
}
