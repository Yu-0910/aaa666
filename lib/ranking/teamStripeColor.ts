/**
 * ランキング左端の球団帯（1px）用。未マッチ時はグレー枠（#555）と被らない色にする。
 */

const TEAM_STRIPE_HEX: Record<string, string> = {
  阪神: "#ffde00",
  "阪神タイガース": "#ffde00",
  H: "#ffde00",
  巨人: "#ff6600",
  "読売ジャイアンツ": "#ff6600",
  G: "#ff6600",
  DeNA: "#0067c0",
  横浜: "#0067c0",
  "横浜DeNAベイスターズ": "#0067c0",
  DB: "#0067c0",
  広島: "#d60718",
  "広島東洋カープ": "#d60718",
  C: "#d60718",
  中日: "#004ea2",
  "中日ドラゴンズ": "#004ea2",
  D: "#004ea2",
  ヤクルト: "#2bbb3f",
  "東京ヤクルトスワローズ": "#2bbb3f",
  S: "#2bbb3f",
  オリックス: "#b79e51",
  "オリックス・バファローズ": "#b79e51",
  Bs: "#b79e51",
  ロッテ: "#6b7280",
  "千葉ロッテマリーンズ": "#6b7280",
  M: "#6b7280",
  日本ハム: "#0077c8",
  "北海道日本ハムファイターズ": "#0077c8",
  F: "#0077c8",
  楽天: "#7a0019",
  "東北楽天ゴールデンイーグルス": "#7a0019",
  E: "#7a0019",
  西武: "#004098",
  "埼玉西武ライオンズ": "#004098",
  L: "#004098",
  ソフトバンク: "#ffdb00",
  "福岡ソフトバンクホークス": "#ffdb00",
  Hs: "#ffdb00",
}

/** チーム不明・空欄: 列区切り #555 と差がつくスレート系 */
export const UNKNOWN_RANKING_TEAM_STRIPE = "#94a3b8"

export function rankingTeamStripeColor(teamRaw: string): string {
  const t = (teamRaw ?? "").trim()
  if (!t) return UNKNOWN_RANKING_TEAM_STRIPE
  return TEAM_STRIPE_HEX[t] ?? UNKNOWN_RANKING_TEAM_STRIPE
}
