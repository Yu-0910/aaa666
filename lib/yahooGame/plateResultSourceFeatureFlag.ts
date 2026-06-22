/**
 * Phase 2（本計画のメイン）: 打席確定文言のソース。
 *
 * - **未設定** / `appearance_only` → **出場末尾列の zip のみ**（マップに無い打席は空文字。要約・一球にフォールバックしない）
 * - `hybrid` / `zip_fallback` → Phase 2 zip 導入時の挙動（`TOPPAGE_APPEARANCE_PRIMARY` に従い zip 可なら zip＋不足は要約／一球）
 * - `text_pbp` / `text-pbp` → **テキスト速報実況行**（`inferResultSummaryJaFromSportsnaviPlayLineText`）。パース不能は空文字
 * - `pitch_pbp` / `pitch-pbp` → **一球速報**（`pitchEvents` の決着球 `resultJa` のみ。要約・出場成績は使わない）
 *
 * サーバ・バッチ・`tsx` いずれも起動プロセスの環境にセットする。
 */
export type PlateResultSourceMode = "appearance_only" | "hybrid" | "text_pbp" | "pitch_pbp"

export function plateResultSourceMode(): PlateResultSourceMode {
  const raw = String(process.env.TOPPAGE_PLATE_RESULT_SOURCE ?? "").trim().toLowerCase()
  if (raw === "text_pbp" || raw === "text-pbp" || raw === "textpbp") return "text_pbp"
  if (raw === "pitch_pbp" || raw === "pitch-pbp" || raw === "pitchpbp") return "pitch_pbp"
  if (raw === "hybrid" || raw === "zip_fallback" || raw === "zip-fallback") return "hybrid"
  return "appearance_only"
}

export function isPlateResultTextPbp(): boolean {
  return plateResultSourceMode() === "text_pbp"
}

export function isPlateResultPitchPbp(): boolean {
  return plateResultSourceMode() === "pitch_pbp"
}

export function isPlateResultAppearanceOnly(): boolean {
  return plateResultSourceMode() === "appearance_only"
}
