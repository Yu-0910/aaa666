import { createHash } from "crypto"
import {
  aggregateBattingSeasonByYahooBatterHybridForProfiles,
  plateAppearanceLastResultText,
} from "./canonicalBattingSeasonAgg"
import type {
  BattingLine,
  CanonicalGameDocument,
  PitchEvent,
  PlateAppearance,
} from "./types"
import { isWalkLikeResultText } from "../baseballWalkResult"
import { applyCarryForwardPitcherForIntentionalWalks } from "./carryForwardPitcherForIntentionalWalk"
import { enrichPlateAppearancesWithResolvedPitcherIds } from "./resolvePitcherIdByPaId"
import { isStrikeoutResultJa } from "./paOutcomeResultJa"
import { runnerEventsFromTextPlayByPlay } from "./runnerEventsFromTextPlayByPlay"
import { sortPitchEventsByPitchIndex } from "./sortPitchEventsByPitchIndex"
import { supplementPlateAppearancesFromTextPlayByPlay } from "./supplementPlateAppearancesFromTextPlayByPlay"

/** Python `parse_pitch_details` 行（JSON 経由） */
export type Phase10PitchRow = {
  game_id?: string
  inning?: string
  top_bottom?: string
  bat_order?: string
  pitcher_id?: string
  batter_id?: string
  pitch_no?: string
  pitch_type?: string
  speed_kmh?: string
  result?: string
  zone_id?: string
  /** 例: intentional_walk（テキスト由来の合成行） */
  record_kind?: string
  text_summary?: string
  source?: string
}

function numOrNull(s: string | undefined): number | null {
  if (s == null || String(s).trim() === "") return null
  const n = parseInt(String(s), 10)
  return Number.isFinite(n) ? n : null
}

function sortKey(r: Phase10PitchRow): [number, string, number, number] {
  const inn = parseInt(String(r.inning ?? "0"), 10) || 0
  const tb = String(r.top_bottom ?? "")
  const bo = parseInt(String(r.bat_order ?? "0"), 10) || 0
  const pn = parseInt(String(r.pitch_no ?? "0"), 10) || 0
  return [inn, tb, bo, pn]
}

export function computeEventsFingerprint(rows: Phase10PitchRow[]): string {
  const stable = [...rows].sort((a, b) => {
    const ka = sortKey(a)
    const kb = sortKey(b)
    for (let i = 0; i < 4; i++) {
      if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1
    }
    return 0
  })
  return createHash("sha256").update(JSON.stringify(stable), "utf8").digest("hex")
}

function rowToPitchEvent(r: Phase10PitchRow): PitchEvent {
  const speed = numOrNull(r.speed_kmh)
  return {
    pitchIndex: numOrNull(r.pitch_no) ?? undefined,
    yahooPitcherId: r.pitcher_id?.trim() || undefined,
    yahooBatterId: r.batter_id?.trim() || undefined,
    speedKmh: speed,
    pitchTypeJa: r.pitch_type?.trim() || null,
    zoneId: numOrNull(r.zone_id),
    resultJa: r.result?.trim() || null,
  }
}

type PaKey = string

function paKey(r: Phase10PitchRow): PaKey {
  return `${r.inning ?? ""}|${r.top_bottom ?? ""}|${r.bat_order ?? ""}`
}

/** 一球ログの最終球 `resultJa`（§6a 要約退避より生の表記）。誤分裂打席の切り分けに使う */
function lastPitchEventResultJaRaw(pa: PlateAppearance): string {
  const pe = pa.pitchEvents ?? []
  if (pe.length === 0) return ""
  const sorted = sortPitchEventsByPitchIndex(pe)
  const last = sorted[sorted.length - 1]
  return String(last?.resultJa ?? "").trim()
}

/**
 * 打席要約用: 末尾だけが「ボール」または「ボール[…]」のとき、**同一打席内**の直前の result を要約に使う。
 * （docs/yahoo_plate_appearance_batting_rules.md §6a「次行」方針のうち、マージ時点で可能な部分）
 */
function isBallLikeTrailingResultJa(r: string | null | undefined): boolean {
  const s = (r ?? "").trim()
  if (!s) return false
  // 「ボール[ランエンドヒット]」等: 表記上ボールだが括弧内に決着（安打系）があり、打席確定行として扱う
  if (/^ボール\[/.test(s) && /(ランエンドヒット|タイムリー|適時打|安打|ヒット)/.test(s)) return false
  // ハーフスイング付きボールは四球確定寄りの表記のため、中間扱いにしない
  if (/^ボール\[/.test(s) && /ハーフスイング/.test(s)) return false
  return /^ボール$/.test(s) || /^ボール\[/.test(s)
}

/**
 * ボールに加え、**ストライクのカウント進行のみ**（括弧付き状況は含まない）を末尾とみなす。
 * §6b: 詳細表がここで終わっていると打席が続く可能性があり、要約は直前行へ退避する。
 */
function isStrikeCountOnlyTrailingResultJa(r: string | null | undefined): boolean {
  const s = (r ?? "").trim()
  if (!s) return false
  return s === "見逃し" || s === "空振り" || s === "ファウル"
}

function isIntermediateTrailingResultJa(r: string | null | undefined): boolean {
  return isBallLikeTrailingResultJa(r) || isStrikeCountOnlyTrailingResultJa(r)
}

/**
 * `resultSummaryJa` 用の要約文字列。
 * - 行は **同一 paKey** に属するものだけが渡る（2アウト・盗塁失敗で攻守交替したあとの
 *   **相手イニング先頭打者**は別キー `inning|表裏|打順` になり、ここには混ざらない）。
 * - 末尾が `ボール` / `ボール[`、または **ストライク進行のみ**（`見逃し` / `空振り` / 素の `ファウル`）の
 *   行が続くとき、**後ろから見て**それらを除いた直近の行の result を採用（§6a・§6b）。
 *   （HTML に決着行が無い場合は改善しない）
 * §6a・§6b: テスト・検証用に公開（同一打席の sorted 行から要約文字列を得る）
 */
/**
 * 同一打席の result 文字列列（先頭から一球目順）から `resultSummaryJa` を得る。
 * Phase10 行・canonical の `pitchEvents` の両方で共通。
 */
export function pickResultSummaryJaFromResultJaSequence(
  results: (string | null | undefined)[],
): string | undefined {
  if (results.length === 0) return undefined
  let i = results.length - 1
  while (i > 0 && isIntermediateTrailingResultJa(results[i])) {
    i -= 1
  }
  const cand = (results[i] ?? "").trim()
  if (cand && isIntermediateTrailingResultJa(cand)) {
    return (results[results.length - 1] ?? "").trim() || undefined
  }
  return cand || (results[results.length - 1] ?? "").trim() || undefined
}

/**
 * canonical の `pitchEvents`（resultJa）から `resultSummaryJa` を再計算する。
 * `mergePhase10IntoCanonical` と同じ §6a・§6b ルール。
 */
export function pickResultSummaryJaFromPitchEvents(events: PitchEvent[] | undefined): string | undefined {
  if (!events?.length) return undefined
  const sorted = sortPitchEventsByPitchIndex(events)
  return pickResultSummaryJaFromResultJaSequence(sorted.map((e) => e.resultJa))
}

export function pickResultSummaryJaFromPitchRows(sorted: Phase10PitchRow[]): string | undefined {
  return pickResultSummaryJaFromResultJaSequence(sorted.map((r) => r.result))
}

/**
 * Yahoo 一球で「打席」が出場成績より多いとき、誤って別打席になっている
 * `ボール[ランエンドヒット]` 行を優先的に落とす（phase11 ハイブリッドの P0 を正とする）。
 * 出場成績行が無い打者（代打のみ等）は対象外。
 */
function trimPhase10PlateAppearancesAgainstBattingLines(
  doc: CanonicalGameDocument,
  pas: PlateAppearance[],
): PlateAppearance[] {
  const lines = doc.domain?.battingLines ?? []
  if (!Array.isArray(lines) || lines.length === 0) return pas

  const tmpDoc: CanonicalGameDocument = {
    ...doc,
    domain: { ...doc.domain, plateAppearances: pas },
  }
  const hybrid = aggregateBattingSeasonByYahooBatterHybridForProfiles([tmpDoc])

  const byBid = new Map<string, PlateAppearance[]>()
  for (const p of pas) {
    const bid = String(p.yahooBatterId ?? "").trim()
    if (!bid) continue
    const arr = byBid.get(bid) ?? []
    arr.push(p)
    byBid.set(bid, arr)
  }

  const dropIds = new Set<string>()
  const dropCandidateRes = [
    /^ボール\[.*ランエンドヒット/,
    /^ボール\[.*ハーフスイング/,
    // 走塁アノテーションが「ボール[…]」に載り別打席化（例: ヘッドスライディング）
    /^ボール\[.*ヘッドスライディング/,
    // ワイルドピッチ寄りの「ボール[ワンバウンド…]」で別打席化（要約がファウル[…]だけ残る例あり）
    /^ボール\[.*ワンバウンド/,
    // 取得欠けで要約がファウル/ボールだけの「未確定」に見える打席（別打席と二重に載りやすい）
    /^ファウル$/,
    /^ボール$/,
    // 走塁が「見逃し[…]」に付く別打席化（例: ヘッドスライディング）
    /^見逃し\[.*ヘッドスライディング/,
  ]

  for (const [bid, list] of byBid) {
    const hasLine = lines.some((l) => String(l.yahooPlayerId ?? "").trim() === bid)
    if (!hasLine) continue

    const hRow = hybrid.get(bid)
    const targetPa = hRow?.pa ?? 0
    const withText = list.filter((p) => plateAppearanceLastResultText(p).trim())
    if (withText.length <= targetPa) continue

    let over = withText.length - targetPa
    for (const badPattern of dropCandidateRes) {
      if (over <= 0) break
      const candidates = list
        .filter((p) => {
          const s = String(p.resultSummaryJa ?? plateAppearanceLastResultText(p) ?? "").trim()
          return badPattern.test(s)
        })
        .sort((a, b) => comparePaIdChronological(String(a.paId ?? ""), String(b.paId ?? "")))

      for (const p of candidates) {
        if (over <= 0) break
        const pid = String(p.paId ?? "").trim()
        if (!pid || dropIds.has(pid)) continue
        dropIds.add(pid)
        over -= 1
      }
    }

    // 要約は「ファウル[…]」等だが最終球だけ「ボール[ワンバウンド…]」— §6a の退避で表層が伏せられ残る誤分裂
    if (over > 0) {
      const wildBounceBall = /^ボール\[.*ワンバウンド/
      const candidates = list
        .filter((p) => wildBounceBall.test(lastPitchEventResultJaRaw(p)))
        .sort((a, b) => comparePaIdChronological(String(a.paId ?? ""), String(b.paId ?? "")))
      for (const p of candidates) {
        if (over <= 0) break
        const pid = String(p.paId ?? "").trim()
        if (!pid || dropIds.has(pid)) continue
        dropIds.add(pid)
        over -= 1
      }
    }

    // 1 球だけかつ要約がストライク進行のみ — 表の切り方ミスで空の打席が載る例（出場成績より多いときのみ）
    if (over > 0) {
      const candidates = list
        .filter((p) => {
          const sorted = sortPitchEventsByPitchIndex(p.pitchEvents ?? [])
          if (sorted.length !== 1) return false
          const s = String(p.resultSummaryJa ?? sorted[0]?.resultJa ?? "").trim()
          return s === "見逃し" || s === "空振り"
        })
        .sort((a, b) => comparePaIdChronological(String(a.paId ?? ""), String(b.paId ?? "")))
      for (const p of candidates) {
        if (over <= 0) break
        const pid = String(p.paId ?? "").trim()
        if (!pid || dropIds.has(pid)) continue
        dropIds.add(pid)
        over -= 1
      }
    }

    // stats 行の打席結果列（非空セルのみ）と時系列 PA を index 対応させ、**同じ位置で三振系要約と
    // 非三振のセルが突き合わさる**行は誤分裂とみなす（先頭に限らない。例: 2 番目が見逃し vs 左飛）。
    // また PA が 1 つ多く末尾が三振系でセルが尽きている場合も除去（例: 見逃し[ヘッドスライディング]）。
    if (over > 0) {
      const statRows = doc.game?.statsPlayerLinkedRows ?? []
      const row = statRows.find((r) => String(r.yahooPlayerId ?? "").trim() === bid)
      const lineTexts: string[] = []
      const cells = row?.cells
      if (Array.isArray(cells) && cells.length > 14) {
        for (let i = 14; i < cells.length; i++) {
          const t = String(cells[i] ?? "").trim()
          if (t) lineTexts.push(t)
        }
      }
      if (lineTexts.length > 0) {
        const sorted = list
          .slice()
          .sort((a, b) =>
            comparePaIdChronological(String(a.paId ?? ""), String(b.paId ?? "")),
          )
        if (sorted.length === lineTexts.length + 1) {
          for (let i = 0; i < sorted.length; i++) {
            if (over <= 0) break
            const p = sorted[i]!
            const pid = String(p.paId ?? "").trim()
            if (!pid || dropIds.has(pid)) continue
            const paText = String(p.resultSummaryJa ?? plateAppearanceLastResultText(p) ?? "").trim()
            if (!isStrikeoutResultJa(paText)) continue
            const cell = i < lineTexts.length ? String(lineTexts[i] ?? "").trim() : ""
            const orphanStrikeoutPastLine = !cell && i >= lineTexts.length
            const strikeoutVsNonSoCell = !!cell && !isStrikeoutResultJa(cell)
            if (orphanStrikeoutPastLine || strikeoutVsNonSoCell) {
              dropIds.add(pid)
              over -= 1
              break
            }
          }
        }
      }
    }

    // 「四球[ワンバウンド]」が出場成績に四球として載らないときのみ（誤分裂打席の疑い）
    if (over > 0 && (hRow?.bb ?? 0) === 0) {
      const candidates = list
        .filter((p) => {
          const s = String(p.resultSummaryJa ?? plateAppearanceLastResultText(p) ?? "").trim()
          return /^四球\[.*ワンバウンド/.test(s)
        })
        .sort((a, b) => comparePaIdChronological(String(a.paId ?? ""), String(b.paId ?? "")))
      for (const p of candidates) {
        if (over <= 0) break
        const pid = String(p.paId ?? "").trim()
        if (!pid || dropIds.has(pid)) continue
        dropIds.add(pid)
        over -= 1
      }
    }
  }

  if (dropIds.size === 0) return pas
  return pas.filter((p) => !dropIds.has(String(p.paId ?? "").trim()))
}

type BattingLineWithCells = BattingLine & { cells?: string[] }

/** `paId` = `{gameId}-{inning}-{表|裏}-{打順}` を時系列で比較（文字列 sort だと 11回が 2回より前に来る） */
function comparePaIdChronological(a: string, b: string): number {
  const pa = String(a).split("-")
  const pb = String(b).split("-")
  if (pa.length < 4 || pb.length < 4) return String(a).localeCompare(String(b), "ja")
  const innA = parseInt(pa[1] ?? "0", 10) || 0
  const innB = parseInt(pb[1] ?? "0", 10) || 0
  if (innA !== innB) return innA - innB
  const tbA = pa[2] ?? ""
  const tbB = pb[2] ?? ""
  if (tbA !== tbB) return tbA.localeCompare(tbB, "ja")
  const boA = parseInt(pa[3] ?? "0", 10) || 0
  const boB = parseInt(pb[3] ?? "0", 10) || 0
  return boA - boB
}

function resultTextsFromBattingLineCells(line: BattingLineWithCells): string[] {
  const c = line.cells
  if (!Array.isArray(c) || c.length <= 14) return []
  const out: string[] = []
  for (let i = 14; i < c.length; i++) {
    const t = String(c[i] ?? "").trim()
    if (t) out.push(t)
  }
  return out
}

function lineCellLooksLikeOfficialGidp(cell: string): boolean {
  const s = String(cell ?? "").trim()
  if (!s || /併殺崩れ/.test(s)) return false
  return /併打|併殺|ゲッツー/.test(s)
}

function statsCellLooksLikeSacrificeBunt(cell: string): boolean {
  return /犠打|送りバント|犠野|投犠|捕犠|スクイズ|セーフティ/.test(String(cell ?? "").trim())
}

/**
 * 時系列・件数が stats の打席結果列と一致するとき、四球・死球の取り違えや
 * 「犠打系括弧付きだが行の SH=0・セルに犠表記なし」の誤判定をセル文言で上書きする。
 */
function alignZipOutcomesWithStatsTextCells(
  doc: CanonicalGameDocument,
  pas: PlateAppearance[],
): PlateAppearance[] {
  const statRows = doc.game?.statsPlayerLinkedRows ?? []
  if (statRows.length === 0) return pas

  const lineShByBid = new Map<string, number>()
  for (const bl of doc.domain?.battingLines ?? []) {
    const id = String(bl.yahooPlayerId ?? "").trim()
    if (!id) continue
    lineShByBid.set(id, bl.sh ?? 0)
  }

  const paByBid = new Map<string, PlateAppearance[]>()
  for (const p of pas) {
    const bid = String(p.yahooBatterId ?? "").trim()
    if (!bid) continue
    const arr = paByBid.get(bid) ?? []
    arr.push(p)
    paByBid.set(bid, arr)
  }

  const sacRe = /犠打|送りバント|セーフティスクイズ|スクイズ|犠野/
  const replacements = new Map<string, PlateAppearance>()

  for (const row of statRows) {
    const bid = String(row.yahooPlayerId ?? "").trim()
    if (!bid) continue
    const cells = resultTextsFromBattingLineCells({
      yahooPlayerId: bid,
      playerName: row.playerName,
      inferredFrom: "stats_row_v0",
      cells: row.cells,
    } as BattingLineWithCells)
    if (cells.length === 0) continue
    const list = (paByBid.get(bid) ?? [])
      .slice()
      .sort((a, b) => comparePaIdChronological(String(a.paId ?? ""), String(b.paId ?? "")))
    if (list.length !== cells.length) continue

    const lineSh = lineShByBid.get(bid) ?? 0

    for (let i = 0; i < list.length; i++) {
      const p = list[i]!
      const cell = String(cells[i] ?? "").trim()
      if (!cell) continue
      const pid = String(p.paId ?? "").trim()
      if (!pid) continue
      const paText = String(p.resultSummaryJa ?? plateAppearanceLastResultText(p) ?? "").trim()

      let nextSummary: string | null = null
      if (isWalkLikeResultText(cell) && !isWalkLikeResultText(paText)) {
        nextSummary = cell
      } else if (/死球/.test(cell) && !/死球/.test(paText)) {
        nextSummary = cell
      } else if (
        lineSh === 0 &&
        sacRe.test(paText) &&
        !statsCellLooksLikeSacrificeBunt(cell) &&
        !lineCellLooksLikeOfficialGidp(cell)
      ) {
        nextSummary = cell
      }

      if (nextSummary != null) replacements.set(pid, { ...p, resultSummaryJa: nextSummary })
    }
  }

  if (replacements.size === 0) return pas
  return pas.map((p) => replacements.get(String(p.paId ?? "").trim()) ?? p)
}

/**
 * 一球・実況補完が「犠打」略のみで、出場成績テキスト列が併殺（例: 捕併打）の打席を行に合わせる。
 * （SH 扱いのままだと vs_hand 集計がハイブリッドの AB とずれる）
 *
 * テキスト列は `game.statsPlayerLinkedRows[].cells` に残る（`domain.battingLines` は数値行のみ）。
 */
function alignSacBuntSummariesWithBattingLineCells(
  doc: CanonicalGameDocument,
  pas: PlateAppearance[],
): PlateAppearance[] {
  const statRows = doc.game?.statsPlayerLinkedRows ?? []
  if (statRows.length === 0) return pas

  const paByBid = new Map<string, PlateAppearance[]>()
  for (const p of pas) {
    const bid = String(p.yahooBatterId ?? "").trim()
    if (!bid) continue
    const arr = paByBid.get(bid) ?? []
    arr.push(p)
    paByBid.set(bid, arr)
  }

  const sacRe = /犠打|送りバント|セーフティスクイズ|スクイズ|犠野/
  const replacements = new Map<string, PlateAppearance>()

  for (const row of statRows) {
    const bid = String(row.yahooPlayerId ?? "").trim()
    if (!bid) continue
    const cells = resultTextsFromBattingLineCells({
      yahooPlayerId: bid,
      playerName: row.playerName,
      inferredFrom: "stats_row_v0",
      cells: row.cells,
    } as BattingLineWithCells)
    if (cells.length === 0) continue
    const list = (paByBid.get(bid) ?? [])
      .slice()
      .sort((a, b) => comparePaIdChronological(String(a.paId ?? ""), String(b.paId ?? "")))
    if (list.length !== cells.length) continue

    for (let i = 0; i < list.length; i++) {
      const p = list[i]!
      const cell = cells[i] ?? ""
      const paText = String(p.resultSummaryJa ?? plateAppearanceLastResultText(p) ?? "").trim()
      if (!lineCellLooksLikeOfficialGidp(cell)) continue
      if (!sacRe.test(paText) || /併打|併殺/.test(paText)) continue
      const pid = String(p.paId ?? "").trim()
      if (!pid) continue
      replacements.set(pid, { ...p, resultSummaryJa: cell })
    }
  }

  if (replacements.size === 0) return pas
  return pas.map((p) => replacements.get(String(p.paId ?? "").trim()) ?? p)
}

/**
 * Phase 10: 一球ログ行を canonical.domain に反映する（Normalized→Canonical の上にマージ）。
 *
 * `resultSummaryJa` は `pickResultSummaryJaFromPitchRows` で決める（末尾が中間表記のときは
 * 同一打席内の直前行を優先。§6a・§6b）。**取得で決着行が欠けている**場合は要約は直らない。
 * 打席境界は `inning|表裏|打順`（2アウト・盗塁失敗後の相手先頭は別キーで混在しない）。
 * 取得ルール: `docs/yahoo_plate_appearance_batting_rules.md` §6a、`scripts/scrape_yahoo_pitch_details.py` で複数表を結合。
 *
 * **打席の `yahooPitcherId`**: 先頭行の `pitcher_id`（従来互換）。対左右は `yahooPitcherIdForVsHandFromPa` が
 * `pitchEvents` の末尾から決着側の投手 ID を拾う。
 */
export function mergePhase10IntoCanonical(
  doc: CanonicalGameDocument,
  rows: Phase10PitchRow[],
  phase10Missing: string[],
): CanonicalGameDocument {
  const fp = computeEventsFingerprint(rows)
  const byPa = new Map<PaKey, Phase10PitchRow[]>()
  for (const r of rows) {
    const k = paKey(r)
    const list = byPa.get(k) ?? []
    list.push(r)
    byPa.set(k, list)
  }

  const plateAppearances: PlateAppearance[] = []
  const keys = [...byPa.keys()].sort((a, b) => {
    const [ia, ta, ba] = a.split("|")
    const [ib, tb, bb] = b.split("|")
    const nia = parseInt(ia, 10) || 0
    const nib = parseInt(ib, 10) || 0
    if (nia !== nib) return nia - nib
    if (ta !== tb) return ta.localeCompare(tb)
    return (parseInt(ba, 10) || 0) - (parseInt(bb, 10) || 0)
  })

  for (const k of keys) {
    const list = byPa.get(k) ?? []
    const sorted = [...list].sort(
      (a, b) => (numOrNull(a.pitch_no) ?? 0) - (numOrNull(b.pitch_no) ?? 0),
    )
    const first = sorted[0]
    const inn = String(first?.inning ?? "")
    const tb = String(first?.top_bottom ?? "")
    const bo = String(first?.bat_order ?? "")
    const paId = `${doc.gameId}-${inn}-${tb}-${bo}`
    const inningHalf = inn && tb ? `${inn}回${tb}` : undefined
    const pevents: PitchEvent[] = sorted.map(rowToPitchEvent)
    const resultSummaryJa = pickResultSummaryJaFromPitchRows(sorted)
    plateAppearances.push({
      paId,
      inningHalf,
      yahooPitcherId: first?.pitcher_id?.trim() || undefined,
      yahooBatterId: first?.batter_id?.trim() || undefined,
      baseBefore: undefined,
      resultSummaryJa,
      pitchEvents: pevents,
    })
  }

  const supplemented = supplementPlateAppearancesFromTextPlayByPlay(doc, plateAppearances)
  const carried = applyCarryForwardPitcherForIntentionalWalks(supplemented)
  // 実況補完で打席が戻ることがあるため、出場成績との突き合わせは最後に行う
  const plateAppearancesFilled = enrichPlateAppearancesWithResolvedPitcherIds(
    alignZipOutcomesWithStatsTextCells(
      doc,
      alignSacBuntSummariesWithBattingLineCells(
        doc,
        trimPhase10PlateAppearancesAgainstBattingLines(doc, carried),
      ),
    ),
  )
  // 本番 CS は score 由来 runnerEvents のみ。Phase10 マージで text 抽出に上書きしない。
  const scoreRunnerEvents = (doc.domain?.runnerEvents ?? []).filter((e) => e?.sourceTier === "score")
  const runnerEvents =
    scoreRunnerEvents.length > 0 ? scoreRunnerEvents : runnerEventsFromTextPlayByPlay(doc)
  const paHash = createHash("sha256").update(JSON.stringify(plateAppearancesFilled), "utf8").digest("hex")
  const eventsFingerprintMerged = createHash("sha256").update(`${fp}|ibb-carry-v1|${paHash}`, "utf8").digest("hex")

  const pitchEventsFlat: PitchEvent[] = plateAppearancesFilled.flatMap((p) => p.pitchEvents ?? [])

  const extraMissing = phase10Missing.map((m) => `phase10:${m}`)
  const mergedMissing = [...doc.game.missingOrPartial, ...extraMissing]

  return {
    ...doc,
    builtAt: new Date().toISOString(),
    eventsFingerprint: eventsFingerprintMerged,
    game: {
      ...doc.game,
      missingOrPartial: mergedMissing,
      pitchByPitchNote:
        rows.length > 0
          ? { status: "restored_phase10", note: `pitch rows=${rows.length}` }
          : doc.game.pitchByPitchNote,
    },
    domain: {
      ...doc.domain,
      plateAppearances: plateAppearancesFilled,
      pitchEvents: pitchEventsFlat,
      runnerEvents,
    },
  }
}
