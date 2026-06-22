/**
 * Phase 15 状況別の「打席開始塁」ソース。
 *
 * - **未設定** / `text_hybrid` → テキスト速報 → score 補正（`basesBeforeForPlateAppearanceHybrid`）
 * - `score` / `score_illustration` → 一球速報 score ページの入口スナップのみ（`basesBeforeFromScoreIllustration`）
 */
export type SituationBasesSourceMode = "text_hybrid" | "score_illustration"

export function situationBasesSourceMode(): SituationBasesSourceMode {
  const raw = String(process.env.TOPPAGE_SITUATION_BASES_SOURCE ?? "").trim().toLowerCase()
  if (
    raw === "score" ||
    raw === "score_illustration" ||
    raw === "score-illustration" ||
    raw === "scoreillustration"
  ) {
    return "score_illustration"
  }
  return "text_hybrid"
}

export function isSituationBasesFromScoreIllustration(): boolean {
  return situationBasesSourceMode() === "score_illustration"
}
