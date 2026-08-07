import type { StandingsLeague, TeamStandingsJson } from "./types"
import { displaySitePathToPublicUrl } from "@/lib/displayData/sitePath"

export async function fetchStandingsJson(
  year: number,
  league: StandingsLeague
): Promise<TeamStandingsJson> {
  const sitePath = `/data/standings/${year}/${league}.json`
  const r2Url = displaySitePathToPublicUrl(sitePath)

  if (r2Url) {
    try {
      const r2Res = await fetch(r2Url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      if (r2Res.ok) return r2Res.json()
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

  return res.json()
}
