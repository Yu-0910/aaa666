/**
 * 投手視点: 打席結果テキストからゴロアウト / フライアウトを推定（Yahoo 一球・要約テキスト由来）。
 * 公式記録の GO/AO と完全一致しない場合がある（表記ゆれ・併殺の内訳等）。
 */

export type BattedBallOutKind = "ground" | "air" | "none"

/**
 * 三振・四死球・安打・エラー出塁などは "none"（GO/AO の対象外）。
 * 犠飛はフライ系として "air"、犠打はゴロ系として "ground" とする。
 */
export function classifyBattedBallOutForGoAo(resultJa: string): BattedBallOutKind {
  const s = (resultJa ?? "").trim()
  if (!s) return "none"

  if (/四球|申告|死球|ボーク/.test(s)) return "none"
  if (/安打|ヒット|本塁打|ホームラン|塁打|左安|中安|右安/.test(s)) return "none"
  if (/エラー|失策/.test(s)) return "none"

  if (/三振|見逃し三振|空三振|見三振/.test(s)) return "none"
  if (/^(空振り|見逃し)三振/.test(s)) return "none"

  if (/犠飛/.test(s)) return "air"
  if (/犠打|送りバント/.test(s)) return "ground"

  if (/ゴロ|併殺/.test(s)) return "ground"
  if (/飛/.test(s)) return "air"
  if (/ライナー/.test(s) && !/安打/.test(s)) return "air"

  return "none"
}
