import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { lookupNpbPlayerIdForYahooId } from "@/lib/yahooNpbBatterIdMap"
import { rankingTeamCodeFromLabel } from "@/lib/ranking/resolveRankingNpbPlayerId"

/**
 * サーバー版:
 * 名簿と Yahoo→NPB bridge を使って、ランキング行から個人ページ用 NPB ID を補完する。
 */
export function resolveRankingNpbPlayerIdServer(opts: {
  name: string
  team: string
  playerId?: string
  explicitNpb?: string
}): string | undefined {
  const nameKey = opts.name.replace(/\s+/g, "")
  const teamCode = rankingTeamCodeFromLabel(opts.team)
  const yahooPlayerId = (opts.playerId ?? "").trim()
  const explicitNpb = String(opts.explicitNpb ?? "").trim()

  const roster = findRosterPlayerByPublicId(nameKey)
  const rosterTeamCode = roster
    ? rankingTeamCodeFromLabel(String(roster.team_code ?? roster.team ?? "").trim())
    : ""
  const rosterNpb = roster && rosterTeamCode === teamCode ? roster.npb_player_id.trim() : ""

  const npbFromYahooLookup = yahooPlayerId
    ? lookupNpbPlayerIdForYahooId(yahooPlayerId) ?? undefined
    : undefined

  return rosterNpb || npbFromYahooLookup || explicitNpb || undefined
}
