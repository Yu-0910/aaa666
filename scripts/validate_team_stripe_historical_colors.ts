import assert from "node:assert/strict"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"

const EXPECTED: Record<string, string> = {
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
  "日拓ホームフライヤーズ": "#01609A",
  "日本ハムファイターズ": "#01609A",
  "クラウンライターライオンズ": "#005BAC",
  "西武ライオンズ": "#005BAC",
  "オリックス・ブレーブス": "#C00000",
  "福岡ダイエーホークス": "#F36C21",
  "オリックス・ブルーウェーブ": "#000020",
  "大阪近鉄バファローズ": "#CC0000",
}

for (const [team, color] of Object.entries(EXPECTED)) {
  assert.equal(rankingTeamStripeColor(team), color, team)
}

assert.equal(rankingTeamStripeColor("東京ヤクルトスワローズ"), "#2bbb3f")
assert.equal(rankingTeamStripeColor("埼玉西武ライオンズ"), "#004098")
assert.equal(rankingTeamStripeColor("ＤｅＮＡ"), "#0067c0")
assert.equal(rankingTeamStripeColor("横浜DeNA"), "#0067c0")
assert.equal(rankingTeamStripeColor("横浜ＤｅＮＡ"), "#0067c0")
assert.equal(rankingTeamStripeColor("横浜ＤｅＮＡベイスターズ"), "#0067c0")
assert.equal(rankingTeamStripeColor("Yokohama DeNA BayStars"), "#0067c0")
assert.equal(rankingTeamStripeColor(""), "#94a3b8")

console.log("validate_team_stripe_historical_colors: ok")
