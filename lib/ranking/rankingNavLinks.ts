import { leagueLabel } from "@/lib/teamPage/teamPageHref"

export type RankingNavLink = {
  href: string
  label: string
  active?: boolean
}

export type RankingNavGroup = {
  ariaLabel: string
  links: RankingNavLink[]
}

type RankingPageKind = "batting" | "pitching"

function buildLeagueNavRow(year: string, league: "CL" | "PL", activeKind: RankingPageKind, activeLeague: "CL" | "PL"): RankingNavGroup {
  const leagueName = leagueLabel(league)
  const shortLeague = league === "CL" ? "セ" : "パ"
  const battingLabel = `${shortLeague}野手`
  const pitchingLabel = `${shortLeague}投手`
  return {
    ariaLabel: `${leagueName}のランキング`,
    links: [
      {
        href: `/ranking/${year}/${league}`,
        label: battingLabel,
        active: activeKind === "batting" && league === activeLeague,
      },
      {
        href: `/ranking/pitching/${year}/${league}`,
        label: pitchingLabel,
        active: activeKind === "pitching" && league === activeLeague,
      },
    ],
  }
}

export function buildRankingTopNavGroups(year: string, league: "CL" | "PL", kind: RankingPageKind): RankingNavGroup[] {
  const otherLeague: "CL" | "PL" = league === "CL" ? "PL" : "CL"
  return [
    buildLeagueNavRow(year, league, kind, league),
    buildLeagueNavRow(year, otherLeague, kind, league),
  ]
}
