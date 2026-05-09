/**
 * Phase 28: 出場成績テーブルの打席結果セル（"投ゴロ" / "右安" / "右２" / "四球" 等）を
 * P0 + H/HR/TB のスカラ貢献量に変換する。
 *
 * - 既存の `hitBases` / `isAtBat` / `isWalkLikeResultText` を流用し、判定ルールが
 *   テキスト復元 (supplementPlateAppearancesFromTextPlayByPlay) や PA settlement と一致するように作る。
 * - 1 セル = 1 PA という前提（出場成績テーブルは 1 イニング 1 PA を 1 セルに書く運用）。
 *   同イニング 2 PA のケースは Yahoo 側で複数セルに分かれるため、ここでは扱わなくて良い。
 */
import { isWalkLikeResultText } from "../baseballWalkResult"
import { hitBases, isAtBat } from "./resultJaHitBases"

export interface CellPaContribution {
  pa: number
  ab: number
  bb: number
  hbp: number
  sh: number
  sf: number
  h: number
  hr: number
  /** 累塁数（hr=4, h3=3, h2=2, h1=1）。fly out / 凡退は 0。*/
  tb: number
  /** 単打/二塁打/三塁打/本塁打のいずれか（凡退時は無し） */
  hitBases?: 1 | 2 | 3 | 4
}

const RX_HBP = /死球/
const RX_SAC_BUNT = /犠打|送りバント|セーフティスクイズ|スクイズ|犠野/
const RX_SAC_FLY = /犠飛|犠牲フライ|犠牲飛/

/**
 * 打席結果セルテキストを P0+H 貢献量に変換。空セル / 無効テキストは null。
 *
 * @returns Contribution（pa は常に 1）。空文字や守備記録などは null。
 */
export function parseCellResultToContribution(text: string | undefined | null): CellPaContribution | null {
  const s = String(text ?? "").trim()
  if (!s) return null

  const out: CellPaContribution = {
    pa: 1,
    ab: 0,
    bb: 0,
    hbp: 0,
    sh: 0,
    sf: 0,
    h: 0,
    hr: 0,
    tb: 0,
  }

  if (isWalkLikeResultText(s)) {
    out.bb = 1
    return out
  }
  if (RX_HBP.test(s)) {
    out.hbp = 1
    return out
  }
  if (RX_SAC_BUNT.test(s)) {
    out.sh = 1
    return out
  }
  if (RX_SAC_FLY.test(s)) {
    out.sf = 1
    return out
  }

  // それ以外は AB に数える（妨害は isAtBat() の判定に従う）
  if (!isAtBat(s)) {
    // 妨害扱いで打数に入らないケース等は PA だけ。R/L バケツへの加算では PA のみ。
    return out
  }
  out.ab = 1
  const bases = hitBases(s)
  if (bases > 0) {
    out.h = 1
    out.tb = bases
    if (bases === 4) out.hr = 1
    out.hitBases = bases as 1 | 2 | 3 | 4
  }
  return out
}
