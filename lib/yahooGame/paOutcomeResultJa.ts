/**
 * 打席の「結果テキスト」（resultSummaryJa 優先・最終球の resultJa 等）向けの判定。
 * 一球ごとの B-S シミュ（pitchCountSim）とは別レイヤー。
 */

/** 三振として数える表記（決着球テキスト用） */
export function isStrikeoutResultJa(r: string | null | undefined): boolean {
  const t = (r ?? "").trim()
  if (!t) return false
  // "暴振逃"（振り逃げ）も三振として扱う（Yahoo の打席結果表記に準拠）
  return /三振|空三振|見三振|暴振逃|振逃|振り逃げ/.test(t) || /^(空振り|見逃し)/.test(t)
}

/**
 * 打席の決着球として「打数にカウントしうる」打球・三振などか。
 * pitchDetailsPilot / ゾーン集計の基準と一致させる。
 */
export function isSettlementPitchResultJa(r: string | null | undefined): boolean {
  const s = (r ?? "").trim()
  if (!s) return false
  if (
    /^(左飛|中飛|右飛|一飛|二飛|三飛|遊飛|左邪飛|三邪飛|レフトフライ|センターフライ|ライトフライ|フライ)/.test(
      s
    )
  )
    return true
  if (/遊直|一塁直|二塁直|三塁直/.test(s)) return true
  if (/ゴロ|ライナー|併殺/.test(s)) return true
  if (/^(空振り|見逃し)/.test(s)) return true
  if (/三振|空三振|見三振/.test(s)) return true
  if (/^(左安|右安|中安|遊安|二塁|三塁|本塁|ソロ|満塁)/.test(s)) return true
  if (/^(右|左|中)[２2]/.test(s) || /^(右|左|中)[３3]/.test(s)) return true
  if (/安打|ヒット|二塁打|三塁打|本塁打/.test(s)) return true
  return false
}
