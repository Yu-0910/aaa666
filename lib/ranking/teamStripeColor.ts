/**
 * ランキング左端の球団帯（1px）用。未マッチ時はグレー枠（#555）と被らない色にする。
 */

const HISTORICAL_TEAM_STRIPE_HEX: Record<string, string> = {
  "大阪タイガース": "#FFE100",
  "名古屋ドラゴンズ": "#003595",
  "大洋ホエールズ": "#0052CD",
  "松竹ロビンス": "#FF0000",
  "大洋松竹ロビンス": "#0052CD",
  "広島カープ": "#E50012",
  "国鉄スワローズ": "#073170",
  "サンケイスワローズ": "#073170",
  "サンケイアトムズ": "#073170",
  "アトムズ": "#073170",
  "ヤクルトアトムズ": "#073170",
  "ヤクルトスワローズ": "#073170",
  "西日本パイレーツ": "#000033",
  "横浜大洋ホエールズ": "#0052CD",
  "横浜ベイスターズ": "#0052CD",
  "毎日オリオンズ": "#000000",
  "大映スターズ": "#223355",
  "南海ホークス": "#00843D",
  "阪急ブレーブス": "#C00000",
  "西鉄クリッパース": "#005BAC",
  "西鉄ライオンズ": "#005BAC",
  "近鉄パールス": "#CC0000",
  "東急フライヤーズ": "#01609A",
  "東映フライヤーズ": "#01609A",
  "高橋ユニオンズ": "#FF9900",
  "トンボユニオンズ": "#FF9900",
  "大映ユニオンズ": "#223355",
  "毎日大映オリオンズ": "#000000",
  "大毎オリオンズ": "#000000",
  "近鉄バファロー": "#CC0000",
  "近鉄バファローズ": "#CC0000",
  "東京オリオンズ": "#000000",
  "ロッテ・オリオンズ": "#000000",
  "太平洋クラブライオンズ": "#005BAC",
  "太平洋クラブ・ライオンズ": "#005BAC",
  "日拓ホームフライヤーズ": "#01609A",
  "日拓ホーム・フライヤーズ": "#01609A",
  "日本ハムファイターズ": "#01609A",
  "クラウンライターライオンズ": "#005BAC",
  "クラウンライター・ライオンズ": "#005BAC",
  "西武ライオンズ": "#005BAC",
  "オリックス・ブレーブス": "#C00000",
  "福岡ダイエーホークス": "#F36C21",
  "ダイエーホークス": "#F36C21",
  "オリックス・ブルーウェーブ": "#000020",
  "オリックスブルーウェーブ": "#000020",
  "オリックスブルーヴェーブ": "#000020",
  "大阪近鉄バファローズ": "#CC0000",
}

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
  "西鉄ライオンズ": "#004098",
  "太平洋クラブライオンズ": "#004098",
  "クラウンライターライオンズ": "#004098",
  L: "#004098",
  ソフトバンク: "#ffdb00",
  "福岡ソフトバンクホークス": "#ffdb00",
  Hs: "#ffdb00",
}

/** チーム不明・空欄: 列区切り #555 と差がつくスレート系 */
export const UNKNOWN_RANKING_TEAM_STRIPE = "#94a3b8"

function normalizeTeamStripeLookupKey(teamRaw: string): string {
  return teamRaw.trim().normalize("NFKC").replace(/\s+/g, "")
}

function isDeNaStripeAlias(team: string): boolean {
  return (
    team === "横浜DeNA" ||
    team === "DeNAベイスターズ" ||
    team.includes("DeNAベイスターズ") ||
    team.toLowerCase().includes("denabaystars")
  )
}

export function rankingTeamStripeColor(teamRaw: string): string {
  const t = (teamRaw ?? "").trim()
  if (!t) return UNKNOWN_RANKING_TEAM_STRIPE
  if (HISTORICAL_TEAM_STRIPE_HEX[t]) return HISTORICAL_TEAM_STRIPE_HEX[t]
  if (TEAM_STRIPE_HEX[t]) return TEAM_STRIPE_HEX[t]

  const normalized = normalizeTeamStripeLookupKey(t)
  if (HISTORICAL_TEAM_STRIPE_HEX[normalized]) return HISTORICAL_TEAM_STRIPE_HEX[normalized]
  if (TEAM_STRIPE_HEX[normalized]) return TEAM_STRIPE_HEX[normalized]
  if (isDeNaStripeAlias(normalized)) return TEAM_STRIPE_HEX.DB

  return UNKNOWN_RANKING_TEAM_STRIPE
}
