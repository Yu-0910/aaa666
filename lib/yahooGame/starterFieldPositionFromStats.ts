/**
 * 出場成績 HTML → canonical `startingLineup[].fieldingPosition`（括弧内略号）を
 * UI「スタメン時守備位置別」表の行キーに正規化する。
 */

/** SeasonStatsPilot の守備位置別テーブル行（表示順） */
export const STARTER_FIELD_TABLE_KEYS = [
  "捕手",
  "一塁手",
  "二塁手",
  "三塁手",
  "遊撃手",
  "左翼手",
  "中堅手",
  "右翼手",
  "DH",
] as const

export type StarterFieldTableKey = (typeof STARTER_FIELD_TABLE_KEYS)[number]

const ABBREV_TO_TABLE_KEY: Record<string, StarterFieldTableKey> = {
  捕: "捕手",
  一: "一塁手",
  二: "二塁手",
  三: "三塁手",
  遊: "遊撃手",
  左: "左翼手",
  中: "中堅手",
  右: "右翼手",
  投: "DH",
}

/**
 * `startingLineup[].fieldingPosition`（例: 二 / 中右 / 投）→ 表の行キー（例: 二塁手）。
 * 未対応は null（その試合のスタメン打席は守備別に載せない）。
 */
export function starterFieldSplitKeyFromLineupPosition(
  fieldingPosition: string | null | undefined,
): StarterFieldTableKey | null {
  const raw = String(fieldingPosition ?? "").trim()
  if (!raw) return null
  const direct = ABBREV_TO_TABLE_KEY[raw]
  if (direct) return direct
  // 複合略号（中右・走左 等はスタメン行では稀）。先頭の守備字で寄せる。
  if (/中/.test(raw)) return "中堅手"
  if (/左/.test(raw) && !/右/.test(raw)) return "左翼手"
  if (/右/.test(raw)) return "右翼手"
  if (/捕/.test(raw)) return "捕手"
  if (/遊/.test(raw)) return "遊撃手"
  if (/三/.test(raw)) return "三塁手"
  if (/二/.test(raw)) return "二塁手"
  if (/一/.test(raw)) return "一塁手"
  return null
}

/** Phase15 派生 JSON 用: split_value は表キーと同一（例: 二塁手） */
export function labelForStarterFieldSplit(splitValue: string): string {
  return splitValue
}
