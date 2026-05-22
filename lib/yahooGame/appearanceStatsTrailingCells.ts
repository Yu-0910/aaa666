/**
 * Phase 1（出場成績主軸）: stats 行の末尾列（打席／対戦打者の結果セル）を canonical に載せる。
 * `inferBattingLineFromStatsRow` / `inferPitchingLineFromStatsRow` と `sportsnaviStatsTextParse.mjs` と同期すること。
 *
 * Phase 2: 非空スロット数と dedupe 後の当該打者打席数が一致するとき、`paId` → 出場成績文言の zip を構築する。
 */
import type { BattingLine, CanonicalGameDocument, PlateAppearance } from "./types"
import { dedupePlateAppearancesByInningHalfOrder } from "./dedupePlateAppearances"

/** 出場成績テーブルでサマリ列の直後に続く「打席結果」列の開始 index（cells[0]=守備位置, [1]=氏名想定の後続と整合） */
export const STATS_ROW_APPEARANCE_START_INDEX = 14

/**
 * `cells[fromIndex..]` を trim した配列。列欠損は空文字でパディングしない（HTML が短いときは短い配列）。
 */
export function extractAppearanceStatSlotsFromCells(
  cells: readonly string[],
  fromIndex: number = STATS_ROW_APPEARANCE_START_INDEX,
): string[] {
  if (!cells || cells.length <= fromIndex) return []
  return cells.slice(fromIndex).map((t) => String(t ?? "").trim())
}

export function countNonEmptyAppearanceSlots(slots: readonly string[]): number {
  let n = 0
  for (const s of slots) {
    if (String(s ?? "").trim() !== "") n += 1
  }
  return n
}

export type AppearancePaVsLogRow = {
  yahooBatterId: string
  /** 出場成績末尾列のうち非空セル数（近似 N） */
  nSlotsNonEmpty: number
  /** canonical `plateAppearances` 上の当該打者の打席数（M） */
  mPlateAppearances: number
  /** `n === m` のとき true（zip 可否の簡易ゲート。表記ゆれで偽陰性あり得る） */
  ok: boolean
}

/**
 * 試合単位: 打者ごとに「出場成績の打席列スロット数」と `plateAppearances` 件数を並べ、Phase 1 検算用の行を返す。
 */
export function diagnoseBattingAppearanceSlotsVsPlateAppearances(
  doc: CanonicalGameDocument,
): AppearancePaVsLogRow[] {
  const byBatterPa = new Map<string, number>()
  for (const pa of doc.domain?.plateAppearances ?? []) {
    const bid = String(pa.yahooBatterId ?? "").trim()
    if (!bid) continue
    byBatterPa.set(bid, (byBatterPa.get(bid) ?? 0) + 1)
  }

  const out: AppearancePaVsLogRow[] = []
  for (const line of doc.domain?.battingLines ?? []) {
    const bid = String(line.yahooPlayerId ?? "").trim()
    if (!bid) continue
    const slots = line.appearancePaSlotsJa ?? []
    const nSlotsNonEmpty = countNonEmptyAppearanceSlots(slots)
    const mPlateAppearances = byBatterPa.get(bid) ?? 0
    out.push({
      yahooBatterId: bid,
      nSlotsNonEmpty,
      mPlateAppearances,
      ok: nSlotsNonEmpty === mPlateAppearances,
    })
  }
  return out
}

/**
 * 出場成績 `appearancePaSlotsJa` の **非空セル列**と、dedupe 後の当該打者の打席列が **同じ長さ**のときだけ、
 * `paId` → スロット文言の対応を返す（Phase 2: 集計の打席結果の正を出場成績に寄せる）。
 * 長さ不一致・スロット未設定の打者はマップに載せない（従来の `plateAppearanceLastResultText` へフォールバック）。
 */
export function buildAppearanceZipResultOverrides(doc: CanonicalGameDocument): Map<string, string> {
  const out = new Map<string, string>()
  const gameId = String(doc.gameId ?? "").trim()
  const allPas = dedupePlateAppearancesByInningHalfOrder(doc.domain?.plateAppearances ?? [], gameId)

  const lineByBid = new Map<string, BattingLine>()
  for (const line of doc.domain?.battingLines ?? []) {
    const bid = String(line.yahooPlayerId ?? "").trim()
    if (!bid) continue
    const slots = line.appearancePaSlotsJa
    const prev = lineByBid.get(bid)
    const prevLen = prev?.appearancePaSlotsJa?.filter((s) => String(s ?? "").trim() !== "").length ?? 0
    const curLen = slots?.filter((s) => String(s ?? "").trim() !== "").length ?? 0
    if (!prev || curLen >= prevLen) lineByBid.set(bid, line)
  }

  for (const [, line] of lineByBid) {
    const bid = String(line.yahooPlayerId ?? "").trim()
    if (!bid) continue
    const slots = line.appearancePaSlotsJa
    if (!slots?.length) continue
    const nonempty = slots.map((s) => String(s ?? "").trim()).filter((s) => s !== "")
    const myPas = allPas.filter((pa) => String(pa.yahooBatterId ?? "").trim() === bid)
    if (nonempty.length === 0 || nonempty.length !== myPas.length) continue
    for (let i = 0; i < myPas.length; i++) {
      const pa = myPas[i] as PlateAppearance
      const pid = String(pa.paId ?? "").trim()
      const text = nonempty[i]
      if (pid && text) out.set(pid, text)
    }
  }
  return out
}
