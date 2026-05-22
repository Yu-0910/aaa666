import { isWalkLikeResultText } from '@/lib/baseballWalkResult'
import { isStrikeoutResultJa } from '@/lib/yahooGame/paOutcomeResultJa'
import { hitBases } from '@/lib/yahooGame/resultJaHitBases'
import { stripBracketNotes } from '@/lib/yahooGame/paSettlementStatsFromResultJa'

/**
 * 打席結果テキストからイニング内の走者・アウトを簡易シミュレーションし、
 * 打席「開始時」の塁状況キーを分類する（Phase 15 状況別集計用）。
 *
 * 完全な公式記録ではない（タグアップ・エラー進塁等は省略）。トレンド用の近似。
 */

export type Bases = { r1: boolean; r2: boolean; r3: boolean }

export type GameState = {
  outs: 0 | 1 | 2
  b: Bases
}

/** 排他的な塁状況（無し・1塁…満塁） */
export type SituationDetailKey =
  | "none"
  | "r1"
  | "r2"
  | "r3"
  | "r12"
  | "r13"
  | "r23"
  | "loaded"

/** 得点圏 / 非得点圏（重複集計用） */
export type SituationRispKey = "risp" | "no_risp"

const emptyBases = (): Bases => ({ r1: false, r2: false, r3: false })

export function emptyGameState(): GameState {
  return { outs: 0, b: emptyBases() }
}

function cloneBases(b: Bases): Bases {
  return { r1: b.r1, r2: b.r2, r3: b.r3 }
}

/** 打席先頭時点の塁状況（詳細1つ + 得点圏フラグ） */
export function classifySituationAtPaStart(b: Bases): {
  detail: SituationDetailKey
  risp: boolean
  noRispRunner: boolean
} {
  const { r1, r2, r3 } = b
  const risp = r2 || r3
  const noRispRunner = r1 && !r2 && !r3

  let detail: SituationDetailKey = "none"
  if (!r1 && !r2 && !r3) detail = "none"
  else if (r1 && !r2 && !r3) detail = "r1"
  else if (!r1 && r2 && !r3) detail = "r2"
  else if (!r1 && !r2 && r3) detail = "r3"
  else if (r1 && r2 && !r3) detail = "r12"
  else if (r1 && !r2 && r3) detail = "r13"
  else if (!r1 && r2 && r3) detail = "r23"
  else if (r1 && r2 && r3) detail = "loaded"
  else detail = "none"

  return { detail, risp, noRispRunner }
}

function applyWalkLike(b: Bases): Bases {
  const { r1, r2, r3 } = b
  if (!r1) return { r1: true, r2, r3 }
  if (!r2) return { r1: true, r2: true, r3 }
  if (!r3) return { r1: true, r2: true, r3: true }
  return { r1: true, r2: true, r3: true }
}

function applySingle(b: Bases): Bases {
  return {
    r1: true,
    r2: b.r1,
    r3: b.r2,
  }
}

function applyDouble(b: Bases): Bases {
  if (!b.r1 && !b.r2 && !b.r3) return { r1: false, r2: true, r3: false }
  if (b.r1 && !b.r2 && !b.r3) return { r1: false, r2: true, r3: true }
  if (b.r1 && b.r2 && b.r3) return { r1: false, r2: true, r3: false }
  if (b.r1 && b.r2 && !b.r3) return { r1: false, r2: true, r3: true }
  return { r1: false, r2: true, r3: !!(b.r1 || b.r2) }
}

function applyTriple(): Bases {
  return { r1: false, r2: false, r3: true }
}

function applyHomeRun(): Bases {
  return emptyBases()
}

/** 走者更新用。打撃集計の `hitBases` と略称ルールを共有する。 */
function isHomeRun(r: string): boolean {
  return hitBases(r) === 4
}

function isTriple(r: string): boolean {
  return hitBases(r) === 3
}

function isDouble(r: string): boolean {
  return hitBases(r) === 2
}

function isSingle(r: string): boolean {
  return hitBases(r) === 1
}

function isHbp(r: string): boolean {
  return /死球/.test(r)
}

function isSacBunt(r: string): boolean {
  return /犠打|送りバント|投犠打/.test(r)
}

function isSacFly(r: string): boolean {
  return /犠飛|犠牲フライ|犠牲飛/.test(r)
}

function isGidp(r: string): boolean {
  return /併殺/.test(r)
}

/** 凡退（アウト）とみなす */
function isGenericBattingOut(r: string): boolean {
  if (
    isHomeRun(r) ||
    isTriple(r) ||
    isDouble(r) ||
    isSingle(r) ||
    isWalkLikeResultText(r) ||
    isHbp(r) ||
    isSacBunt(r) ||
    isSacFly(r)
  )
    return false
  if (isStrikeoutResultJa(r) || isGidp(r)) return true
  if (/妨害|敬遠|四球|死球/.test(r)) return false
  return (
    /飛|ゴロ|直|併殺|振り逃げ|封殺|失策|エラー|野選|犠/.test(r) ||
    /フォア/.test(r)
  )
}

function addOuts(state: GameState, n: 1 | 2): GameState {
  const o = state.outs + n
  if (o >= 3) {
    return { outs: 0, b: emptyBases() }
  }
  return { outs: o as 0 | 1 | 2, b: cloneBases(state.b) }
}

/**
 * イニング表／裏の連続した打席に対し、結果テキストで状態を更新する。
 */
export function applyPlayResult(state: GameState, rawResult: string): GameState {
  const r = (rawResult ?? "").trim()
  if (!r) return state

  let s = state

  if (isHomeRun(r)) {
    return { outs: s.outs, b: applyHomeRun() }
  }
  if (isTriple(r)) {
    return { outs: s.outs, b: applyTriple() }
  }
  if (isDouble(r)) {
    return { outs: s.outs, b: applyDouble(s.b) }
  }
  if (isSingle(r)) {
    return { outs: s.outs, b: applySingle(s.b) }
  }
  if (isWalkLikeResultText(r) || isHbp(r)) {
    return { outs: s.outs, b: applyWalkLike(s.b) }
  }
  if (isSacBunt(r)) {
    const afterOut = addOuts(s, 1)
    const nb = s.b
    let b = cloneBases(nb)
    if (nb.r1 && !nb.r2) b = { r1: false, r2: true, r3: nb.r3 }
    else if (nb.r2 && !nb.r3) b = { r1: nb.r1, r2: false, r3: true }
    else if (nb.r3) b = { r1: nb.r1, r2: nb.r2, r3: false }
    return { outs: afterOut.outs, b }
  }
  if (isSacFly(r)) {
    const afterOut = addOuts(s, 1)
    let b = cloneBases(s.b)
    if (b.r3) b = { ...b, r3: false }
    return { outs: afterOut.outs, b }
  }
  if (isGidp(r)) {
    return addOuts({ outs: s.outs, b: { r1: false, r2: false, r3: false } }, 2)
  }
  if (isStrikeoutResultJa(r)) {
    return addOuts(s, 1)
  }
  if (isGenericBattingOut(r)) {
    return addOuts(s, 1)
  }

  return s
}
