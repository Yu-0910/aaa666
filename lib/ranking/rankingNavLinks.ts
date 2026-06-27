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
  return {
    ariaLabel: `${leagueName}のランキング`,
    links: [
      {
        href: `/ranking/${year}/${league}`,
        label: `${leagueName} 野手`,
        active: activeKind === "batting" && league === activeLeague,
      },
      {
        href: `/ranking/pitching/${year}/${league}`,
        label: `${leagueName} 投手`,
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
