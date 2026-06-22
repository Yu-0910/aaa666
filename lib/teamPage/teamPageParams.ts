/**
 * チームページ URL パラメータ検証・リーグ導出
 * 正本: docs/plan_team_page_phase0_spec.md §2.3–2.4
 */

import {
  isTeamPageYearSupported,
  ORDERED_TEAM_CODES,
  TEAM_PAGE_V1_YEARS,
  type TeamPageV1Year,
} from "@/lib/teamPage/teamPageConstants"
import {
  leagueFromTeamShort,
  teamDisplayNameFromCode,
  teamShortFromCode,
} from "@/lib/standings/teamCodes"

export { isTeamPageYearSupported }

export type ParsedTeamPageParams = {
  teamCode: string
  year: TeamPageV1Year
  league: "CL" | "PL"
  teamDisplay: string
  teamShort: string
}

const ORDERED_TEAM_CODE_SET = new Set<string>(ORDERED_TEAM_CODES)

export function isValidTeamCode(teamCode: string): boolean {
  return ORDERED_TEAM_CODE_SET.has(String(teamCode ?? "").trim())
}

export function leagueForTeamCode(teamCode: string): "CL" | "PL" | null {
  if (!isValidTeamCode(teamCode)) return null
  const short = teamShortFromCode(teamCode)
  return leagueFromTeamShort(short)
}

/**
 * ルート params を検証。無効なら null（呼び出し側で notFound()）。
 */
export function parseTeamPageParams(
  teamCode: string,
  year: string,
): ParsedTeamPageParams | null {
  const code = String(teamCode ?? "").trim()
  const yearStr = String(year ?? "").trim()
  if (!isValidTeamCode(code)) return null
  if (!isTeamPageYearSupported(yearStr)) return null
  const league = leagueForTeamCode(code)
  if (!league) return null
  return {
    teamCode: code,
    year: yearStr,
    league,
    teamDisplay: teamDisplayNameFromCode(code),
    teamShort: teamShortFromCode(code),
  }
}

/** Next.js generateStaticParams 用: 12 球団 × v1 年度 */
export function teamPageStaticParams(): Array<{ teamCode: string; year: string }> {
  const out: Array<{ teamCode: string; year: string }> = []
  for (const year of TEAM_PAGE_V1_YEARS) {
    for (const teamCode of ORDERED_TEAM_CODES) {
      out.push({ teamCode, year: String(year) })
    }
  }
  return out
}
