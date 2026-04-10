/**
 * Yahoo 打者 ID → NPB player_id の手動補助（fs なし・クライアント可）。
 * `lib/yahooNpbBatterIdMap.ts` の loadMaps と個人ページ名簿照合のフォールバックで共有する。
 * 投手のみ・橋渡し CSV に無い ID も、Phase13 の対左右（投手利き腕）解決に使う。
 * 救援のみ等で打席橋渡しに載らない投手は `build:yahoo-pitcher-npb-index` の JSON が補う（MANUAL より後に穴埋め）。
 */
export const MANUAL_YAHOO_TO_NPB: Record<string, string> = {
  // 坂倉将吾（広島）— CSV が未コミット・未配置のワークスペースでも `/players/1600124` が名簿・球種に解決されるようにする
  "1600124": "11915134",
  // 勝野 昌慲（中日・投）— 橋渡しに投手行が無いと Yahoo のみで利き腕が unknown になるのを防ぐ（橋渡し CSV にも同一行を追加済み）
  "1800061": "21525138",
  // Ｍ．サノー（中日）— batting bridge CSV で npb_player_id 欠損のため手動補完（対左右など利き腕解決の unknown 防止）
  "1561854": "73575152",
  // 投手: 打席橋渡し CSV に無い Yahoo ID → 名簿 npb_player_id（phase19 投手ランキングの英字・チーム解決用）
  "1660558": "93295157", // Ｈ．メヒア（中日）
  "1960397": "73975159", // Ｔ．ハーン（広島）
  "2060049": "73575159", // Ａ．アブレウ（中日）
}
