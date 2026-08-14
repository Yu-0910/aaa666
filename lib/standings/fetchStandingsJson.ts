import { isTeamStandingsJson, type StandingsLeague, type TeamStandingsJson } from "./types"
import { displaySitePathToPublicUrl } from "@/lib/displayData/sitePath"
import { siteTeamStandingsPath, siteWeeklyTeamStandingsPath } from "@/lib/standings/paths"

function parseUsableStandingsJson(raw: unknown): TeamStandingsJson | null {
  if (!isTeamStandingsJson(raw)) return null
  return raw.rows.length > 0 ? raw : null
}

async function fetchStandingsJsonFromSitePath(sitePath: string): Promise<TeamStandingsJson> {
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
      // Fall back to the same-origin /data proxy below.
    }
  }

  const res = await fetch(sitePath, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  })

  if (!res.ok) {
    throw new Error(`順位表データの取得に失敗しました: ${sitePath}`)
  }

  const json = parseUsableStandingsJson(await res.json())
  if (!json) {
    throw new Error(`順位表データの形式が不正です: ${sitePath}`)
  }

  return json
}

export async function fetchStandingsJson(
  year: number,
  league: StandingsLeague
): Promise<TeamStandingsJson> {
  return fetchStandingsJsonFromSitePath(siteTeamStandingsPath(String(year), league))
}

export async function fetchWeeklyStandingsJson(
  year: number,
  weekKey: string,
  league: StandingsLeague
): Promise<TeamStandingsJson> {
  return fetchStandingsJsonFromSitePath(siteWeeklyTeamStandingsPath(String(year), weekKey, league))
}
