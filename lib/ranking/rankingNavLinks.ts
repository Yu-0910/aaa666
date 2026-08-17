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
type RankingPeriodKind = "season" | "weekly"

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

function rankingHref(year: string, league: "CL" | "PL", kind: RankingPageKind, period: RankingPeriodKind, weekKey?: string): string {
  if (period === "weekly") {
    const wk = weekKey?.trim()
    if (!wk) return kind === "pitching" ? `/ranking/pitching/${year}/${league}` : `/ranking/${year}/${league}`
    return kind === "pitching"
      ? `/ranking/pitching/weekly/${year}/${wk}/${league}`
      : `/ranking/weekly/${year}/${wk}/${league}`
  }
  return kind === "pitching" ? `/ranking/pitching/${year}/${league}` : `/ranking/${year}/${league}`
}

function buildLeagueWeeklyNavRow(
  year: string,
  weekKey: string,
  league: "CL" | "PL",
  activeKind: RankingPageKind,
  activeLeague: "CL" | "PL",
): RankingNavGroup {
  const leagueName = leagueLabel(league)
  const shortLeague = league === "CL" ? "セ" : "パ"
  return {
    ariaLabel: `${leagueName}の通常・週間ランキング`,
    links: [
      {
        href: rankingHref(year, league, "batting", "season"),
        label: `${shortLeague}野手`,
      },
      {
        href: rankingHref(year, league, "batting", "weekly", weekKey),
        label: `${shortLeague}野手\n週間`,
        active: activeKind === "batting" && league === activeLeague,
      },
      {
        href: rankingHref(year, league, "pitching", "season"),
        label: `${shortLeague}投手`,
      },
      {
        href: rankingHref(year, league, "pitching", "weekly", weekKey),
        label: `${shortLeague}投手\n週間`,
        active: activeKind === "pitching" && league === activeLeague,
      },
    ],
  }
}

export function buildWeeklyRankingTopNavGroups(
  year: string,
  weekKey: string,
  league: "CL" | "PL",
  kind: RankingPageKind,
): RankingNavGroup[] {
  const otherLeague: "CL" | "PL" = league === "CL" ? "PL" : "CL"
  return [
    buildLeagueWeeklyNavRow(year, weekKey, league, kind, league),
    buildLeagueWeeklyNavRow(year, weekKey, otherLeague, kind, league),
  ]
}
