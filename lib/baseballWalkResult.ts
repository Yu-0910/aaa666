/**
 * 打席・投球の結果テキストが「四球扱い」か。
 * 敬遠・故意四球を四球と同一扱い（打数に入れず BB 系として集計）。
 * Phase11–17・pitchDetails・paSituationSim で共有する。
 */
export function isWalkLikeResultText(result: string): boolean {
  const s = (result ?? "").trim()
  if (!s) return false
  return /四球|敬遠|故意四球/.test(s)
}

/** 敬遠・故意四球（四球一般ではない）。投手補完ルールの対象。 */
export function isIntentionalWalkResultText(result: string): boolean {
  const s = (result ?? "").trim()
  if (!s) return false
  return /敬遠|故意四球/.test(s)
}
