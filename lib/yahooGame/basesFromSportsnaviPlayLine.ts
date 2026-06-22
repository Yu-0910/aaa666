import type { PlateAppearance } from "./types"
import type { Bases } from "./paSituationSim"
import { buildPaIdToSportsnaviPlayLineMap } from "./supplementPlateAppearancesFromTextPlayByPlay"
import type { CanonicalGameDocument } from "./types"
import type { ScoreBasesContext } from "./basesFromSportsnaviScoreSnapshot"

/**
 * スポナビ実況行の打席開始状況トークン（例: 二死一塁・無死走者なし）から塁上走者を復元する。
 * 複合表記（一二塁・二三塁等）は部分文字列（「一二」）より先に判定する。
 */
export function basesFromSportsnaviSituationToken(token: string): Bases | null {
  const txt = (token ?? "").trim()
  if (!txt || !/^(無死|一死|二死|三死)/.test(txt)) return null

  const tail = txt.replace(/^(無死|一死|二死|三死)/, "")
  if (/走者なし/.test(tail) || tail === "") {
    return { r1: false, r2: false, r3: false }
  }

  if (/一二三塁|満塁/.test(tail)) {
    return { r1: true, r2: true, r3: true }
  }
  if (/一二塁/.test(tail)) {
    return { r1: true, r2: true, r3: false }
  }
  if (/一三塁/.test(tail)) {
    return { r1: true, r2: false, r3: true }
  }
  if (/二三塁/.test(tail)) {
    return { r1: false, r2: true, r3: true }
  }
  if (/三塁/.test(tail)) {
    return { r1: false, r2: false, r3: true }
  }
  if (/二塁/.test(tail)) {
    return { r1: false, r2: true, r3: false }
  }
  if (/一塁/.test(tail)) {
    return { r1: true, r2: false, r3: false }
  }

  return { r1: false, r2: false, r3: false }
}

/** 実況行頭: `4： 7番 …` または `5： 代打 平川 …` */
export const SPORTSNAVI_PLAY_LINE_HEAD_RE =
  /^\d+[：:]\s*(?:(?:\d+)番|代打)\s+(.+)$/

function situationTokensFromPlayLineBody(body: string): string[] {
  const tokens = body.trim().split(/\s+/).filter(Boolean)
  let start = 0
  if (tokens.length >= 2 && !/^(無死|一死|二死|三死)/.test(tokens[0]!)) start = 2
  return tokens.slice(start)
}

/** 実況 1 行から「無死一塁」「二死走者なし」等の状況トークンを抽出 */
export function extractSportsnaviSituationTokenFromPlayLine(playLine: string): string | null {
  const s = (playLine ?? "").trim()
  const head = s.match(SPORTSNAVI_PLAY_LINE_HEAD_RE)
  if (!head) return null
  for (const t of situationTokensFromPlayLineBody(head[1]!)) {
    if (/^(無死|一死|二死|三死)/.test(t)) return t
  }
  return null
}

/** 打席開始時点の塁（実況優先）。行が無い・解析不能時は null */
export function basesBeforeFromSportsnaviPlayLine(playLine: string | undefined): Bases | null {
  const line = (playLine ?? "").trim()
  if (!line) return null
  const token = extractSportsnaviSituationTokenFromPlayLine(line)
  if (!token) return null
  return basesFromSportsnaviSituationToken(token)
}

/** canonical の `baseBefore`（走者 ID または占有フラグ）→ Bases。フィールド未定義時のみ null */
export function basesFromPaBaseBeforeField(
  baseBefore: PlateAppearance["baseBefore"] | undefined,
): Bases | null {
  if (baseBefore === undefined) return null
  const r1 = !!(baseBefore.r1 != null && String(baseBefore.r1).trim() !== "")
  const r2 = !!(baseBefore.r2 != null && String(baseBefore.r2).trim() !== "")
  const r3 = !!(baseBefore.r3 != null && String(baseBefore.r3).trim() !== "")
  return { r1, r2, r3 }
}

export function basesToPaBaseBeforeField(b: Bases): NonNullable<PlateAppearance["baseBefore"]> {
  return {
    r1: b.r1 ? "1" : null,
    r2: b.r2 ? "1" : null,
    r3: b.r3 ? "1" : null,
  }
}

/**
 * 打席開始塁の SSOT: `pa.baseBefore` → 実況行。シミュレーションは使わない。
 */
export function basesBeforeForPlateAppearance(
  pa: PlateAppearance,
  playLine: string | undefined,
): Bases | null {
  const fromPa = basesFromPaBaseBeforeField(pa.baseBefore)
  if (fromPa) return fromPa
  return basesBeforeFromSportsnaviPlayLine(playLine)
}

/**
 * 実況行なし打席向け score ハイブリッド。
 * 入口 class が 1塁のみ → 状況別 2塁。それ以外は chain → first。
 */
export function basesBeforeFromScoreHybrid(ctx: ScoreBasesContext): Bases | null {
  const { chainStart, firstClass } = ctx
  if (firstClass?.r1 && !firstClass.r2 && !firstClass.r3) {
    return { r1: false, r2: true, r3: false }
  }
  if (chainStart) return chainStart
  if (firstClass) return firstClass
  return null
}

function isR1Only(b: Bases): boolean {
  return b.r1 && !b.r2 && !b.r3
}

function isR2Only(b: Bases): boolean {
  return !b.r1 && b.r2 && !b.r3
}

function isR13Only(b: Bases): boolean {
  return b.r1 && !b.r2 && b.r3
}

function isR12Only(b: Bases): boolean {
  return b.r1 && b.r2 && !b.r3
}

function isR23Only(b: Bases): boolean {
  return !b.r1 && b.r2 && b.r3
}

function isR3Only(b: Bases): boolean {
  return !b.r1 && !b.r2 && b.r3
}

/** 打席中・打席間の走者移動で chain が実況入口と異なるとき chain を採用（r13/r12 → r23） */
export function applyMidPaStealChainOverride(
  fromText: Bases,
  scoreCtx: ScoreBasesContext | null | undefined,
): Bases {
  const chain = scoreCtx?.chainStart
  if (!chain) return fromText
  const chainIsR23 = isR23Only(chain)
  if (isR13Only(fromText) && chainIsR23) return chain
  if (isR12Only(fromText) && chainIsR23) return chain
  return fromText
}

/**
 * 実況入口と score チェーン/終了 class の食い違いを解消。
 * - 無死一塁 or 代打+chain/last=2塁のみ → 2塁（8842-7 / 8852-12 / 8852-10）
 * - 二死一塁 + chain=1 only + baseBefore あり → 2塁（8968）
 */
export function applyTextScoreConflictOverride(
  fromText: Bases,
  playLine: string | undefined,
  pa: PlateAppearance,
  scoreCtx: ScoreBasesContext | null | undefined,
): Bases {
  if (!scoreCtx) return fromText
  const chain = scoreCtx.chainStart
  const last = scoreCtx.lastClass
  const line = (playLine ?? "").trim()
  const token = extractSportsnaviSituationTokenFromPlayLine(line)
  const paId = String(pa.paId ?? "")

  if (isR1Only(fromText) && chain && isR2Only(chain) && last && isR2Only(last)) {
    if (token?.startsWith("無死一塁")) return chain
    if (/代打/.test(line)) return chain
  }

  if (
    isR1Only(fromText) &&
    token === "二死一塁" &&
    chain &&
    isR1Only(chain) &&
    last &&
    isR1Only(last) &&
    pa.baseBefore !== undefined
  ) {
    return { r1: false, r2: true, r3: false }
  }

  /** text=二塁 & 入口em/chain=三塁 & 実況に犠飛 → 三塁（8920 菊池 SF 行） */
  if (
    isR2Only(fromText) &&
    chain &&
    isR3Only(chain) &&
    scoreCtx.firstEm &&
    isR3Only(scoreCtx.firstEm) &&
    /犠飛|犠牲フライ/.test(line)
  ) {
    return scoreCtx.firstEm
  }

  const isWalkLine = /四球|フォアボール|敬遠/.test(line)

  /** 打席中盗塁後 BB: 実況一塁 & score=二塁 → なし（8734-3） */
  if (
    isR1Only(fromText) &&
    chain &&
    isR2Only(chain) &&
    isWalkLine &&
    /盗塁成功|盗塁:/.test(line)
  ) {
    return { r1: false, r2: false, r3: false }
  }

  /** 二死一塁 BB & score=一二塁 → 三塁（8788-6） */
  if (
    isR1Only(fromText) &&
    chain &&
    isR12Only(chain) &&
    token === "二死一塁" &&
    isWalkLine
  ) {
    return { r1: false, r2: false, r3: true }
  }

  /** 打席中 PB & score=二塁 → 三塁（8636-4） */
  if (isR1Only(fromText) && chain && isR2Only(chain) && /パスボール|暴投/.test(line)) {
    return { r1: false, r2: false, r3: true }
  }

  /** けん制絡みの DP: 実況一塁 → なし（8699-1 ファーストライナーDP） */
  if (
    isR1Only(fromText) &&
    chain &&
    isR1Only(chain) &&
    /ダブルプレー/.test(line) &&
    /けん制/.test(line)
  ) {
    return { r1: false, r2: false, r3: false }
  }

  return fromText
}

/**
 * 状況別打撃スプリット用: 実況 → 盗塁補正 → score ハイブリッド → pa.baseBefore。
 * `basesBeforeForPlateAppearance` とは baseBefore 優先順が異なる（実況を先に見る）。
 */
export function basesBeforeForPlateAppearanceHybrid(
  pa: PlateAppearance,
  playLine: string | undefined,
  scoreCtx: ScoreBasesContext | null | undefined,
): Bases | null {
  const fromText = basesBeforeFromSportsnaviPlayLine(playLine)
  if (fromText) {
    const afterSteal = applyMidPaStealChainOverride(fromText, scoreCtx)
    return applyTextScoreConflictOverride(afterSteal, playLine, pa, scoreCtx)
  }

  if (scoreCtx) {
    const fromScore = basesBeforeFromScoreHybrid(scoreCtx)
    if (fromScore) return fromScore
  }

  return basesFromPaBaseBeforeField(pa.baseBefore)
}

/** `textPlayByPlay` から `plateAppearances[].baseBefore` を埋める（Phase10 マージ用） */
export function enrichPlateAppearancesWithBaseBeforeFromText(
  doc: CanonicalGameDocument,
  plateAppearances: PlateAppearance[],
): PlateAppearance[] {
  const lines = buildPaIdToSportsnaviPlayLineMap(doc)
  return plateAppearances.map((pa) => {
    if (pa.baseBefore !== undefined) return pa
    const b = basesBeforeFromSportsnaviPlayLine(lines.get(pa.paId))
    if (!b) return pa
    return { ...pa, baseBefore: basesToPaBaseBeforeField(b) }
  })
}
