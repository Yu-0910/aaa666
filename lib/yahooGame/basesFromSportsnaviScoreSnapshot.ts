import type { Bases } from "./paSituationSim"
import { parsePaId, paSeqInHalfToScoreIndexPrefix } from "./paIdFormat"
import { plateAppearancePrefixFromScoreIndex } from "./runnerEventsFromSportsnaviScore"
import type { PlateAppearance } from "./types"

/** score スナップショットから打席ごとの入口 class と半回チェーン開始塁 */
export type ScoreBasesContext = {
  chainStart: Bases | null
  firstClass: Bases | null
  /** 打席入口スナップの #result em 走者（class より優先される走者情報） */
  firstEm: Bases | null
  /** 打席終了時点の #base class（実況入口と異なるときの補正用） */
  lastClass: Bases | null
  /**
   * 打撃確定スナップの #base class。
   * 同一打席 prefix 内で「四球・安打・三振」等の打席結果を示すスナップのうち suffix 最大。
   * 代打・代走・継投のみの後続スナップ（lastClass）は含めない。
   */
  resultBallClass: Bases | null
  /**
   * 打撃確定スナップの `#result` span にある打点（例: 「右安打 ＋1点」→ 1）。
   * `resultBallClass` が取れた打席では 0 以上。スナップが無いときだけ null。
   */
  resultBallRbi: number | null
}

/** `#base class="bXYZ"` → 1塁・2塁・3塁の占有（各桁 0/1） */
export function basesFromScoreHtmlBaseClass(html: string): Bases | null {
  const m = String(html ?? "").match(/id="base"\s+class="b(\d)(\d)(\d)"/)
  if (!m) return null
  return { r1: m[1] === "1", r2: m[2] === "1", r3: m[3] === "1" }
}

/** `#result em` の「ランナー1,2塁」等（敬遠など投球0打席向け） */
export function basesFromScoreHtmlRunnerEm(html: string): Bases | null {
  const block = String(html ?? "").match(/<div id="result"[\s\S]*?<\/div>/i)?.[0]
  if (!block) return null
  const em = block.match(/<em>([^<]*)<\/em>/i)?.[1]?.trim() ?? ""
  if (!em || !/ランナー/.test(em)) return null

  if (/1\s*,\s*2\s*,\s*3|1,2,3塁|満塁/.test(em)) {
    return { r1: true, r2: true, r3: true }
  }
  if (/1\s*,\s*2|1,2塁|一二塁/.test(em)) {
    return { r1: true, r2: true, r3: false }
  }
  if (/1\s*,\s*3|1,3塁|一三塁/.test(em)) {
    return { r1: true, r2: false, r3: true }
  }
  if (/2\s*,\s*3|2,3塁|二三塁/.test(em)) {
    return { r1: false, r2: true, r3: true }
  }
  if (/3塁/.test(em)) {
    return { r1: false, r2: false, r3: true }
  }
  if (/2塁/.test(em)) {
    return { r1: false, r2: true, r3: false }
  }
  if (/1塁/.test(em)) {
    return { r1: true, r2: false, r3: false }
  }
  return null
}

export function basesFromScoreSnapshotHtml(html: string): Bases | null {
  return basesFromScoreHtmlRunnerEm(html) ?? basesFromScoreHtmlBaseClass(html)
}

export function scoreIndexPrefixForPaId(paId: string): string | null {
  const p = parsePaId(paId)
  if (!p) return null
  return paSeqInHalfToScoreIndexPrefix(p.inning, p.half, p.paSeqInHalf).slice(0, 5)
}

/** 同一打席のスナップショット群から suffix 最大（打席終了時点に近い）の HTML */
export function lastSnapshotHtmlForPaPrefix(
  prefix: string,
  snapshots: Array<{ scoreIndex: string; html: string }>,
): string | null {
  let best: string | null = null
  let bestIdx = ""
  for (const s of snapshots) {
    if (plateAppearancePrefixFromScoreIndex(s.scoreIndex) !== prefix) continue
    if (s.scoreIndex >= bestIdx) {
      bestIdx = s.scoreIndex
      best = s.html
    }
  }
  return best
}

/** 同一打席の suffix 最小（打席入口）の HTML */
export function firstSnapshotHtmlForPaPrefix(
  prefix: string,
  snapshots: Array<{ scoreIndex: string; html: string }>,
): string | null {
  let best: string | null = null
  let bestIdx = "9999999"
  for (const s of snapshots) {
    if (plateAppearancePrefixFromScoreIndex(s.scoreIndex) !== prefix) continue
    if (s.scoreIndex <= bestIdx) {
      bestIdx = s.scoreIndex
      best = s.html
    }
  }
  return best
}

function indexSnapshotsByPaPrefix(
  snapshots: Array<{ scoreIndex: string; html: string }>,
): Map<string, Array<{ scoreIndex: string; html: string }>> {
  const byPrefix = new Map<string, Array<{ scoreIndex: string; html: string }>>()
  for (const s of snapshots) {
    const prefix = plateAppearancePrefixFromScoreIndex(s.scoreIndex)
    const list = byPrefix.get(prefix) ?? []
    list.push(s)
    byPrefix.set(prefix, list)
  }
  return byPrefix
}

function firstSnapshotHtmlFromIndex(
  prefix: string,
  byPrefix: Map<string, Array<{ scoreIndex: string; html: string }>>,
): string | null {
  const list = byPrefix.get(prefix)
  if (!list?.length) return null
  let best = list[0]!
  for (const s of list) {
    if (s.scoreIndex < best.scoreIndex) best = s
  }
  return best.html
}

function lastSnapshotHtmlFromIndex(
  prefix: string,
  byPrefix: Map<string, Array<{ scoreIndex: string; html: string }>>,
): string | null {
  const list = byPrefix.get(prefix)
  if (!list?.length) return null
  let best = list[0]!
  for (const s of list) {
    if (s.scoreIndex > best.scoreIndex) best = s
  }
  return best.html
}

/** `#result` 内の最初の `<span>` テキスト（HTML タグ除去） */
export function resultSpanTextFromScoreHtml(html: string): string {
  const block = String(html ?? "").match(/<div id="result"[\s\S]*?<\/div>/i)?.[0]
  if (!block) return ""
  const span = block.match(/<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? ""
  return span.replace(/<[^>]+>/g, "").trim()
}

function normalizeAsciiDigits(text: string): string {
  return text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
}

/**
 * 一球速報 score の打撃確定 `#result` span から打点を返す。
 * 例: 「右安打 ＋1点」→ 1。「右2塁打」のみ（＋表記なし）→ 0。
 * 打撃確定スナップでなければ null。
 */
export function rbiFromScoreResultHtml(html: string | null | undefined): number | null {
  const raw = String(html ?? "")
  if (!raw || !isBattingTerminalScoreResultHtml(raw)) return null
  const span = normalizeAsciiDigits(resultSpanTextFromScoreHtml(raw))
  if (!span) return 0
  const m = span.match(/[+＋]\s*(\d+)\s*点/)
  if (m) {
    const n = parseInt(m[1]!, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }
  return 0
}

const SCORE_ADMIN_ONLY_RESULT_RE =
  /^【(?:代打|代走|継投|守備変更|投手交代)】/

const BATTING_TERMINAL_SCORE_SPAN_RE =
  /三振|四球|敬遠|故意四球|申告敬遠|死球|犠打|捕犠|送りバント|犠飛|犠牲フライ|犠牲飛|本塁打|ホームラン|HR|左中本|右中本|左本|右本|中本|二塁打|三塁打|安打|ヒット|内野安打|内安|タイムリー|適時打|ポテンヒット|左飛|中飛|右飛|遊飛|投飛|捕飛|二飛|三飛|邪飛|フライ|ライナー|[一二三四五六七八九]飛|[一二三遊左中右投捕][安飛ゴロ直]|[一二三遊左中右投捕]フライ|[左中右]フライ|[左中右]飛|[左中右]ゴロ|ゴロ|併殺|併打|ダブルプレー|ゲッツー|失策|エラー|野選|打者妨|フォアボール|ボールフォー|[一二三遊左中右投捕][２３23]|[一二三遊左中右投捕]3塁打|[一二三遊左中右投捕]2塁打/

/** 打撃確定（四球・安打・三振・犠飛等）を示す score スナップか */
export function isBattingTerminalScoreResultHtml(html: string): boolean {
  const span = resultSpanTextFromScoreHtml(html)
  if (!span) return false
  if (SCORE_ADMIN_ONLY_RESULT_RE.test(span)) return false
  return BATTING_TERMINAL_SCORE_SPAN_RE.test(span)
}

/** 打撃確定スナップの HTML（代打・継投等の後続イベントを除外） */
export function terminalBattingResultSnapshotHtmlFromIndex(
  prefix: string,
  byPrefix: Map<string, Array<{ scoreIndex: string; html: string }>>,
): string | null {
  const list = byPrefix.get(prefix)
  if (!list?.length) return null
  let best: { scoreIndex: string; html: string } | null = null
  for (const s of list) {
    if (!isBattingTerminalScoreResultHtml(s.html)) continue
    if (!best || s.scoreIndex > best.scoreIndex) best = s
  }
  return best?.html ?? null
}

/** 半回内: 前打席終了時の塁 → 当該打席開始塁（em 明示があれば優先） */
export function buildPaStartBasesFromScoreSnapshots(
  paIdsInHalfOrder: string[],
  snapshots: Array<{ scoreIndex: string; html: string }>,
): Map<string, Bases | null> {
  const out = new Map<string, Bases | null>()
  let prevEnd: Bases = { r1: false, r2: false, r3: false }

  for (const paId of paIdsInHalfOrder) {
    const prefix = scoreIndexPrefixForPaId(paId)
    if (!prefix) {
      out.set(paId, null)
      continue
    }

    const firstHtml = firstSnapshotHtmlForPaPrefix(prefix, snapshots)
    const fromEm = firstHtml ? basesFromScoreHtmlRunnerEm(firstHtml) : null
    const baseBefore = fromEm ?? { ...prevEnd }
    out.set(paId, baseBefore)

    const lastHtml = lastSnapshotHtmlForPaPrefix(prefix, snapshots)
    const endBases = lastHtml ? basesFromScoreSnapshotHtml(lastHtml) : null
    if (endBases) prevEnd = endBases
  }

  return out
}

function isR1OnlyBases(b: Bases): boolean {
  return b.r1 && !b.r2 && !b.r3
}

function isR2OnlyBases(b: Bases): boolean {
  return !b.r1 && b.r2 && !b.r3
}

function isR12OnlyBases(b: Bases): boolean {
  return b.r1 && b.r2 && !b.r3
}

function isR13OnlyBases(b: Bases): boolean {
  return b.r1 && !b.r2 && b.r3
}

function isR23OnlyBases(b: Bases): boolean {
  return !b.r1 && b.r2 && b.r3
}

function isR3OnlyBases(b: Bases): boolean {
  return !b.r1 && !b.r2 && b.r3
}

/** 実況行から状況トークン（循環 import 回避のため score 側に複製） */
function situationTokenFromPlayLine(playLine: string): string | null {
  const s = (playLine ?? "").trim()
  const head = s.match(/^\d+[：:]\s*(?:(?:\d+)番|代打)\s+(.+)$/)
  if (!head) return null
  const tokens = head[1]!.trim().split(/\s+/).filter(Boolean)
  let start = 0
  if (tokens.length >= 2 && !/^(無死|一死|二死|三死)/.test(tokens[0]!)) start = 2
  for (const t of tokens.slice(start)) {
    if (/^(無死|一死|二死|三死)/.test(t)) return t
  }
  return null
}

function scoreChainEndAgreeOn(b: Bases, ctx: ScoreBasesContext): boolean {
  const chain = ctx.chainStart
  const last = ctx.lastClass
  const em = ctx.firstEm
  if (!chain || !last) return false
  const same = (a: Bases, c: Bases) => a.r1 === c.r1 && a.r2 === c.r2 && a.r3 === c.r3
  if (!same(chain, b) || !same(last, b)) return false
  if (em && !same(em, b)) return false
  return true
}

/** 入口イラストと chain=二三塁 の食い違い（一二/一三塁 → 二三塁） */
export function applyScoreIllustrationMidPaChainOverride(
  entry: Bases,
  ctx: ScoreBasesContext,
): Bases {
  const chain = ctx.chainStart
  if (
    chain &&
    isR23OnlyBases(chain) &&
    (isR12OnlyBases(entry) || isR13OnlyBases(entry)) &&
    scoreChainEndAgreeOn(chain, ctx)
  ) {
    return chain
  }
  return entry
}

/**
 * 入口イラストと score チェーン/em/終了の食い違いを解消（score_illustration 用）。
 * 塁の正は score 入口イラスト。実況行は打席中イベントのキーワード判定のみに使う。
 */
export function applyScoreIllustrationEntryOverride(
  entry: Bases,
  ctx: ScoreBasesContext,
  playLine?: string,
  pa?: Pick<PlateAppearance, "baseBefore">,
): Bases {
  const chain = ctx.chainStart
  const last = ctx.lastClass
  const line = (playLine ?? "").trim()
  const token = situationTokenFromPlayLine(line)
  const isWalkLine = /四球|フォアボール|敬遠/.test(line)

  /** 犠飛 & chain/em=三塁（8920-6裏-3） */
  if (
    isR2OnlyBases(entry) &&
    chain &&
    isR3OnlyBases(chain) &&
    ctx.firstEm &&
    isR3OnlyBases(ctx.firstEm) &&
    /犠飛|犠牲フライ/.test(line)
  ) {
    return ctx.firstEm
  }

  /** 打席中盗塁後 BB → なし（8734-3裏-3） */
  if (
    isR1OnlyBases(entry) &&
    chain &&
    isR2OnlyBases(chain) &&
    isWalkLine &&
    /盗塁成功|盗塁:/.test(line)
  ) {
    return { r1: false, r2: false, r3: false }
  }

  /** 二死一塁 BB & chain=一二塁 → 三塁（8788-6表-4） */
  if (
    isR1OnlyBases(entry) &&
    chain &&
    isR12OnlyBases(chain) &&
    token === "二死一塁" &&
    isWalkLine
  ) {
    return { r1: false, r2: false, r3: true }
  }

  /** PB & chain=二塁 → 三塁（8636-4裏-3） */
  if (
    isR1OnlyBases(entry) &&
    chain &&
    isR2OnlyBases(chain) &&
    /パスボール|暴投/.test(line)
  ) {
    return { r1: false, r2: false, r3: true }
  }

  /** けん制絡み DP → なし（8699-1表-2） */
  if (
    isR1OnlyBases(entry) &&
    chain &&
    isR1OnlyBases(chain) &&
    /ダブルプレー/.test(line) &&
    /けん制/.test(line)
  ) {
    return { r1: false, r2: false, r3: false }
  }

  /** 無死一塁/代打 + chain/last=二塁 → 二塁（8962-9裏-2 等） */
  if (
    isR1OnlyBases(entry) &&
    chain &&
    isR2OnlyBases(chain) &&
    last &&
    isR2OnlyBases(last)
  ) {
    if (token?.startsWith("無死一塁")) return chain
    if (/代打/.test(line)) return chain
    if (!/パスボール|暴投/.test(line) && !(isWalkLine && /盗塁成功|盗塁:/.test(line))) {
      return chain
    }
  }

  /** 二死一塁 + chain/em=二塁 + 安打 → 二塁（8852-12表-4） */
  if (
    isR1OnlyBases(entry) &&
    token === "二死一塁" &&
    chain &&
    isR2OnlyBases(chain) &&
    ctx.firstEm &&
    isR2OnlyBases(ctx.firstEm) &&
    /ヒット|安打/.test(line)
  ) {
    return chain
  }

  /** 二死一塁 + chain/last=一塁 + baseBefore → 二塁（8968） */
  if (
    isR1OnlyBases(entry) &&
    token === "二死一塁" &&
    chain &&
    isR1OnlyBases(chain) &&
    last &&
    isR1OnlyBases(last) &&
    pa?.baseBefore !== undefined
  ) {
    return { r1: false, r2: true, r3: false }
  }

  return entry
}

/**
 * 一球速報 score ページの打席入口スナップから打席開始塁を返す（Phase15 `score_illustration` 用）。
 *
 * 優先: 入口 `#base class` イラスト → 補正（chain/イベント）→ 半回チェーン → em。
 * 実況行は補正のイベント判定のみ（塁の正はイラスト+score チェーン）。
 */
export function basesBeforeFromScoreIllustration(
  ctx: ScoreBasesContext | null | undefined,
  playLine?: string,
  pa?: Pick<PlateAppearance, "baseBefore">,
): Bases | null {
  if (!ctx) return null
  if (ctx.firstClass) {
    const afterMid = applyScoreIllustrationMidPaChainOverride(ctx.firstClass, ctx)
    return applyScoreIllustrationEntryOverride(afterMid, ctx, playLine, pa)
  }
  if (ctx.chainStart) return ctx.chainStart
  if (ctx.firstEm) return ctx.firstEm
  return null
}

/**
 * 状況別打撃成績の塁分類用。スポナビは打撃確定スナップの `#base class` で集計する。
 * `resultBallClass`（打撃結果スナップ・代打/継投後続を除外）を正とし、
 * 取れないときだけ打席開始塁（`fallback`）にフォールバックする。
 */
export function basesAtResultBallForSituationSplit(
  ctx: ScoreBasesContext | null | undefined,
  fallback: Bases | null,
): Bases | null {
  const atResult = ctx?.resultBallClass ?? null
  if (atResult) return atResult
  return fallback
}

/** 状況別打点: 一球速報の「＋N点」を正とし、無いときだけ塁+結果の近似にフォールバック。 */
export function rbiCreditForPlateAppearance(
  scoreCtx: ScoreBasesContext | null | undefined,
  bases: Bases,
  result: string,
  fallbackCredit: (before: Bases, rawResult: string) => number,
): number {
  if (scoreCtx?.resultBallClass != null && scoreCtx.resultBallRbi != null) {
    return scoreCtx.resultBallRbi
  }
  return fallbackCredit(bases, result)
}

/** 試合内全打席の score 塁コンテキスト（Phase15 状況別ハイブリッド用） */
export function buildScoreBasesContextByPaId(
  paIdsInGameOrder: string[],
  snapshots: Array<{ scoreIndex: string; html: string }>,
): Map<string, ScoreBasesContext> {
  const halfGroups = new Map<string, string[]>()
  for (const paId of paIdsInGameOrder) {
    const p = parsePaId(paId)
    if (!p) continue
    const hk = `${p.inning}-${p.half}`
    const list = halfGroups.get(hk) ?? []
    list.push(paId)
    halfGroups.set(hk, list)
  }

  const chainByPa = new Map<string, Bases | null>()
  const byPrefix = indexSnapshotsByPaPrefix(snapshots)
  for (const [, ids] of halfGroups) {
    const m = buildPaStartBasesFromScoreSnapshotsIndexed(ids, byPrefix)
    for (const [id, b] of m) chainByPa.set(id, b)
  }

  const out = new Map<string, ScoreBasesContext>()
  for (const paId of paIdsInGameOrder) {
    const prefix = scoreIndexPrefixForPaId(paId)
    const firstHtml = prefix ? firstSnapshotHtmlFromIndex(prefix, byPrefix) : null
    const lastHtml = prefix ? lastSnapshotHtmlFromIndex(prefix, byPrefix) : null
    const resultHtml = prefix
      ? terminalBattingResultSnapshotHtmlFromIndex(prefix, byPrefix)
      : null
    out.set(paId, {
      chainStart: chainByPa.get(paId) ?? null,
      firstClass: firstHtml ? basesFromScoreHtmlBaseClass(firstHtml) : null,
      firstEm: firstHtml ? basesFromScoreHtmlRunnerEm(firstHtml) : null,
      lastClass: lastHtml ? basesFromScoreHtmlBaseClass(lastHtml) : null,
      resultBallClass: resultHtml ? basesFromScoreHtmlBaseClass(resultHtml) : null,
      resultBallRbi: resultHtml ? rbiFromScoreResultHtml(resultHtml) : null,
    })
  }
  return out
}

function buildPaStartBasesFromScoreSnapshotsIndexed(
  paIdsInHalfOrder: string[],
  byPrefix: Map<string, Array<{ scoreIndex: string; html: string }>>,
): Map<string, Bases | null> {
  const out = new Map<string, Bases | null>()
  let prevEnd: Bases = { r1: false, r2: false, r3: false }

  for (const paId of paIdsInHalfOrder) {
    const prefix = scoreIndexPrefixForPaId(paId)
    if (!prefix) {
      out.set(paId, null)
      continue
    }

    const firstHtml = firstSnapshotHtmlFromIndex(prefix, byPrefix)
    const fromEm = firstHtml ? basesFromScoreHtmlRunnerEm(firstHtml) : null
    const baseBefore = fromEm ?? { ...prevEnd }
    out.set(paId, baseBefore)

    const lastHtml = lastSnapshotHtmlFromIndex(prefix, byPrefix)
    const endBases = lastHtml ? basesFromScoreSnapshotHtml(lastHtml) : null
    if (endBases) prevEnd = endBases
  }

  return out
}
