import type { LeadersConfig } from "@/lib/ranking/leadersTypes"
import type { TeamStandingsJson } from "@/lib/standings/types"
import type { WeeklyTabWeekMeta } from "@/lib/topPage/fetchTopWeeklyLeadersClient"
import type { RecentV2CardsPayload } from "@/lib/topPage/recentGamesV2Cards"

export type SeasonTabPayload = {
  batting: { CL: LeadersConfig; PL: LeadersConfig }
  pitching?: { CL: LeadersConfig; PL: LeadersConfig }
}

export type WeeklyTabPayload = {
  weekMeta: WeeklyTabWeekMeta
  batting: { CL: LeadersConfig; PL: LeadersConfig }
  pitching: { CL: LeadersConfig; PL: LeadersConfig }
  standings?: { CL: TeamStandingsJson; PL: TeamStandingsJson }
}

export type RecentTabPayload = {
  CL: RecentV2CardsPayload
  PL: RecentV2CardsPayload
}
