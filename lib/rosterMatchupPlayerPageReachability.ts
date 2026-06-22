import { PILOT_KIKUCHI_NPB_PLAYER_ID } from "@/lib/pilotPlayerConstants"
import { getNpbRoster2026, type NpbRosterPlayer } from "@/lib/npbRoster"
import {
  buildFielderSeasonSubTabs,
  buildPitcherSeasonSubTabs,
} from "@/lib/playerMatchupSeasonTab"
import {
  isCatcherRegistrationPosition,
  isFielderRegistrationPosition,
  isPitcherRegistrationPosition,
} from "@/lib/rosterPitcher"

export type MatchupTabReachabilityIssue = {
  code: "no_season_ui" | "matchup_tab_missing"
  message: string
}

export type MatchupTabReachabilityResult = {
  player: NpbRosterPlayer
  showPitcherSeasonUi: boolean
  showFielderSeasonUi: boolean
  seasonSubTabLabels: string[]
  hasMatchupTab: boolean
  issues: MatchupTabReachabilityIssue[]
  ok: boolean
}

/** 名簿 1 人分: 今季サブタブに「対戦成績」が含まれるか（静的） */
export function evaluateMatchupTabReachability(
  player: NpbRosterPlayer,
): MatchupTabReachabilityResult {
  const npb = player.npb_player_id.trim()
  const position = player.position

  const showPitcherSeasonUi =
    isPitcherRegistrationPosition(position, { rosterNpbPlayerId: npb }) &&
    npb !== PILOT_KIKUCHI_NPB_PLAYER_ID

  const showFielderSeasonUi =
    isFielderRegistrationPosition(position, { rosterNpbPlayerId: npb }) ||
    npb === PILOT_KIKUCHI_NPB_PLAYER_ID

  const seasonSubTabLabels = showPitcherSeasonUi
    ? buildPitcherSeasonSubTabs().map((t) => t.label)
    : showFielderSeasonUi
      ? buildFielderSeasonSubTabs(isCatcherRegistrationPosition(position)).map((t) => t.label)
      : []

  const hasMatchupTab = seasonSubTabLabels.includes("対戦成績")
  const issues: MatchupTabReachabilityIssue[] = []

  if (!showPitcherSeasonUi && !showFielderSeasonUi) {
    issues.push({
      code: "no_season_ui",
      message: "投手・野手いずれの今季 UI にも分類できない",
    })
  }
  if ((showPitcherSeasonUi || showFielderSeasonUi) && !hasMatchupTab) {
    issues.push({
      code: "matchup_tab_missing",
      message: "今季サブタブ列に「対戦成績」が無い",
    })
  }

  return {
    player,
    showPitcherSeasonUi,
    showFielderSeasonUi,
    seasonSubTabLabels,
    hasMatchupTab,
    issues,
    ok: issues.length === 0 && hasMatchupTab,
  }
}

export function getRosterPlayersForMatchupTabCheck(): NpbRosterPlayer[] {
  return getNpbRoster2026().filter((p) => p.npb_player_id.trim())
}
