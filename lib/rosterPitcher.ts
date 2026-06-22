import { PILOT_KIKUCHI_NPB_PLAYER_ID } from "@/lib/pilotPlayerConstants"

/**
 * 2026 支配下公示のポジション文字列から「投手として今季 PoC UI」に載せるか。
 * 空欄は公示HTMLの取りこぼしが多い投手向けに投手扱い（野手は「外野手」等が入る想定）。
 * 菊池涼介は名簿上ポジションが空でも野手パイロットのため、`rosterNpbPlayerId` で明示的に投手UIへ載せない。
 */
export function isPitcherRegistrationPosition(
  position: string,
  options?: { rosterNpbPlayerId?: string }
): boolean {
  const rid = (options?.rosterNpbPlayerId ?? "").trim()
  if (rid === PILOT_KIKUCHI_NPB_PLAYER_ID) return false
  const t = (position || "").normalize("NFC").replace(/[\s\u3000]+/g, "")
  if (t.includes("投")) return true
  if (
    /捕手|[一二三]塁手|遊撃手|左翼手|中堅手|右翼手|内野手|外野手|指名打者|DH/.test(t)
  ) {
    return false
  }
  return t === ""
}

/** 名簿上「投手」でない＝野手（捕・内・外・DH 等）。投手ページ判定の逆。 */
export function isFielderRegistrationPosition(
  position: string,
  options?: { rosterNpbPlayerId?: string }
): boolean {
  return !isPitcherRegistrationPosition(position, options)
}

/** 2026 支配下公示のポジション文字列から「捕手登録」か（個人ページの捕手成績タブ表示用） */
export function isCatcherRegistrationPosition(position: string): boolean {
  const t = (position || "").normalize("NFC").replace(/[\s\u3000]+/g, "")
  return t.includes("捕手")
}
