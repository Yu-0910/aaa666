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
  "横浜DeNA": "#0067c0",
  "DeNAベイスターズ": "#0067c0",
  BayStars: "#0067c0",
  BAYSTARS: "#0067c0",
  DB: "#0067c0",
  YDB: "#0067c0",
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

type TeamStripeColorOptions = {
  year?: string | number
  league?: string
}

const CL_CURRENT_STRIPE_ALIAS: Record<string, keyof typeof TEAM_STRIPE_HEX> = {
  大阪タイガース: "H",
  阪神タイガース: "H",
  阪神: "H",
  読売ジャイアンツ: "G",
  巨人: "G",
  名古屋ドラゴンズ: "D",
  中日ドラゴンズ: "D",
  中日: "D",
  大洋ホエールズ: "DB",
  松竹ロビンス: "DB",
  大洋松竹ロビンス: "DB",
  横浜大洋ホエールズ: "DB",
  横浜ベイスターズ: "DB",
  横浜DeNAベイスターズ: "DB",
  横浜DeNA: "DB",
  DeNAベイスターズ: "DB",
  DeNA: "DB",
  広島カープ: "C",
  広島東洋カープ: "C",
  広島: "C",
  国鉄スワローズ: "S",
  サンケイスワローズ: "S",
  サンケイアトムズ: "S",
  アトムズ: "S",
  ヤクルトアトムズ: "S",
  ヤクルトスワローズ: "S",
  東京ヤクルトスワローズ: "S",
  ヤクルト: "S",
}

const POST_2000_CURRENT_STRIPE_ALIAS: Record<string, keyof typeof TEAM_STRIPE_HEX> = {
  ...CL_CURRENT_STRIPE_ALIAS,
  オリックスブルーウェーブ: "Bs",
  オリックスブルーヴェーブ: "Bs",
  オリックス・ブルーウェーブ: "Bs",
  オリックスバファローズ: "Bs",
  オリックス・バファローズ: "Bs",
  オリックス: "Bs",
  大阪近鉄バファローズ: "Bs",
  近鉄バファローズ: "Bs",
  近鉄バファロー: "Bs",
  福岡ダイエーホークス: "Hs",
  ダイエーホークス: "Hs",
  福岡ソフトバンクホークス: "Hs",
  ソフトバンク: "Hs",
  千葉ロッテマリーンズ: "M",
  ロッテ・オリオンズ: "M",
  ロッテ: "M",
  北海道日本ハムファイターズ: "F",
  日本ハムファイターズ: "F",
  日本ハム: "F",
  東北楽天ゴールデンイーグルス: "E",
  楽天: "E",
  埼玉西武ライオンズ: "L",
  西武ライオンズ: "L",
  西武: "L",
}

/** チーム不明・空欄: 列区切り #555 と差がつくスレート系 */
export const UNKNOWN_RANKING_TEAM_STRIPE = "#94a3b8"

function normalizeTeamStripeLookupKey(teamRaw: string): string {
  return teamRaw.trim().normalize("NFKC").replace(/\s+/g, "")
}

function isDeNaStripeAlias(team: string): boolean {
  const lower = team.toLowerCase()
  return (
    team === "横浜DeNA" ||
    team === "DeNAベイスターズ" ||
    team === "YDB" ||
    lower === "baystars" ||
    lower === "yokohamabaystars" ||
    team.includes("DeNAベイスターズ") ||
    lower.includes("denabaystars")
  )
}

function yearNumberFromOption(year: TeamStripeColorOptions["year"]): number | null {
  const n = Number(String(year ?? "").trim())
  return Number.isFinite(n) ? n : null
}

function currentStripeColorForEra(
  teamRaw: string,
  options?: TeamStripeColorOptions
): string | null {
  const year = yearNumberFromOption(options?.year)
  if (!year) return null

  const normalized = normalizeTeamStripeLookupKey(teamRaw)
  const league = String(options?.league ?? "").trim().toUpperCase()
  const applyPost2000 = year >= 2000
  const applyCentralSince1950 = league === "CL" && year >= 1950

  if (applyPost2000) {
    const key = POST_2000_CURRENT_STRIPE_ALIAS[normalized]
    if (key) return TEAM_STRIPE_HEX[key]
  }

  if (applyCentralSince1950) {
    const key = CL_CURRENT_STRIPE_ALIAS[normalized]
    if (key) return TEAM_STRIPE_HEX[key]
  }

  return null
}

export function rankingTeamStripeColor(
  teamRaw: string,
  options?: TeamStripeColorOptions
): string {
  const t = (teamRaw ?? "").trim()
  if (!t) return UNKNOWN_RANKING_TEAM_STRIPE
  const eraColor = currentStripeColorForEra(t, options)
  if (eraColor) return eraColor
  if (HISTORICAL_TEAM_STRIPE_HEX[t]) return HISTORICAL_TEAM_STRIPE_HEX[t]
  if (TEAM_STRIPE_HEX[t]) return TEAM_STRIPE_HEX[t]

  const normalized = normalizeTeamStripeLookupKey(t)
  if (HISTORICAL_TEAM_STRIPE_HEX[normalized]) return HISTORICAL_TEAM_STRIPE_HEX[normalized]
  if (TEAM_STRIPE_HEX[normalized]) return TEAM_STRIPE_HEX[normalized]
  if (isDeNaStripeAlias(normalized)) return TEAM_STRIPE_HEX.DB

  return UNKNOWN_RANKING_TEAM_STRIPE
}
