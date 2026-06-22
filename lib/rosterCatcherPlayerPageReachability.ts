import { rosterNameMatchKey } from "@/lib/playerNameNormalize"
import { findRosterPlayerByPublicId, getNpbRoster2026, type NpbRosterPlayer } from "@/lib/npbRoster"
import { resolveShowCatcherSeasonTab } from "@/lib/playerCatcherSeasonTab"
import { resolveSeasonStatsPilotQueryId } from "@/lib/resolveSeasonPilotQueryId"
import {
  isCatcherRegistrationPosition,
  isFielderRegistrationPosition,
  isPitcherRegistrationPosition,
} from "@/lib/rosterPitcher"

export type CatcherPlayerPageUrlEntry = {
  npb_player_id: string
  name_ja: string
  team: string
  team_code: string
  pathByNpbId: string
  pathByJaName: string
}

export type CatcherPlayerPageReachabilityIssue = {
  code:
    | "missing_npb_id"
    | "not_catcher_position"
    | "roster_lookup_by_npb_failed"
    | "roster_lookup_by_name_failed"
    | "classified_as_pitcher_ui"
    | "not_fielder_ui"
    | "catcher_tab_hidden"
    | "empty_season_pilot_id"
  message: string
}

export type CatcherPlayerPageReachabilityResult = {
  player: NpbRosterPlayer
  urls: CatcherPlayerPageUrlEntry
  issues: CatcherPlayerPageReachabilityIssue[]
  ok: boolean
  showSeasonCareerTabs: boolean
  showFielderSeasonPilotUi: boolean
  showCatcherSeasonTab: boolean
  seasonPilotPlayerId: string
}

export function getRosterCatchersFromCsv(): NpbRosterPlayer[] {
  return getNpbRoster2026().filter((r) => isCatcherRegistrationPosition(r.position))
}

export function buildCatcherPlayerPageUrls(player: NpbRosterPlayer): CatcherPlayerPageUrlEntry {
  const npb = player.npb_player_id.trim()
  const ja = player.name_ja.trim()
  return {
    npb_player_id: npb,
    name_ja: ja,
    team: player.team,
    team_code: player.team_code,
    pathByNpbId: `/players/${encodeURIComponent(npb)}`,
    pathByJaName: `/players/${encodeURIComponent(ja)}`,
  }
}

function seasonPilotIdForRosterPlayer(player: NpbRosterPlayer, publicId: string): string {
  const npb = player.npb_player_id.trim()
  const pathname = `/players/${encodeURIComponent(publicId)}`
  const pilotRaw = resolveSeasonStatsPilotQueryId({
    pathname,
    playerIdNormalized: publicId,
    playerSegmentCore: publicId,
    playerSegmentClean: publicId,
    displayName: player.name_ja,
    displayRomanName: null,
  })
  return npb || pilotRaw.trim()
}

/** 名簿捕手 1 人分: 個人ページ到達性（静的チェック） */
export function evaluateCatcherPlayerPageReachability(
  player: NpbRosterPlayer,
): CatcherPlayerPageReachabilityResult {
  const issues: CatcherPlayerPageReachabilityIssue[] = []
  const npb = player.npb_player_id.trim()
  const ja = player.name_ja.trim()
  const urls = buildCatcherPlayerPageUrls(player)

  if (!npb) {
    issues.push({
      code: "missing_npb_id",
      message: "npb_player_id が空",
    })
  }
  if (!isCatcherRegistrationPosition(player.position)) {
    issues.push({
      code: "not_catcher_position",
      message: `position=${player.position}`,
    })
  }

  const byNpb = npb ? findRosterPlayerByPublicId(npb) : null
  if (npb && !byNpb) {
    issues.push({
      code: "roster_lookup_by_npb_failed",
      message: `findRosterPlayerByPublicId(${npb}) が null`,
    })
  }

  const byJa = ja ? findRosterPlayerByPublicId(ja) : null
  if (ja && !byJa) {
    issues.push({
      code: "roster_lookup_by_name_failed",
      message: `findRosterPlayerByPublicId(${ja}) が null`,
    })
  }

  const rosterResolved = byNpb ?? byJa
  const isRosterPlayer = Boolean(rosterResolved)
  const position = rosterResolved?.position ?? player.position
  const rosterNpbId = rosterResolved?.npb_player_id ?? npb

  const classifiedPitcher = isPitcherRegistrationPosition(position, {
    rosterNpbPlayerId: rosterNpbId,
  })
  const showFielderSeasonPilotUi = !classifiedPitcher && isFielderRegistrationPosition(position, {
    rosterNpbPlayerId: rosterNpbId,
  })
  const showSeasonCareerTabs = isRosterPlayer || /^\d+$/.test(npb)

  if (classifiedPitcher) {
    issues.push({
      code: "classified_as_pitcher_ui",
      message: "投手今季 UI 扱いになっている",
    })
  }
  if (!showFielderSeasonPilotUi) {
    issues.push({
      code: "not_fielder_ui",
      message: "野手今季 UI が出ない",
    })
  }

  const showCatcherSeasonTab = resolveShowCatcherSeasonTab({
    rosterPosition: position,
    isRosterPlayer,
    catcherAppearances: null,
  })
  if (!showCatcherSeasonTab) {
    issues.push({
      code: "catcher_tab_hidden",
      message: "捕手成績タブが出ない（名簿捕手なら常時 true であるべき）",
    })
  }

  const seasonPilotPlayerId = seasonPilotIdForRosterPlayer(player, npb || ja)
  if (!seasonPilotPlayerId) {
    issues.push({
      code: "empty_season_pilot_id",
      message: "seasonPilotPlayerId が空",
    })
  }

  return {
    player,
    urls,
    issues,
    ok: issues.length === 0,
    showSeasonCareerTabs,
    showFielderSeasonPilotUi,
    showCatcherSeasonTab,
    seasonPilotPlayerId,
  }
}

export function evaluateAllRosterCatcherPlayerPages(): CatcherPlayerPageReachabilityResult[] {
  return getRosterCatchersFromCsv().map(evaluateCatcherPlayerPageReachability)
}

/** 名簿日本語名の照合キー重複（URL 衝突） */
export function findDuplicateCatcherNameKeys(): Array<{ key: string; players: string[] }> {
  const byKey = new Map<string, string[]>()
  for (const p of getRosterCatchersFromCsv()) {
    const key = rosterNameMatchKey(p.name_ja)
    const list = byKey.get(key) ?? []
    list.push(`${p.name_ja} (${p.npb_player_id})`)
    byKey.set(key, list)
  }
  return [...byKey.entries()]
    .filter(([, players]) => players.length > 1)
    .map(([key, players]) => ({ key, players }))
}
