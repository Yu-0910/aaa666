import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { lookupNpbPlayerIdForYahooId } from "@/lib/yahooNpbBatterIdMap"

const teamNameToCode: Record<string, string> = {
  阪神: "H",
  阪神タイガース: "H",
  巨人: "G",
  読売ジャイアンツ: "G",
  DeNA: "DB",
  横浜DeNAベイスターズ: "DB",
  広島: "C",
  広島東洋カープ: "C",
  中日: "D",
  中日ドラゴンズ: "D",
  ヤクルト: "S",
  東京ヤクルトスワローズ: "S",
  オリックス: "Bs",
  "オリックス・バファローズ": "Bs",
  ロッテ: "M",
  千葉ロッテマリーンズ: "M",
  日本ハム: "F",
  北海道日本ハムファイターズ: "F",
  楽天: "E",
  東北楽天ゴールデンイーグルス: "E",
  西武: "L",
  埼玉西武ライオンズ: "L",
  ソフトバンク: "Hs",
  福岡ソフトバンクホークス: "Hs",
}

export function rankingTeamCodeFromLabel(team: string): string {
  const t = String(team ?? "").trim()
  if (teamNameToCode[t]) return teamNameToCode[t]
  for (const [name, code] of Object.entries(teamNameToCode)) {
    if (t.includes(name) || name.includes(t)) return code
  }
  return t
}

/** ランキング行の playerId（Yahoo 等）から個人ページ用 NPB ID を解決する */
export function resolveRankingNpbPlayerId(opts: {
  name: string
  team: string
  playerId?: string
  explicitNpb?: string
}): string | undefined {
  const nameKey = opts.name.replace(/\s+/g, "")
  const teamCode = rankingTeamCodeFromLabel(opts.team)
  const yahooPlayerId = (opts.playerId ?? "").trim()
  const explicitNpb = (opts.explicitNpb ?? "").trim()

  const roster = findRosterPlayerByPublicId(nameKey)
  const rosterTeamCode = roster
    ? rankingTeamCodeFromLabel(String(roster.team_code ?? roster.team ?? "").trim())
    : ""
  const rosterNpb =
    roster && rosterTeamCode === teamCode ? roster.npb_player_id.trim() : ""

  const npbFromYahooLookup = yahooPlayerId
    ? lookupNpbPlayerIdForYahooId(yahooPlayerId) ?? undefined
    : undefined

  return rosterNpb || npbFromYahooLookup || explicitNpb || undefined
}
