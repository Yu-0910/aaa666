import type { LeadersConfig } from "@/lib/ranking/leadersTypes"
import type { WeeklyTabWeekMeta } from "@/lib/topPage/fetchTopWeeklyLeadersClient"

export type SeasonTabPayload = {
  batting: { CL: LeadersConfig; PL: LeadersConfig }
  pitching?: { CL: LeadersConfig; PL: LeadersConfig }
}

export type WeeklyTabPayload = {
  weekMeta: WeeklyTabWeekMeta
  batting: { CL: LeadersConfig; PL: LeadersConfig }
  pitching: { CL: LeadersConfig; PL: LeadersConfig }
}
