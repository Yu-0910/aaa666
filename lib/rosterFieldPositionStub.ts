/**
 * 「スタメン時守備位置別」表は、真のスタメン別集計（Phase 11 派生の split）が無いとき
 * 通算行を1行だけ見せるプレースホルダ用。名簿の支配下ポジションに合わせて行を選ぶ。
 *
 * - 捕手/一塁手/… と表の行が一致する場合はそのキーを返す
 * - 内野手: 菊池パイロット（オープン戦二塁先発）と名簿「内野手」の兼ね合いで二塁手行
 * - 外野手: 表に「外野手」行が無いため中堅手行に寄せる（プレースホルダ）
 * - 未同期（空）: 従来どおり二塁手行（名簿 API 前の互換）
 */
export function rosterPositionToFieldStubRowKey(rosterPosition: string | undefined): string | null {
  const t = (rosterPosition || "").trim().normalize("NFC").replace(/[\s\u3000]+/g, "")
  if (!t) return "二塁手"
  const exact = ["捕手", "一塁手", "二塁手", "三塁手", "遊撃手", "左翼手", "中堅手", "右翼手", "DH"] as const
  if ((exact as readonly string[]).includes(t)) return t
  if (t === "指名打者") return "DH"
  if (t === "内野手") return "二塁手"
  if (t === "外野手") return "中堅手"
  return null
}
