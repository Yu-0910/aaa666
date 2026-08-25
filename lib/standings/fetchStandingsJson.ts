import { isTeamStandingsJson, type StandingsLeague, type TeamStandingsJson } from "./types"
import { displaySitePathToPublicUrl } from "@/lib/displayData/sitePath"
import {
  siteTeamStandingsPath,
  siteWeeklyTeamStandingsPath,
  staticTeamStandingsPath,
} from "@/lib/standings/paths"

function parseUsableStandingsJson(raw: unknown): TeamStandingsJson | null {
  if (!isTeamStandingsJson(raw)) return null
  return raw.rows.length > 0 ? raw : null
}

async function fetchStandingsJsonFromSitePath(sitePath: string): Promise<TeamStandingsJson> {
  const res = await fetch(sitePath, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  })

  if (res.ok) {
    const json = parseUsableStandingsJson(await res.json())
    if (json) return json
  }

  const r2Url = displaySitePathToPublicUrl(sitePath)
  if (r2Url) {
    try {
      const r2Res = await fetch(r2Url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      if (r2Res.ok) {
        const r2Json = parseUsableStandingsJson(await r2Res.json())
        if (r2Json) return r2Json
      }
    } catch {
      // Prefer the same-origin /data proxy because it can fall back to local public/data.
    }
  }

  throw new Error(`順位表データの取得に失敗しました: ${sitePath}`)
}

async function fetchYearlyStandingsJson(year: number, league: StandingsLeague): Promise<TeamStandingsJson> {
  const sitePath = siteTeamStandingsPath(String(year), league)

  try {
    return await fetchStandingsJsonFromSitePath(sitePath)
  } catch {
    const staticPath = staticTeamStandingsPath(String(year), league)
    const staticRes = await fetch(staticPath, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
    if (staticRes.ok) {
      const staticJson = parseUsableStandingsJson(await staticRes.json())
      if (staticJson) return staticJson
    }
    throw new Error(`順位表データの取得に失敗しました: ${sitePath}`)
  }
}

export async function fetchStandingsJson(
  year: number,
  league: StandingsLeague
): Promise<TeamStandingsJson> {
  return fetchYearlyStandingsJson(year, league)
}

export async function fetchWeeklyStandingsJson(
  year: number,
  weekKey: string,
  league: StandingsLeague
): Promise<TeamStandingsJson> {
  return fetchStandingsJsonFromSitePath(siteWeeklyTeamStandingsPath(String(year), weekKey, league))
}
