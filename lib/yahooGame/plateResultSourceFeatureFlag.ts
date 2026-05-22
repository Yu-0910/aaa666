/**
 * Phase 2（本計画のメイン）: 打席確定文言のソース。
 *
 * - **未設定** / `appearance_only` → **出場末尾列の zip のみ**（マップに無い打席は空文字。要約・一球にフォールバックしない）
 * - `hybrid` / `zip_fallback` → Phase 2 zip 導入時の挙動（`TOPPAGE_APPEARANCE_PRIMARY` に従い zip 可なら zip＋不足は要約／一球）
 *
 * サーバ・バッチ・`tsx` いずれも起動プロセスの環境にセットする。
 */
export function isPlateResultAppearanceOnly(): boolean {
  const raw = String(process.env.TOPPAGE_PLATE_RESULT_SOURCE ?? "").trim().toLowerCase()
  if (raw === "" || raw === "appearance_only" || raw === "appearance-only") return true
  if (raw === "hybrid" || raw === "zip_fallback" || raw === "zip-fallback") return false
  return true
}
