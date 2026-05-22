/**
 * 出場成績 zip（`buildAppearanceZipResultOverrides`）を `plateAppearanceResolvedResultText` に載せるか。
 * zip 不足時のフォールバックは `TOPPAGE_PLATE_RESULT_SOURCE`（`plateResultSourceFeatureFlag.ts`）で制御。
 *
 * - **未設定** / `1` / `true` / `on` / `yes` → zip **有効**（既定）
 * - `0` / `false` / `off` / `no` → zip **無効**（要約／一球のみ）
 *
 * サーバ・バッチ・`tsx` いずれも、起動プロセスの環境にセットする。
 */
export function isAppearancePrimaryZipEnabled(): boolean {
  const raw = String(process.env.TOPPAGE_APPEARANCE_PRIMARY ?? "").trim().toLowerCase()
  if (raw === "") return true
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") return true
  return true
}
