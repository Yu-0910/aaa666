/**
 * 打席・投球の結果テキストが「四球扱い」か。
 * 敬遠・故意四球を四球と同一扱い（打数に入れず BB 系として集計）。
 * Phase11–17・pitchDetails・paSituationSim で共有する。
 */
export function isWalkLikeResultText(result: string): boolean {
  const s = (result ?? "").trim()
  if (!s) return false
  // 注意: ソース（スポナビ/Yahoo 一球ログ復元など）によって表記ゆれがある。
  // - "四球" / "敬遠" / "故意四球"（基本）
  // - "故意四"（スポナビ出場成績・打席結果列の略記。cells[14..] / appearancePaSlotsJa）
  // - "フォアボール" / "ボールフォー"（実況・復元テキストで出やすい）
  // - "申告敬遠"（=敬遠）
  return /四球|敬遠|故意四|故意四球|申告敬遠|フォアボール|ボールフォー/.test(s)
}

/** 敬遠・故意四球（四球一般ではない）。投手補完ルールの対象。 */
export function isIntentionalWalkResultText(result: string): boolean {
  const s = (result ?? "").trim()
  if (!s) return false
  return /敬遠|故意四|故意四球|申告敬遠/.test(s)
}
