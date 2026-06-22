import type { StandingsLeague, TeamStandingsJson } from "./types"

export async function fetchStandingsJson(
  year: number,
  league: StandingsLeague
): Promise<TeamStandingsJson> {
  const path = `/data/standings/${year}/${league}.json`

  const res = await fetch(path, {
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`順位表データの取得に失敗しました: ${path}`)
  }

  return res.json()
}
