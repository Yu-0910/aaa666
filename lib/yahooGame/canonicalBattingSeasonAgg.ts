/**
 * canonical の plateAppearances から打者（Yahoo 打者 ID）単位のシーズン打撃集計。
 * phase11（個人用 JSON）と phase12（ランキング）で同一ロジックを共有する。
 *
 * 一球速報未マージ時の **個人ページ向けフォールバック** に
 * `aggregateBattingSeasonByYahooBatterFromBattingLines`（出場成績行の合算）を使う。
 * Phase 2: `aggregateBattingSeasonByYahooBatter`（打席のみ集計）でも、出場成績スロットと打席数が一致するときは **スロット文言を打席結果の正**として用いる（`plateAppearanceResolvedResultText`）。
 */

import { isIntentionalWalkResultText, isWalkLikeResultText } from "../baseballWalkResult"
import type { SeasonStatsRow } from "../seasonStatsPilotShared"
import { enrichSeasonStatsRowSabermetrics } from "../seasonStatsPilotShared"
import type { BattingLine, CanonicalGameDocument, PlateAppearance, RunnerEvent } from "./types"
import { dedupePlateAppearancesByInningHalfOrder } from "./dedupePlateAppearances"
import { isAppearancePrimaryZipEnabled } from "./appearancePrimaryFeatureFlag"
import { isBattingSeasonAggFromAppearanceSlots } from "./battingSeasonAggSourceFeatureFlag"
import { isPlateResultAppearanceOnly } from "./plateResultSourceFeatureFlag"
import {
  buildAppearanceZipResultOverrides,
  extractAppearanceStatSlotsFromCells,
} from "./appearanceStatsTrailingCells"
import { applyPlayResult, classifySituationAtPaStart, emptyGameState } from "./paSituationSim"
import { isStrikeoutResultJa } from "./paOutcomeResultJa"
import { hitBases, isAtBat } from "./resultJaHitBases"
import { battingSlashRatesFromCounts, slashRate3FromCounts } from "../battingRateFormat"

/**
 * 一球ログの resultJa を末尾から走査し、打席確定とみなせる最初の文言を返す。
 * 最終球だけ空・未確定で、数球前に「三振」「左飛」等が付いているケースの救済。
 */
function lastTerminalPitchResultJa(pitchEvents: PlateAppearance["pitchEvents"]): string {
  const pe = pitchEvents ?? []
  // ファール等で「フライ」部分が誤マッチしないよう除外
  const terminalRe =
    /三振|四球|敬遠|故意四球|申告敬遠|死球|犠打|捕犠|送りバント|犠飛|犠牲フライ|犠牲飛|本塁打|ホームラン|HR|左中本|右中本|左本|右本|中本|二塁打|三塁打|左２|中２|右２|左３|中３|右３|安打|ヒット|内野安打|内安|[一二三遊左中右投捕]安|ポテンヒット|タイムリー|適時打|左飛|中飛|右飛|遊飛|投飛|捕飛|二飛|三飛|[一二三四五六七八九]飛|ライナー|ゴロ|併殺|併打|ダブルプレー|ゲッツー|失策|エラー|野選|打者妨|フォアボール|ボールフォー/
  for (let i = pe.length - 1; i >= 0; i--) {
    const r = String(pe[i]?.resultJa ?? "").trim()
    if (!r) continue
    if (/ファール|ファウル/.test(r)) continue
    if (terminalRe.test(r)) return r
  }
  return ""
}

/** Phase スクリプト・対左右集計と共有（resultSummaryJa 優先、次に一球確定 resultJa、最後に最終球 resultJa） */
export function plateAppearanceLastResultText(pa: PlateAppearance): string {
  const summary = (pa.resultSummaryJa ?? "").trim()
  if (summary) return summary
  const pe = pa.pitchEvents ?? []
  const terminal = lastTerminalPitchResultJa(pe)
  if (terminal) return terminal
  const last = pe.length > 0 ? pe[pe.length - 1] : null
  return ((last?.resultJa ?? "") as string).trim() || ""
}

const appearanceZipOverridesByDoc = new WeakMap<CanonicalGameDocument, Map<string, string>>()

/**
 * 打席ごとの「集計用の確定結果テキスト」。
 *
 * - **`TOPPAGE_PLATE_RESULT_SOURCE` 未設定または `appearance_only`（既定）**:
 *   `TOPPAGE_APPEARANCE_PRIMARY` が有効なときだけ、出場末尾列由来の zip に載った文言のみを返す。
 *   載らない打席は **空文字**（`resultSummaryJa`・一球 `resultJa` にはフォールバックしない）。
 * - **`TOPPAGE_PLATE_RESULT_SOURCE=hybrid`**: 従来どおり zip が取れなければ `plateAppearanceLastResultText`（要約→一球）。
 * - **`TOPPAGE_APPEARANCE_PRIMARY=0`**: zip を使わず常に `plateAppearanceLastResultText`（緊急ロールバック）。
 */
export function plateAppearanceResolvedResultText(doc: CanonicalGameDocument, pa: PlateAppearance): string {
  if (!isAppearancePrimaryZipEnabled()) return plateAppearanceLastResultText(pa)

  const pid = String(pa.paId ?? "").trim()
  let m = appearanceZipOverridesByDoc.get(doc)
  if (!m) {
    m = buildAppearanceZipResultOverrides(doc)
    appearanceZipOverridesByDoc.set(doc, m)
  }
  const o = pid ? m.get(pid) : undefined
  if (o) return o

  if (isPlateResultAppearanceOnly()) return ""
  return plateAppearanceLastResultText(pa)
}

function lastPitchResult(doc: CanonicalGameDocument, pa: PlateAppearance): string {
  return plateAppearanceResolvedResultText(doc, pa)
}

function isHbp(result: string): boolean {
  return /死球/.test(result)
}
function isSacBunt(result: string): boolean {
  // セーフティスクイズ・犠野（投犠野）等は打数に入れない犠打扱い
  return /犠打|送りバント|セーフティスクイズ|スクイズ|犠野/.test(result)
}
function isSacFly(result: string): boolean {
  return /犠飛|犠牲フライ|犠牲飛/.test(result)
}
/** 併殺。「併打」は Yahoo 一球略の併殺（例: 二併打・投併打）。 */
function isGidp(result: string): boolean {
  const s = String(result ?? "").trim()
  if (!s) return false

  // 「併殺崩れ」は併殺成立ではないため、併殺打（GIDP）には含めない。
  if (/併殺崩れ/.test(s)) return false

  // フライ/ライナーで走者が戻れず「ダブルプレー」になったケースは、
  // 打者の併殺打（GIDP）ではないため除外する。
  // 例: "ショートフライ 一塁走者 ○○ も戻れずダブルプレー！"
  if (/(フライ|ライナー)/.test(s) && /(ダブルプレー|ゲッツー)/.test(s) && !/併殺打|併打|併殺/.test(s)) {
    return false
  }

  // 走者イベント（盗塁失敗など）で発生した「ダブルプレー」は打者の併殺打ではない。
  // 例: "空振り三振！一塁走者 藤原 も盗塁失敗でダブルプレー"
  if (/盗塁/.test(s) && /(ダブルプレー|ゲッツー)/.test(s)) return false
  if (/(けん制|牽制)/.test(s) && /(ダブルプレー|ゲッツー)/.test(s)) return false

  return /併殺|併打|併殺打|ダブルプレー|ゲッツー/.test(s)
}

function normalizeJaNameKey(s: string): string {
  return String(s ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[.．]/g, "")
}

function buildNameKeyToYahooIdMap(doc: CanonicalGameDocument): Map<string, string> {
  const m = new Map<string, string>()
  const surnameOwner = new Map<string, string | "__conflict__">()
  const ym = doc.game?.yahooPlayersMentioned ?? {}
  for (const [id, name] of Object.entries(ym)) {
    const key = normalizeJaNameKey(name)
    const yid = String(id ?? "").trim()
    if (!key || !yid) continue
    if (!m.has(key)) m.set(key, yid)

    // "姓" だけで実況に出ることがあるため、同一試合内で一意なら姓キーも張る
    const raw = String(name ?? "").trim().normalize("NFKC")
    const tokens = raw.split(/\s+/).filter(Boolean)
    if (tokens.length >= 1) {
      const surnameKey = normalizeJaNameKey(tokens[0]!)
      if (surnameKey) {
        const cur = surnameOwner.get(surnameKey)
        if (!cur) surnameOwner.set(surnameKey, yid)
        else if (cur !== yid) surnameOwner.set(surnameKey, "__conflict__")
      }
    }
  }
  for (const [k, owner] of surnameOwner.entries()) {
    if (owner && owner !== "__conflict__" && !m.has(k)) m.set(k, owner)
  }
  return m
}

function gidpFromTextPlayByPlay(doc: CanonicalGameDocument): Map<string, number> {
  const out = new Map<string, number>()
  const sections = doc.game?.textPlayByPlay ?? []
  if (!Array.isArray(sections) || sections.length === 0) return out

  const nameToId = buildNameKeyToYahooIdMap(doc)
  const seen = new Set<string>()

  function normalizeLineForDedup(s: string): string {
    // 先頭の "7：" などの通し番号を除去
    let t = String(s ?? "").trim().replace(/^\d+\s*[：:]\s*/, "")
    // ハイライト/動画説明等が同一行に連結されることがあるため、以降はイベント同定に使わない
    // 例: "... 3アウト 0:12 【11回裏】... イーグルス・村林一輝 ..."
    t = t.replace(/\s+\d+:\d\d\s+【[\s\S]*$/u, "")
    return normalizeJaNameKey(t)
  }

  function extractBatterNameKeyFromLine(s: string): string | null {
    const t = String(s ?? "").trim().replace(/^\d+\s*[：:]\s*/, "")
    // 例: "7番 村林 一輝 ..." / "8番 源田 壮亮 ..."
    const m = t.match(/\b\d+番\s+([^\s]+)\s+([^\s]+)/u)
    if (!m) return null
    return normalizeJaNameKey(`${m[1]} ${m[2]}`)
  }

  for (const sec of sections) {
    for (const line of sec.lines ?? []) {
      const s0 = String(line ?? "").trim()
      if (!s0) continue
      if (!isGidp(s0)) continue

      const batterKey = extractBatterNameKeyFromLine(s0)
      if (!batterKey) continue
      const yid = nameToId.get(batterKey)
      if (!yid) continue

      const k = `${doc.gameId}\t${yid}\t${normalizeLineForDedup(s0)}`
      if (seen.has(k)) continue
      seen.add(k)
      out.set(yid, (out.get(yid) ?? 0) + 1)
    }
  }

  return out
}

function gidpFromBatterEvents(doc: CanonicalGameDocument): Map<string, number> {
  const out = new Map<string, number>()
  const ev = (doc.domain as { batterEvents?: Array<{ kind?: string; yahooBatterId?: string }> })?.batterEvents
  if (!Array.isArray(ev) || ev.length === 0) return out
  for (const e of ev) {
    if (e?.kind !== "GIDP") continue
    const bid = String(e?.yahooBatterId ?? "").trim()
    if (!bid) continue
    out.set(bid, (out.get(bid) ?? 0) + 1)
  }
  return out
}

/**
 * textPlayByPlay から盗塁/盗塁死（走者イベント）を best-effort で抽出する。
 * plateAppearances だけでは SB/CS が取れないため、指標用の補完として使う（完全一致は保証しない）。
 */
function sbCsFromTextPlayByPlay(doc: CanonicalGameDocument): Map<string, { sb: number; cs: number }> {
  const out = new Map<string, { sb: number; cs: number }>()

  // canonical に runnerEvents があればそれをベースにする。
  // ただし runnerEvents 側が不完全なことがあるため、textPlayByPlay の追加パースで補完する。
  const runnerEvents = (doc.domain as { runnerEvents?: Array<{ kind?: string; yahooRunnerId?: string }> })
    ?.runnerEvents
  // runnerEvents と textPlayByPlay 由来の二重計上を避けるため、(inningHalf, kind, runnerId) で重複判定する。
  const seenRunnerEventTriples = new Set<string>()
  if (Array.isArray(runnerEvents) && runnerEvents.length > 0) {
    for (const e of runnerEvents) {
      const yid = String(e?.yahooRunnerId ?? "").trim()
      if (!yid) continue
      const cur = out.get(yid) ?? { sb: 0, cs: 0 }
      const kind = String(e?.kind ?? "").trim()
      const inningHalf = String((e as { inningHalf?: string })?.inningHalf ?? "").trim()
      if (kind && inningHalf) {
        seenRunnerEventTriples.add(`${inningHalf}\t${kind}\t${yid}`)
      }
      if (e?.kind === "SB") cur.sb += 1
      else if (e?.kind === "CS") cur.cs += 1
      out.set(yid, cur)
    }
  }

  const sections = doc.game?.textPlayByPlay ?? []
  if (!Array.isArray(sections) || sections.length === 0) return out

  const nameToId = buildNameKeyToYahooIdMap(doc)

  const patterns: Array<{ kind: "sb" | "cs"; re: RegExp }> = [
    // 例: "一塁走者 中島 :盗塁成功 二塁"
    { kind: "sb", re: /走者\s*([^\s:：]+)\s*[:：]\s*盗塁成功/ },
    { kind: "cs", re: /走者\s*([^\s:：]+)\s*[:：]\s*(盗塁死|盗塁失敗)/ },
    // 表記ゆれ: "ランナー 中島 :盗塁成功"
    { kind: "sb", re: /ランナー\s*([^\s:：]+)\s*[:：]\s*盗塁成功/ },
    { kind: "cs", re: /ランナー\s*([^\s:：]+)\s*[:：]\s*(盗塁死|盗塁失敗)/ },
    // スポナビ表記ゆれ: "一塁走者 辰己 :盗塁を試みるもアウト"
    { kind: "cs", re: /[一二三]塁走者\s*([^\s:：]+)\s*[:：]\s*盗塁(?:を)?試みるもアウト/ },
    // スポナビ表記: "空振り三振！一塁走者 太田 も盗塁失敗でダブルプレー"
    // ※コロン無しで「も 盗塁失敗」が続くパターンがある
    { kind: "cs", re: /[一二三]塁走者\s*([^\s:：]+)\s*も\s*盗塁(?:死|失敗)/ },
    // 表記: "スタートを切っていた二塁走者 黒川 もアウトでダブルプレー"
    // （盗塁/盗塁死の語が無いが、公式成績上 CS として扱われるケースがある）
    { kind: "cs", re: /スタートを切っていた\s*[一二三]塁走者\s*([^\s:：]+)\s*もアウトでダブルプレー/ },
    // けん制死（＝盗塁死と同じ扱い）。
    // sportsnavi の text は「けん制(帰塁) … バッターアウト」まで同一行に連結されることがある。
    // その場合「アウト」は打者アウトを指すので CS にしない。
    // ここでは「走者アウト」を短い範囲で明示している形だけを対象にする。
    // 例: "一塁けん制:ランナー 辰己 アウト"
    {
      kind: "cs",
      re: /[一二三]塁(?:けん制|牽制)\s*[:：]\s*ランナー\s*([^\s:：]+)\s*(?:アウト|タッチアウト|挟殺)(?!.*帰塁)(?!.*バッターアウト)/,
    },
  ]

  // 「◯◯ (一):ピッチャー … のけん制球を捕球ミス …」だけでは走者アウト（CS）か
  // 単なるエラー進塁か判別できない（例: 3/27 岩田は飛び出しではなく一塁のまま等）。
  // CS は明示パターン（盗塁死・けん制:ランナー … アウト 等）と runnerEvents のみ。

  for (const sec of sections) {
    const inningHalf = String(sec?.sectionTitle ?? "").trim()
    for (const line of sec.lines ?? []) {
      const s = String(line ?? "")
      for (const { kind, re } of patterns) {
        const m = s.match(re)
        if (!m) continue
        const nameKey = normalizeJaNameKey(m[1] ?? "")
        const yid = nameToId.get(nameKey)
        if (!yid) continue
        // runnerEvents が既に同一の (inningHalf, kind, runnerId) を持っていれば二重計上しない
        const kindUp = kind === "sb" ? "SB" : "CS"
        if (inningHalf && seenRunnerEventTriples.has(`${inningHalf}\t${kindUp}\t${yid}`)) continue
        const cur = out.get(yid) ?? { sb: 0, cs: 0 }
        if (kind === "sb") cur.sb += 1
        else cur.cs += 1
        out.set(yid, cur)
      }
    }
  }

  return out
}

/**
 * textPlayByPlay から犠飛（SF）を best-effort で抽出する。
 * plateAppearances が空の試合でも「犠飛だけは PA に含めたい」ための補完。
 *
 * 例: "4： 2番 近藤 健介 一死一三塁 ... センターへの犠牲フライ ..."
 */
function sfFromTextPlayByPlay(doc: CanonicalGameDocument): Map<string, number> {
  const out = new Map<string, number>()
  const sections = doc.game?.textPlayByPlay ?? []
  if (!Array.isArray(sections) || sections.length === 0) return out

  const nameToId = buildNameKeyToYahooIdMap(doc)
  const isSfLine = (s: string): boolean => /犠牲フライ|犠飛/.test(s)

  // 「◯番 氏名」の氏名部分を抜く（氏名内の全角/半角スペースを許容）
  const batterNameFromLine = (s: string): string | null => {
    const m = String(s ?? "").match(/\b\d+番\s+(.+?)\s+(?:無死|一死|二死|三死)/)
    if (!m) return null
    const name = String(m[1] ?? "").trim()
    return name ? name : null
  }

  for (const sec of sections) {
    for (const line of sec.lines ?? []) {
      const s = String(line ?? "")
      if (!isSfLine(s)) continue
      const name = batterNameFromLine(s)
      if (!name) continue
      const key = normalizeJaNameKey(name)
      const yid = nameToId.get(key)
      if (!yid) continue
      out.set(yid, (out.get(yid) ?? 0) + 1)
    }
  }
  return out
}

export type BattingSeasonAggYahoo = {
  gameIds: Set<string>
  pa: number
  ab: number
  r: number
  h: number
  h2: number
  h3: number
  hr: number
  tb: number
  rbi: number
  so: number
  bb: number
  ibb: number
  hbp: number
  sh: number
  sf: number
  sb: number
  cs: number
  e: number
  gidp: number
  risp_ab: number
  risp_h: number
}

export function emptyBattingSeasonAggYahoo(): BattingSeasonAggYahoo {
  return {
    gameIds: new Set(),
    pa: 0,
    ab: 0,
    r: 0,
    h: 0,
    h2: 0,
    h3: 0,
    hr: 0,
    tb: 0,
    rbi: 0,
    so: 0,
    bb: 0,
    ibb: 0,
    hbp: 0,
    sh: 0,
    sf: 0,
    sb: 0,
    cs: 0,
    e: 0,
    gidp: 0,
    risp_ab: 0,
    risp_h: 0,
  }
}

function sortPasForSituationSim(pas: PlateAppearance[]): PlateAppearance[] {
  // paId format in our backfill: `${gameId}-${inningNum}-${表/裏}-${seq}`
  // fallback to stable string sort.
  const parse = (paId: string): { inn: number; half: number; seq: number } => {
    const s = String(paId ?? "")
    const m = s.match(/-(\d+)-([表裏])-(\d+)$/)
    if (!m) return { inn: 999, half: 9, seq: 999999 }
    const inn = parseInt(m[1] ?? "999", 10) || 999
    const half = (m[2] ?? "") === "表" ? 0 : 1
    const seq = parseInt(m[3] ?? "999999", 10) || 999999
    return { inn, half, seq }
  }
  return [...pas].sort((a, b) => {
    const aa = parse(a.paId)
    const bb = parse(b.paId)
    if (aa.inn !== bb.inn) return aa.inn - bb.inn
    if (aa.half !== bb.half) return aa.half - bb.half
    if (aa.seq !== bb.seq) return aa.seq - bb.seq
    return String(a.paId ?? "").localeCompare(String(b.paId ?? ""))
  })
}

/**
 * RISP（得点圏）を Yahoo 一球由来の打席一覧から集計する。
 * - 走者状況は、同一イニング内の打席結果を簡易シミュレーションして「打席開始時」を推定する。
 * - ここでの RISP は「打席開始時に 2塁または 3塁に走者がいる」定義。
 */
function updateRispFromPasInGame(
  byBatter: Map<string, BattingSeasonAggYahoo>,
  gameId: string,
  doc: CanonicalGameDocument,
  pas: PlateAppearance[] | undefined,
): void {
  const sorted = sortPasForSituationSim(pas ?? [])
  if (sorted.length === 0) return

  let curHalf = ""
  let state = emptyGameState()
  for (const pa of sorted) {
    const half = String(pa.inningHalf ?? "").trim()
    if (half && half !== curHalf) {
      curHalf = half
      state = emptyGameState()
    }

    const bid = String(pa.yahooBatterId ?? "").trim()
    const result = lastPitchResult(doc, pa)
    const { risp } = classifySituationAtPaStart(state.b)

    if (bid && risp && isAtBat(result)) {
      const agg = byBatter.get(bid) ?? emptyBattingSeasonAggYahoo()
      agg.gameIds.add(gameId)
      agg.risp_ab += 1
      const bases = hitBases(result)
      if (bases > 0) agg.risp_h += 1
      byBatter.set(bid, agg)
    }

    state = applyPlayResult(state, result)
  }
}

/** 1 打席分の確定結果テキストから通算 agg を更新（出場末尾列・PA 共通） */
export function updateBattingAggFromResultJa(agg: BattingSeasonAggYahoo, result: string): void {
  const text = String(result ?? "").trim()
  if (!text) return
  if (isWalkLikeResultText(text)) agg.bb += 1
  if (isIntentionalWalkResultText(text)) agg.ibb += 1
  if (isHbp(text)) agg.hbp += 1
  if (isSacBunt(text)) agg.sh += 1
  if (isSacFly(text)) agg.sf += 1
  if (isStrikeoutResultJa(text)) agg.so += 1
  if (isGidp(text)) agg.gidp += 1

  if (isAtBat(text)) {
    agg.ab += 1
    const bases = hitBases(text)
    if (bases > 0) agg.h += 1
    if (bases === 2) agg.h2 += 1
    if (bases === 3) agg.h3 += 1
    if (bases === 4) agg.hr += 1
    agg.tb += bases
  }
}

export function updateBattingAggFromPa(
  agg: BattingSeasonAggYahoo,
  gameId: string,
  pa: PlateAppearance,
  doc?: CanonicalGameDocument,
): void {
  agg.gameIds.add(gameId)
  agg.pa += 1
  const result = doc ? lastPitchResult(doc, pa) : plateAppearanceLastResultText(pa)
  updateBattingAggFromResultJa(agg, result)
}

function appearanceSlotsForBatterInDoc(doc: CanonicalGameDocument, yahooId: string): string[] {
  const bid = String(yahooId ?? "").trim()
  if (!bid) return []
  const out: string[] = []
  for (const line of doc.domain?.battingLines ?? []) {
    if (String(line.yahooPlayerId ?? "").trim() !== bid) continue
    const s = line.appearancePaSlotsJa
    if (Array.isArray(s) && s.some((c) => String(c ?? "").trim() !== "")) {
      for (const x of s) out.push(String(x ?? "").trim())
    }
  }
  if (out.length > 0) return out
  for (const row of doc.game?.statsPlayerLinkedRows ?? []) {
    if (String(row.yahooPlayerId ?? "").trim() !== bid) continue
    return extractAppearanceStatSlotsFromCells(row.cells ?? [])
  }
  return []
}

function runnerEventDedupeKey(e: Pick<RunnerEvent, "eventId" | "inningHalf" | "kind" | "yahooRunnerId">): string {
  const yid = String(e.yahooRunnerId ?? "").trim()
  const kind = String(e.kind ?? "").trim()
  const inningHalf = String(e.inningHalf ?? "").trim()
  if (inningHalf && yid && kind) return `${inningHalf}\t${kind}\t${yid}`
  const eid = String(e.eventId ?? "").trim()
  return eid || `${kind}\t${yid}\t${inningHalf}`
}

/**
 * 1試合×1打者の盗塁死。本番は **`domain.runnerEvents` の `sourceTier: "score"`（一球記録文）のみ**。
 * 盗塁成功は出場成績の `battingLines.sb`（runnerEvents の SB は二重計上しない）。
 */
export function csCountForBatterFromRunnerEvents(
  doc: CanonicalGameDocument,
  yahooBatterId: string,
): number {
  const bid = String(yahooBatterId ?? "").trim()
  if (!bid) return 0
  const events = doc.domain?.runnerEvents ?? []
  if (!Array.isArray(events) || events.length === 0) return 0

  const seen = new Set<string>()
  let count = 0

  for (const e of events) {
    if (e.kind !== "CS" || e.sourceTier !== "score") continue
    if (String(e.yahooRunnerId ?? "").trim() !== bid) continue
    const key = runnerEventDedupeKey(e)
    if (!key || seen.has(key)) continue
    seen.add(key)
    count += 1
  }
  return count
}

/**
 * 1 試合×1 打者: 出場成績末尾列の非空セルごとに 1 打席として `updateBattingAggFromResultJa`。
 * 得点・打点・盗塁は出場表の数値列があれば補完。盗塁死は `runnerEvents`（一球 score 由来優先）。
 */
export function updateBattingAggFromAppearanceSlotsInGame(
  agg: BattingSeasonAggYahoo,
  gameId: string,
  doc: CanonicalGameDocument,
  yahooBatterId: string,
  lineForSupplement?: BattingLine | null,
): void {
  const slots = appearanceSlotsForBatterInDoc(doc, yahooBatterId)
  const exCs = csCountForBatterFromRunnerEvents(doc, yahooBatterId)
  let hadSlot = false
  for (const raw of slots) {
    const t = String(raw ?? "").trim()
    if (!t) continue
    hadSlot = true
    agg.pa += 1
    updateBattingAggFromResultJa(agg, t)
  }
  if (!hadSlot && exCs === 0) return
  if (hadSlot) {
    agg.gameIds.add(gameId)
    const line =
      lineForSupplement ??
      (doc.domain?.battingLines ?? []).find((l) => String(l.yahooPlayerId ?? "").trim() === yahooBatterId)
    if (line) {
      agg.r += line.r ?? 0
      agg.rbi += line.rbi ?? 0
      agg.sb += line.sb ?? 0
      agg.e += line.e ?? 0
    }
  }
  if (exCs > 0) {
    agg.cs += exCs
    agg.gameIds.add(gameId)
  }
}

/**
 * シーズン通算: 全試合の出場末尾列のみから打撃集計（Phase11 / Phase12 用・`TOPPAGE_BATTING_SEASON_AGG=appearance_slots`）。
 */
export function aggregateBattingSeasonByYahooBatterFromAppearanceSlots(
  docs: CanonicalGameDocument[],
): Map<string, BattingSeasonAggYahoo> {
  const byBatter = new Map<string, BattingSeasonAggYahoo>()
  for (const doc of docs) {
    const gameId = String(doc.gameId ?? "").trim()
    if (!gameId) continue
    const bids = new Set<string>()
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = String(line.yahooPlayerId ?? "").trim()
      if (bid) bids.add(bid)
    }
    for (const row of doc.game?.statsPlayerLinkedRows ?? []) {
      const bid = String(row.yahooPlayerId ?? "").trim()
      if (bid) bids.add(bid)
    }
    for (const e of doc.domain?.runnerEvents ?? []) {
      if (e?.kind === "CS" && e.sourceTier === "score") {
        const bid = String(e.yahooRunnerId ?? "").trim()
        if (bid) bids.add(bid)
      }
    }
    for (const bid of bids) {
      const slots = appearanceSlotsForBatterInDoc(doc, bid)
      const exCs = csCountForBatterFromRunnerEvents(doc, bid)
      if (!slots.some((s) => String(s ?? "").trim() !== "") && exCs === 0) continue
      const agg = byBatter.get(bid) ?? emptyBattingSeasonAggYahoo()
      const line = (doc.domain?.battingLines ?? []).find((l) => String(l.yahooPlayerId ?? "").trim() === bid)
      updateBattingAggFromAppearanceSlotsInGame(agg, gameId, doc, bid, line)
      byBatter.set(bid, agg)
    }
  }
  return byBatter
}

/**
 * Phase11 / Phase12 共通エントリ: 環境変数 `TOPPAGE_BATTING_SEASON_AGG` で hybrid と appearance_slots を切替。
 */
export function aggregateBattingSeasonForProfilesAndRankings(
  docs: CanonicalGameDocument[],
): Map<string, BattingSeasonAggYahoo> {
  if (isBattingSeasonAggFromAppearanceSlots()) {
    return aggregateBattingSeasonByYahooBatterFromAppearanceSlots(docs)
  }
  return aggregateBattingSeasonByYahooBatterHybridForProfiles(docs)
}

/**
 * 出場成績行と plateAppearances の両方があるとき、打席ログのみで通算に足してよいか。
 * 満たさない場合は従来どおり行優先（同一試合×打者で行と PA を二重に足さない）。
 *
 * 条件（運用で閾値は調整可）:
 * - マージ後の当該打者の打席が 1 件以上（回・表裏・順の重複は dedupe 後で数える）
 * - 各打席に resultSummaryJa か pitchEvents が少なくとも一方ある（空の幽霊打席だけの列は不十分）
 * - 行の AB・H と、上記打席から `updateBattingAggFromPa` で得た AB・H がそれぞれ 1 以内で一致（表とログの大矛盾でないこと）
 */
export function shouldAggregateBattingFromPaOnlyForBatterInGame(
  doc: CanonicalGameDocument,
  yahooBatterId: string,
): boolean {
  const bid = String(yahooBatterId ?? "").trim()
  if (!bid) return false

  const lines = (doc.domain?.battingLines ?? []).filter(
    (l) => String(l.yahooPlayerId ?? "").trim() === bid,
  )
  if (lines.length === 0) return false

  const gameId = doc.gameId
  const allPas = doc.domain?.plateAppearances ?? []
  const deduped = dedupePlateAppearancesByInningHalfOrder(allPas, gameId)
  const myPas = deduped.filter((pa) => String(pa.yahooBatterId ?? "").trim() === bid)
  if (myPas.length === 0) return false

  for (const pa of myPas) {
    const hasSummary = String(pa.resultSummaryJa ?? "").trim().length > 0
    const peCount = Array.isArray(pa.pitchEvents) ? pa.pitchEvents.length : 0
    if (!hasSummary && peCount < 1) return false
  }

  let lineAb = 0
  let lineH = 0
  for (const line of lines) {
    lineAb += line.ab ?? 0
    lineH += line.h ?? 0
  }

  const tmp = emptyBattingSeasonAggYahoo()
  const gid = String(gameId ?? "")
  for (const pa of myPas) {
    updateBattingAggFromPa(tmp, gid, pa, doc)
  }

  if (Math.abs(tmp.ab - lineAb) > 1) return false
  if (Math.abs(tmp.h - lineH) > 1) return false
  return true
}

/**
 * 全試合の打席から Yahoo 打者 ID ごとのシーズン集計。
 */
export function aggregateBattingSeasonByYahooBatter(
  docs: CanonicalGameDocument[],
): Map<string, BattingSeasonAggYahoo> {
  const byBatter = new Map<string, BattingSeasonAggYahoo>()
  for (const doc of docs) {
    const gameId = doc.gameId
    for (const pa of doc.domain.plateAppearances ?? []) {
      const bid = (pa.yahooBatterId ?? "").trim()
      if (!bid) continue
      const agg = byBatter.get(bid) ?? emptyBattingSeasonAggYahoo()
      updateBattingAggFromPa(agg, gameId, pa, doc)
      byBatter.set(bid, agg)
    }
    // RISP is derived from the full inning context; compute after we have all PAs.
    updateRispFromPasInGame(byBatter, gameId, doc, doc.domain.plateAppearances)
  }
  return byBatter
}

function paSacFlyCountForBatterInGame(
  bid: string,
  pas: PlateAppearance[] | undefined,
  doc: CanonicalGameDocument,
): number {
  let sf = 0
  for (const pa of pas ?? []) {
    if (String(pa.yahooBatterId ?? "").trim() !== bid) continue
    const result = lastPitchResult(doc, pa)
    if (isSacFly(result)) sf += 1
  }
  return sf
}

function paIbbCountForBatterInGame(
  bid: string,
  pas: PlateAppearance[] | undefined,
  doc: CanonicalGameDocument,
): number {
  let ibb = 0
  for (const pa of pas ?? []) {
    if (String(pa.yahooBatterId ?? "").trim() !== bid) continue
    const result = lastPitchResult(doc, pa)
    if (isIntentionalWalkResultText(result)) ibb += 1
  }
  return ibb
}

function paGidpCountForBatterInGame(
  bid: string,
  pas: PlateAppearance[] | undefined,
  doc: CanonicalGameDocument,
): number {
  let gidp = 0
  for (const pa of pas ?? []) {
    if (String(pa.yahooBatterId ?? "").trim() !== bid) continue
    const result = lastPitchResult(doc, pa)
    if (isGidp(result)) gidp += 1
  }
  return gidp
}

function paExtraBaseBreakdownForBatterInGame(
  bid: string,
  pas: PlateAppearance[] | undefined,
  doc: CanonicalGameDocument,
): { h2: number; h3: number } {
  let h2 = 0
  let h3 = 0
  for (const pa of pas ?? []) {
    if (String(pa.yahooBatterId ?? "").trim() !== bid) continue
    const result = lastPitchResult(doc, pa)
    // battingLines と整合させるため、AB になる打席のみ対象（四球/死球/犠打/犠飛は除外）
    if (!isAtBat(result)) continue
    const bases = hitBases(result)
    if (bases === 2) h2 += 1
    if (bases === 3) h3 += 1
  }
  return { h2, h3 }
}

/**
 * 1試合×1打者の battingLines（出場成績）行を、ハイブリッド集計の規則に従って `agg` に加算する。
 *
 * - 2B/3B/SF/IBB/GIDP は plateAppearances・text 等から補完。**CS は score 由来 runnerEvents のみ**（`csCountForBatterFromRunnerEvents`）。
 * - 同一試合で battingLines を優先する設計（plateAppearances を PA として二重加算しない）に従う。
 *
 * `precomputed` を渡せば 1試合内で複数回呼び出すときに同じ補助マップを共有できる。
 */
export function applyHybridBattingLineToAgg(
  agg: BattingSeasonAggYahoo,
  doc: CanonicalGameDocument,
  gameId: string,
  line: BattingLine,
  precomputed?: {
    runnerSbCs?: Map<string, { sb: number; cs: number }>
    sfByBatterFromText?: Map<string, number>
    gidpByBatterFromText?: Map<string, number>
    gidpByBatterFromBatterEvents?: Map<string, number>
  },
): void {
  const bid = String(line.yahooPlayerId ?? "").trim()
  if (!bid) return

  const runnerSbCs = precomputed?.runnerSbCs ?? sbCsFromTextPlayByPlay(doc)
  const sfByBatterFromText = precomputed?.sfByBatterFromText ?? sfFromTextPlayByPlay(doc)
  const gidpByBatterFromText = precomputed?.gidpByBatterFromText ?? gidpFromTextPlayByPlay(doc)
  const gidpByBatterFromBatterEvents =
    precomputed?.gidpByBatterFromBatterEvents ?? gidpFromBatterEvents(doc)

  const exPa = paExtraBaseBreakdownForBatterInGame(bid, doc.domain?.plateAppearances, doc)
  const exSf =
    (doc.domain?.plateAppearances ?? []).length > 0
      ? paSacFlyCountForBatterInGame(bid, doc.domain?.plateAppearances, doc)
      : (sfByBatterFromText.get(bid) ?? 0)
  const exIbb = paIbbCountForBatterInGame(bid, doc.domain?.plateAppearances, doc)
  const exGidpPa = paGidpCountForBatterInGame(bid, doc.domain?.plateAppearances, doc)
  const exGidpEvents = gidpByBatterFromBatterEvents.get(bid) ?? 0
  const exGidpText = gidpByBatterFromText.get(bid) ?? 0
  // plateAppearances の resultSummaryJa が「併殺」情報を落とすことがあるため、実況由来を下限として採用する
  const exGidp = Math.max(exGidpPa, exGidpEvents, exGidpText)
  const exCs = runnerSbCs.get(bid)?.cs ?? 0
  const h2 = line.h2 !== undefined ? line.h2 : exPa.h2
  const h3 = line.h3 !== undefined ? line.h3 : exPa.h3

  agg.gameIds.add(gameId)
  const ab = line.ab ?? 0
  const r = line.r ?? 0
  const h = line.h ?? 0
  const hr = line.hr ?? 0
  const rbi = line.rbi ?? 0
  const so = line.so ?? 0
  const bb = line.bb ?? 0
  const hbp = line.hbp ?? 0
  const sh = line.sh ?? 0
  const sb = line.sb ?? 0
  const e = line.e ?? 0
  // battingLines には「犠飛」が列として無いため、plateAppearances があればそこから補完する。
  const paApprox = ab + bb + hbp + sh + exSf

  agg.pa += paApprox
  agg.ab += ab
  agg.r += r
  agg.h += h
  agg.hr += hr
  agg.rbi += rbi
  agg.so += so
  agg.bb += bb
  agg.ibb += exIbb
  agg.hbp += hbp
  agg.sh += sh
  agg.sf += exSf
  agg.sb += sb
  agg.cs += exCs
  agg.e += e
  agg.gidp += exGidp

  agg.h2 += h2
  agg.h3 += h3

  // TB は battingLines の H/HR と、補完した 2B/3B から再構成（1B は残りで計算）
  const h1 = Math.max(0, h - h2 - h3 - hr)
  agg.tb += h1 + 2 * h2 + 3 * h3 + 4 * hr
}

/**
 * Phase 25: 対左右別 vs phase11 の Δ 検算用 “1試合×1打者の目標値”。
 *
 * - `TOPPAGE_BATTING_SEASON_AGG=appearance_slots`（本番既定）: Phase11/12 と同じ
 *   `updateBattingAggFromAppearanceSlotsInGame`（出場末尾列 / stats cells[14..]）。
 * - `hybrid`: 当該打者に battingLines がある試合ではハイブリッド行経路。
 *   `shouldAggregateBattingFromPaOnlyForBatterInGame` が真のときは PA 経路のみ。
 * いずれも当該試合に打席相当データが無いときは null。
 */
export type BattingTargetForGameAndBatter = {
  pa: number
  ab: number
  bb: number
  hbp: number
  sh: number
  sf: number
  /** 参考: H/HR は Δ 検算には使わない（不明バケツに振っても result 不明のため）。診断用に同梱。 */
  h: number
  hr: number
}

export function computeBattingTargetForGameAndBatter(
  doc: CanonicalGameDocument,
  yahooBatterId: string,
): BattingTargetForGameAndBatter | null {
  const bid = String(yahooBatterId ?? "").trim()
  if (!bid) return null

  const gameId = String(doc.gameId ?? "")

  if (isBattingSeasonAggFromAppearanceSlots()) {
    const slots = appearanceSlotsForBatterInDoc(doc, bid)
    const exCs = csCountForBatterFromRunnerEvents(doc, bid)
    if (!slots.some((s) => String(s ?? "").trim() !== "") && exCs === 0) return null

    const tmp = emptyBattingSeasonAggYahoo()
    const line = (doc.domain?.battingLines ?? []).find((l) => String(l.yahooPlayerId ?? "").trim() === bid)
    updateBattingAggFromAppearanceSlotsInGame(tmp, gameId, doc, bid, line ?? null)
    return {
      pa: tmp.pa,
      ab: tmp.ab,
      bb: tmp.bb,
      hbp: tmp.hbp,
      sh: tmp.sh,
      sf: tmp.sf,
      h: tmp.h,
      hr: tmp.hr,
    }
  }

  const lines = (doc.domain?.battingLines ?? []).filter(
    (l) => String(l.yahooPlayerId ?? "").trim() === bid,
  )
  if (lines.length === 0) return null

  if (shouldAggregateBattingFromPaOnlyForBatterInGame(doc, bid)) {
    const allPas = doc.domain?.plateAppearances ?? []
    const deduped = dedupePlateAppearancesByInningHalfOrder(allPas, doc.gameId)
    const myPas = deduped.filter((pa) => String(pa.yahooBatterId ?? "").trim() === bid)
    const tmp = emptyBattingSeasonAggYahoo()
    for (const pa of myPas) {
      updateBattingAggFromPa(tmp, gameId, pa, doc)
    }
    return {
      pa: tmp.pa,
      ab: tmp.ab,
      bb: tmp.bb,
      hbp: tmp.hbp,
      sh: tmp.sh,
      sf: tmp.sf,
      h: tmp.h,
      hr: tmp.hr,
    }
  }

  const tmp = emptyBattingSeasonAggYahoo()
  const runnerSbCs = sbCsFromTextPlayByPlay(doc)
  const sfByBatterFromText = sfFromTextPlayByPlay(doc)
  const gidpByBatterFromText = gidpFromTextPlayByPlay(doc)
  const gidpByBatterFromBatterEvents = gidpFromBatterEvents(doc)
  const pre = {
    runnerSbCs,
    sfByBatterFromText,
    gidpByBatterFromText,
    gidpByBatterFromBatterEvents,
  }

  for (const line of lines) {
    applyHybridBattingLineToAgg(tmp, doc, gameId, line, pre)
  }

  return {
    pa: tmp.pa,
    ab: tmp.ab,
    bb: tmp.bb,
    hbp: tmp.hbp,
    sh: tmp.sh,
    sf: tmp.sf,
    h: tmp.h,
    hr: tmp.hr,
  }
}

/** Phase13 等: 試合×打者の agg をシーズン agg に加算 */
export function mergeBattingSeasonAggYahoo(
  into: BattingSeasonAggYahoo,
  from: BattingSeasonAggYahoo,
): void {
  for (const g of from.gameIds) into.gameIds.add(g)
  into.pa += from.pa
  into.ab += from.ab
  into.r += from.r
  into.h += from.h
  into.h2 += from.h2
  into.h3 += from.h3
  into.hr += from.hr
  into.tb += from.tb
  into.rbi += from.rbi
  into.so += from.so
  into.bb += from.bb
  into.ibb += from.ibb
  into.hbp += from.hbp
  into.sh += from.sh
  into.sf += from.sf
  into.sb += from.sb
  into.cs += from.cs
  into.e += from.e
  into.gidp += from.gidp
  into.risp_ab += from.risp_ab
  into.risp_h += from.risp_h
}

/**
 * Phase11 / Phase12 と同一 SSOT の 1 試合×1 打者集計（Phase13 対チーム・球場・ホーム/ビジター用）。
 * `computeBattingTargetForGameAndBatter` と同じ分岐（appearance_slots / hybrid / PA-only）。
 */
export function aggregateBattingForBatterInGameForProfiles(
  doc: CanonicalGameDocument,
  yahooBatterId: string,
): BattingSeasonAggYahoo | null {
  const bid = String(yahooBatterId ?? "").trim()
  if (!bid) return null
  const gameId = String(doc.gameId ?? "").trim()
  if (!gameId) return null

  if (isBattingSeasonAggFromAppearanceSlots()) {
    const slots = appearanceSlotsForBatterInDoc(doc, bid)
    const exCs = csCountForBatterFromRunnerEvents(doc, bid)
    if (!slots.some((s) => String(s ?? "").trim() !== "") && exCs === 0) return null

    const tmp = emptyBattingSeasonAggYahoo()
    const line = (doc.domain?.battingLines ?? []).find((l) => String(l.yahooPlayerId ?? "").trim() === bid)
    updateBattingAggFromAppearanceSlotsInGame(tmp, gameId, doc, bid, line ?? null)
    return tmp.pa > 0 || tmp.ab > 0 || tmp.h > 0 || tmp.hr > 0 || tmp.bb > 0 ? tmp : null
  }

  const lines = (doc.domain?.battingLines ?? []).filter(
    (l) => String(l.yahooPlayerId ?? "").trim() === bid,
  )
  const pasForHybrid = dedupePlateAppearancesByInningHalfOrder(
    doc.domain?.plateAppearances ?? [],
    gameId,
  )
  const myPas = pasForHybrid.filter((pa) => String(pa.yahooBatterId ?? "").trim() === bid)

  if (lines.length === 0 && myPas.length === 0) return null

  const tmp = emptyBattingSeasonAggYahoo()
  const runnerSbCs = sbCsFromTextPlayByPlay(doc)
  const sfByBatterFromText = sfFromTextPlayByPlay(doc)
  const gidpByBatterFromText = gidpFromTextPlayByPlay(doc)
  const gidpByBatterFromBatterEvents = gidpFromBatterEvents(doc)
  const pre = {
    runnerSbCs,
    sfByBatterFromText,
    gidpByBatterFromText,
    gidpByBatterFromBatterEvents,
  }

  const usePaOnly = lines.length > 0 && shouldAggregateBattingFromPaOnlyForBatterInGame(doc, bid)

  if (lines.length > 0 && !usePaOnly) {
    for (const line of lines) {
      applyHybridBattingLineToAgg(tmp, doc, gameId, line, pre)
    }
  } else {
    for (const pa of myPas) {
      updateBattingAggFromPa(tmp, gameId, pa, doc)
    }
    if (usePaOnly) {
      for (const line of lines) {
        tmp.r += line.r ?? 0
        tmp.rbi += line.rbi ?? 0
      }
    }
    const gidpPa = paGidpCountForBatterInGame(bid, pasForHybrid, doc)
    const gidpText = gidpByBatterFromText.get(bid) ?? 0
    const gidpEvents = gidpByBatterFromBatterEvents.get(bid) ?? 0
    const delta = Math.max(gidpText, gidpEvents) - gidpPa
    if (delta > 0) tmp.gidp += delta
    const sb = runnerSbCs.get(bid)?.sb ?? 0
    if (sb) tmp.sb += sb
    const exCs = csCountForBatterFromRunnerEvents(doc, bid)
    if (exCs) tmp.cs += exCs
  }

  if (tmp.pa === 0 && tmp.ab === 0 && tmp.h === 0 && tmp.hr === 0 && tmp.bb === 0) return null

  const byBatter = new Map<string, BattingSeasonAggYahoo>([[bid, tmp]])
  updateRispFromPasInGame(byBatter, gameId, doc, pasForHybrid)
  return byBatter.get(bid) ?? tmp
}

/**
 * 個人ページ向け: 1試合×打者で「出場成績（battingLines）」か「plateAppearances」のどちらか一方だけを通算に足す（二重計上しない）。
 * 通常は行優先。一球マージ後の打席が十分に揃い、かつ行の AB/H と大きく矛盾しないときだけその試合では PA を正とする。
 *
 * 狙い:
 * - stats HTML パース欠損（missingOrPartial）時でも、復元された一球ログから最低限の通算を作れる
 * - 行と一球の「打席の数え」が微妙に食い違うがログが信頼できるときは PA に寄せる
 */
export function aggregateBattingSeasonByYahooBatterHybridForProfiles(
  docs: CanonicalGameDocument[],
): Map<string, BattingSeasonAggYahoo> {
  const byBatter = new Map<string, BattingSeasonAggYahoo>()

  for (const doc of docs) {
    const gameId = doc.gameId
    const runnerSbCs = sbCsFromTextPlayByPlay(doc)
    const sfByBatterFromText = sfFromTextPlayByPlay(doc)
    const gidpByBatterFromText = gidpFromTextPlayByPlay(doc)
    const gidpByBatterFromBatterEvents = gidpFromBatterEvents(doc)

    const bidsWithBattingLine = new Set<string>()
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = String(line.yahooPlayerId ?? "").trim()
      if (bid) bidsWithBattingLine.add(bid)
    }

    const paPrimaryDespiteLine = new Set<string>()
    for (const bid of bidsWithBattingLine) {
      if (shouldAggregateBattingFromPaOnlyForBatterInGame(doc, bid)) {
        paPrimaryDespiteLine.add(bid)
      }
    }

    // 行優先で集計する打者（出場成績行があるが、その試合では PA を正にしない打者）
    const linePrimaryBatterIds = new Set<string>()
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = String(line.yahooPlayerId ?? "").trim()
      if (!bid) continue
      if (paPrimaryDespiteLine.has(bid)) continue
      linePrimaryBatterIds.add(bid)
      const agg = byBatter.get(bid) ?? emptyBattingSeasonAggYahoo()
      applyHybridBattingLineToAgg(agg, doc, gameId, line, {
        runnerSbCs,
        sfByBatterFromText,
        gidpByBatterFromText,
        gidpByBatterFromBatterEvents,
      })
      byBatter.set(bid, agg)
    }

    const pasForHybrid = dedupePlateAppearancesByInningHalfOrder(
      doc.domain?.plateAppearances ?? [],
      gameId,
    )

    // 行優先の打者以外は plateAppearances（重複打席は 1 件にまとめたうえ）から集計
    for (const pa of pasForHybrid) {
      const bid = (pa.yahooBatterId ?? "").trim()
      if (!bid) continue
      if (linePrimaryBatterIds.has(bid)) continue
      const agg = byBatter.get(bid) ?? emptyBattingSeasonAggYahoo()
      updateBattingAggFromPa(agg, gameId, pa, doc)
      byBatter.set(bid, agg)
    }

    // PA 優先の試合では `updateBattingAggFromPa` が打点・得点を積まない。
    // AB/H などは一球ログを正とするが、RBI と R は出場成績行から同一試合内で補完する。
    for (const bid of paPrimaryDespiteLine) {
      const agg = byBatter.get(bid)
      if (!agg) continue
      let addR = 0
      let addRbi = 0
      for (const line of doc.domain?.battingLines ?? []) {
        if (String(line.yahooPlayerId ?? "").trim() !== bid) continue
        addR += line.r ?? 0
        addRbi += line.rbi ?? 0
      }
      agg.r += addR
      agg.rbi += addRbi
      byBatter.set(bid, agg)
    }

    // plateAppearances 経路の GIDP が実況より少ない場合は差分だけ補完（同一試合内での不足を埋める）
    for (const [bid, gidpText] of gidpByBatterFromText.entries()) {
      if (linePrimaryBatterIds.has(bid)) continue
      const agg = byBatter.get(bid)
      if (!agg) continue
      const gidpPa = paGidpCountForBatterInGame(bid, pasForHybrid, doc)
      const delta = gidpText - gidpPa
      if (delta > 0) agg.gidp += delta
    }

    // batterEvents（Yahoo /text DOM）があれば、それを実況の下限としても補完する（plateAppearances に依存しない）
    for (const [bid, gidpEvents] of gidpByBatterFromBatterEvents.entries()) {
      if (linePrimaryBatterIds.has(bid)) continue
      const agg = byBatter.get(bid)
      if (!agg) continue
      const gidpPa = paGidpCountForBatterInGame(bid, pasForHybrid, doc)
      const delta = gidpEvents - gidpPa
      if (delta > 0) agg.gidp += delta
    }

    // RISP: always compute from PAs if present (applies to both battingLines and PA-only batters)
    updateRispFromPasInGame(byBatter, gameId, doc, pasForHybrid)

    // plateAppearances 経路の打者に SB を補完（CS は score runnerEvents のみ・下記）
    for (const [bid, v] of runnerSbCs.entries()) {
      if (linePrimaryBatterIds.has(bid)) continue
      const agg = byBatter.get(bid)
      if (!agg) continue
      if (v.sb) agg.sb += v.sb
    }
    const csBidsNonLine = new Set<string>()
    for (const e of doc.domain?.runnerEvents ?? []) {
      if (e?.kind !== "CS" || e.sourceTier !== "score") continue
      const bid = String(e.yahooRunnerId ?? "").trim()
      if (bid && !linePrimaryBatterIds.has(bid)) csBidsNonLine.add(bid)
    }
    for (const bid of csBidsNonLine) {
      const exCs = csCountForBatterFromRunnerEvents(doc, bid)
      if (exCs === 0) continue
      const agg = byBatter.get(bid) ?? emptyBattingSeasonAggYahoo()
      agg.cs += exCs
      agg.gameIds.add(gameId)
      byBatter.set(bid, agg)
    }
  }

  return byBatter
}

/**
 * 出場成績テーブル（battingLines）のみから集計。
 * h2/h3 が行に無い場合は TB を単打近似（非 HR の安打をすべて 1 塁打とみなす）で合算する。
 * 打席は AB+BB+HBP+SH の近似（犠飛・敬遠・故意四球は行に無い場合がある）。
 */
export function updateBattingAggFromBattingLine(
  agg: BattingSeasonAggYahoo,
  gameId: string,
  line: BattingLine,
): void {
  agg.gameIds.add(gameId)
  const ab = line.ab ?? 0
  const r = line.r ?? 0
  const h = line.h ?? 0
  const hr = line.hr ?? 0
  const rbi = line.rbi ?? 0
  const so = line.so ?? 0
  const bb = line.bb ?? 0
  const hbp = line.hbp ?? 0
  const sh = line.sh ?? 0
  const sb = line.sb ?? 0
  // battingLines のみからは犠飛(SF)が取れないため、PA は近似（SF 未反映）。
  const paApprox = ab + bb + hbp + sh
  agg.pa += paApprox
  agg.ab += ab
  agg.r += r
  agg.h += h
  agg.hr += hr
  agg.rbi += rbi
  agg.so += so
  agg.bb += bb
  agg.hbp += hbp
  agg.sh += sh
  agg.sb += sb
  if (line.h2 != null || line.h3 != null) {
    const h2 = line.h2 ?? 0
    const h3 = line.h3 ?? 0
    agg.h2 += h2
    agg.h3 += h3
    const h1 = Math.max(0, h - h2 - h3 - hr)
    agg.tb += h1 + 2 * h2 + 3 * h3 + 4 * hr
  } else {
    const nonHr = Math.max(0, h - hr)
    agg.tb += nonHr + 4 * hr
  }
}

export function aggregateBattingSeasonByYahooBatterFromBattingLines(
  docs: CanonicalGameDocument[],
): Map<string, BattingSeasonAggYahoo> {
  const byBatter = new Map<string, BattingSeasonAggYahoo>()
  for (const doc of docs) {
    const gameId = doc.gameId
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = (line.yahooPlayerId ?? "").trim()
      if (!bid) continue
      const agg = byBatter.get(bid) ?? emptyBattingSeasonAggYahoo()
      updateBattingAggFromBattingLine(agg, gameId, line)
      byBatter.set(bid, agg)
    }
  }
  return byBatter
}

/** enrich 前の通算行（phase11 と同一式） */
export function battingAggToSeasonStatsRow(agg: BattingSeasonAggYahoo): SeasonStatsRow {
  const h1 = Math.max(0, agg.h - agg.h2 - agg.h3 - agg.hr)
  const slash = battingSlashRatesFromCounts(agg)
  const risp_avg = slashRate3FromCounts(agg.risp_h, agg.risp_ab)
  const sbPct = agg.sb + agg.cs > 0 ? agg.sb / (agg.sb + agg.cs) : null

  return {
    split_type: "total",
    split_value: "total",
    split_label: "通算",
    g: agg.gameIds.size,
    pa: agg.pa,
    ab: agg.ab,
    r: agg.r,
    h: agg.h,
    h1,
    h2: agg.h2,
    h3: agg.h3,
    hr: agg.hr,
    tb: agg.tb,
    rbi: agg.rbi,
    so: agg.so,
    bb: agg.bb,
    ibb: agg.ibb,
    hbp: agg.hbp,
    sh: agg.sh,
    sf: agg.sf,
    sb: agg.sb,
    cs: agg.cs,
    e: agg.e,
    gidp: agg.gidp,
    avg: slash.avg,
    obp: slash.obp,
    slg: slash.slg,
    ops: slash.ops,
    risp_avg,
    risp_ab: agg.risp_ab,
    risp_h: agg.risp_h,
    sb_pct: sbPct == null ? "" : (sbPct * 100).toFixed(1),
    isop: ".000",
    isod: ".000",
    babip: ".000",
    bb_pct: ".000",
    k_pct: ".000",
    bbk: ".000",
    gpa: ".000",
    rc: ".0",
    xr: ".0",
    seca: ".000",
    ta: ".000",
    noi: ".000",
  }
}

/** 個人ページ・ランキングで共通の最終行（セイバー補完済み） */
export function buildEnrichedBattingSeasonRow(agg: BattingSeasonAggYahoo): SeasonStatsRow {
  return enrichSeasonStatsRowSabermetrics(battingAggToSeasonStatsRow(agg))
}
