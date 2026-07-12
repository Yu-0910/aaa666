/**
 * Sportsnavi Phase2: stats / text HTML パースと、canonical 用 stats 行からの打撃・投球行推論。
 * infer* は lib/yahooGame/buildCanonical.ts と同一ロジック（変更時は両方更新すること）。
 */

import { buildStatCellsFromTdParts } from "./sportsnaviStatsRowCells.mjs"
import { parseSportsnaviStatsPlayerRows } from "./sportsnaviStatsStartingLineup.mjs"
import {
  mergePitchingLinesFromScoreAndStatsTables,
  parseSportsnaviPitcherScoreTableRows,
} from "./sportsnaviPitcherScoreTableParse.mjs"

export {
  isStarterPositionCell,
  fieldingPositionFromStarterCell,
  parseTeamsFromSportsnaviStatsHtml,
  parseStatsPlayerRowFromTrInner,
} from "./sportsnaviStatsStartingLineup.mjs"

const MIN_STATS_CELLS = 24

/** Phase 1: `lib/yahooGame/appearanceStatsTrailingCells.ts` の STATS_ROW_APPEARANCE_START_INDEX と同期 */
const STATS_ROW_APPEARANCE_START_INDEX = 14

/**
 * @param {string[]} cells
 * @param {number} [fromIndex=14]
 * @returns {string[]}
 */
function extractAppearanceStatSlotsFromCells(cells, fromIndex = STATS_ROW_APPEARANCE_START_INDEX) {
  if (!cells || cells.length <= fromIndex) return []
  return cells.slice(fromIndex).map((t) => String(t ?? "").trim())
}

const DIGITS = /^\d+$/

function isEraTwoDecimals(s) {
  return /^\d+\.\d{2}$/.test(String(s).trim())
}

function parseCellInt(i, c) {
  const x = c[i]
  return x && DIGITS.test(x) ? parseInt(x, 10) : undefined
}

/** lib/yahooGame/resultJaHitBases.ts と同一（変更時は両方更新） */
function isWalkLikeResultText(result) {
  const s = String(result ?? "").trim()
  if (!s) return false
  return /四球|敬遠|故意四|故意四球|申告敬遠|フォアボール|ボールフォー/.test(s)
}

function stripBracketNotes(result) {
  return String(result).replace(/\[[^\]]*\]/g, "")
}

function isHbp(result) {
  return /死球/.test(result)
}
function isSacBunt(result) {
  return /犠打|送りバント/.test(result)
}
function isSacFly(result) {
  return /犠飛/.test(result)
}

function isInterferenceResultText(r) {
  const raw = String(r ?? "").trim()
  if (!raw) return false
  return /妨害|打妨|打撃妨害|打者妨|守妨/.test(raw)
}

function shouldTreatInterferenceAsAtBat(r) {
  const raw = String(r ?? "").trim()
  if (!isInterferenceResultText(raw)) return false
  return /三振|空三振|見三振/.test(raw) || /^(空振り|見逃し)/.test(raw)
}

function hitBases(result) {
  const core = stripBracketNotes(result)
  if (/本塁打|ホームラン|HR/.test(core)) return 4
  if (/左中本|右中本|左本|右本|中本(?:$)/.test(core)) return 4
  if (/三塁打|[一二三遊左中右投捕]３|[一二三遊左中右投捕]3/.test(core)) return 3
  if (/二塁打|[一二三遊左中右投捕]２|[一二三遊左中右投捕]2/.test(core)) return 2
  if (/内安|内野安打/.test(core)) return 1
  if (/二安/.test(core)) return 1
  if (/三安/.test(core)) return 1
  if (/安打|ヒット|左安|中安|右安|遊安|投安|一安/.test(core)) return 1
  return 0
}

function isAtBat(result) {
  if (!result) return false
  if (isWalkLikeResultText(result) || isHbp(result) || isSacBunt(result) || isSacFly(result)) return false
  if (isInterferenceResultText(result)) return shouldTreatInterferenceAsAtBat(result)
  return true
}

function countExtraBaseHitsFromStatsRowTextCells(c) {
  let h2 = 0
  let h3 = 0
  for (let i = 14; i < c.length; i++) {
    const t = String(c[i] ?? "").trim()
    if (!t) continue
    if (!isAtBat(t)) continue
    const bases = hitBases(t)
    if (bases === 2) h2 += 1
    if (bases === 3) h3 += 1
  }
  return { h2, h3 }
}

function capExtraBaseHitsToHitLineTotal(h2, h3, h, hr) {
  const max23 = Math.max(0, h - hr)
  let h3c = Math.min(Math.max(0, h3), max23)
  let h2c = Math.min(Math.max(0, h2), max23 - h3c)
  return { h2: h2c, h3: h3c }
}

/** @param {{ yahooPlayerId: string | null, playerName: string, cells: string[] }} row */
export function inferBattingLineFromStatsRow(row) {
  if (!row.yahooPlayerId || row.cells.length < 12) return null
  const c = row.cells
  const p0 = c[0] ?? ""
  if (p0 === "投" || p0 === "H" || p0 === "敗" || p0 === "勝") return null
  if (p0 === "" && isEraTwoDecimals(c[2] ?? "")) return null
  const avg = (c[2] ?? "").trim()
  const abRaw = c[3] ?? ""
  if (!DIGITS.test(abRaw)) return null
  const ab = parseInt(abRaw, 10)
  if (ab > 15) return null
  const avgOk = avg === "-" || /^\.\d{3}$/.test(avg) || /^\d\.\d{3}$/.test(avg)
  if (!avgOk) return null
  const hOpt = parseCellInt(5, c)
  const hrOpt = parseCellInt(13, c)
  const raw23 = countExtraBaseHitsFromStatsRowTextCells(c)
  const capped = capExtraBaseHitsToHitLineTotal(raw23.h2, raw23.h3, hOpt ?? 0, hrOpt ?? 0)
  /** @type {Record<string, unknown>} */
  const out = {
    yahooPlayerId: row.yahooPlayerId,
    playerName: row.playerName,
    positionCell: p0,
    avg,
    ab,
    r: parseCellInt(4, c),
    h: hOpt,
    rbi: parseCellInt(6, c),
    so: parseCellInt(7, c),
    bb: parseCellInt(8, c),
    hbp: parseCellInt(9, c),
    sh: parseCellInt(10, c),
    sb: parseCellInt(11, c),
    e: parseCellInt(12, c),
    hr: hrOpt,
    inferredFrom: "stats_row_v0",
  }
  if (c.length > 14 && (capped.h2 > 0 || capped.h3 > 0)) {
    out.h2 = capped.h2
    out.h3 = capped.h3
  }
  const slots = extractAppearanceStatSlotsFromCells(c)
  if (slots.length > 0) out.appearancePaSlotsJa = slots
  return out
}

/** @param {{ yahooPlayerId: string | null, playerName: string, cells: string[] }} row */
export function inferPitchingLineFromStatsRow(row) {
  if (!row.yahooPlayerId || row.cells.length < 4) return null
  const c = row.cells
  const p0 = c[0] ?? ""

  if (p0 === "投" && c[2] === "-") {
    const slotsEarly = extractAppearanceStatSlotsFromCells(c)
    return {
      yahooPlayerId: row.yahooPlayerId,
      playerName: row.playerName,
      inferredFrom: "stats_row_v0",
      ...(slotsEarly.length > 0 ? { appearanceVsBfSlotsJa: slotsEarly } : {}),
    }
  }

  const eraOk = isEraTwoDecimals(c[2] ?? "")
  const pitchingRow =
    p0 === "H" ||
    p0 === "敗" ||
    p0 === "勝" ||
    (p0 === "" && eraOk) ||
    (p0 === "投" && eraOk)

  if (!pitchingRow || !eraOk) return null

  /** @type {"win"|"loss"|"hold"|null} */
  let decision = null
  if (p0 === "勝") decision = "win"
  else if (p0 === "敗") decision = "loss"
  else if (p0 === "H") decision = "hold"

  const out = {
    yahooPlayerId: row.yahooPlayerId,
    playerName: row.playerName,
    era: c[2],
    ip: c[3],
    pitches: parseCellInt(4, c),
    bf: parseCellInt(5, c),
    h: parseCellInt(6, c),
    hr: parseCellInt(7, c),
    so: parseCellInt(8, c),
    bb: parseCellInt(9, c),
    hbp: parseCellInt(10, c),
    bk: parseCellInt(11, c),
    r: parseCellInt(12, c),
    er: parseCellInt(13, c),
    decision,
    inferredFrom: "stats_row_v0",
  }
  const slots = extractAppearanceStatSlotsFromCells(c)
  if (slots.length > 0) out.appearanceVsBfSlotsJa = slots
  return out
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

export function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
}

function normalizeJaNameKey(s) {
  return String(s ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[.．]/g, "")
}

function buildNameKeyToYahooIdMap(yahooPlayersMentioned) {
  const m = new Map()
  const surnameOwner = new Map()
  const ym = yahooPlayersMentioned ?? {}
  for (const [id, name] of Object.entries(ym)) {
    const yid = String(id ?? "").trim()
    const raw = String(name ?? "").trim()
    const fullKey = normalizeJaNameKey(raw)
    if (fullKey && yid && !m.has(fullKey)) m.set(fullKey, yid)

    const tokens = raw.normalize("NFKC").split(/\s+/).filter(Boolean)
    if (tokens.length >= 1) {
      const surnameKey = normalizeJaNameKey(tokens[0])
      if (surnameKey && yid) {
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

function inningHalfFromSectionTitle(sectionTitle) {
  const s = String(sectionTitle ?? "").trim()
  const m = s.match(/^(\d+)回(表|裏)$/)
  if (!m) return null
  return `${m[1]}回${m[2]}`
}

/**
 * Sportsnavi の textPlayByPlay と yahooPlayersMentioned から、盗塁/盗塁死イベントを正規化する（best-effort）。
 * TS 実装: lib/yahooGame/runnerEventsFromTextPlayByPlay.ts と同期すること。
 */
export function parseRunnerEventsFromTextPlayByPlay(textPlayByPlay, yahooPlayersMentioned, gameId) {
  const out = []
  const sections = Array.isArray(textPlayByPlay) ? textPlayByPlay : []
  if (sections.length === 0) return out

  const nameToId = buildNameKeyToYahooIdMap(yahooPlayersMentioned)
  const patterns = [
    { kind: "SB", re: /走者\s*([^\s:：]+)\s*[:：]\s*盗塁成功/ },
    { kind: "CS", re: /走者\s*([^\s:：]+)\s*[:：]\s*(盗塁死|盗塁失敗)/ },
    { kind: "SB", re: /ランナー\s*([^\s:：]+)\s*[:：]\s*盗塁成功/ },
    { kind: "CS", re: /ランナー\s*([^\s:：]+)\s*[:：]\s*(盗塁死|盗塁失敗)/ },
  ]

  let seq = 0
  for (const sec of sections) {
    const inningHalf = inningHalfFromSectionTitle(sec.sectionTitle) || undefined
    for (const line of sec.lines ?? []) {
      const s = String(line ?? "")
      for (const p of patterns) {
        const m = s.match(p.re)
        if (!m) continue
        const rawName = String(m[1] ?? "")
        const key = normalizeJaNameKey(rawName)
        const yid = nameToId.get(key)
        if (!yid) continue
        seq += 1
        out.push({
          eventId: `${gameId}-runner-${seq}`,
          inningHalf,
          kind: p.kind,
          yahooRunnerId: yid,
          runnerNameJa: rawName.trim() || undefined,
          sourceLine: s.trim() || undefined,
          sourceTier: "textPbp",
        })
      }
    }
  }
  return out
}

function padCells(cells, minLen) {
  const out = [...cells]
  while (out.length < minLen) out.push("")
  return out
}

function isFetchFailed(html) {
  if (!html) return true
  const t = html.trimStart()
  return t.startsWith("FETCH_FAILED") || t.startsWith("<!-- fetch failed")
}

/**
 * score-raw ゲート / yahoo_game_main_cancelled.py と同義。
 * 試合トップ HTML（raw_sportsnavi/{gameId}.html）1枚分に対して使う。
 *
 * @param {string} html
 * @param {string} [gameId] 他試合への bb-scoreList リンク誤検知を避けるため推奨
 */
export function isSportsnaviMainGameCancelled(html, gameId = "") {
  if (!html || typeof html !== "string") return false

  const headMatch = html.match(/<h2[^>]*\bbb-head01__title\b[^>]*>([\s\S]*?)<\/h2>/i)
  if (headMatch) {
    const headPlain = headMatch[1].replace(/<[^>]+>/g, "").trim()
    if (headPlain && /試合中止|ノーゲーム|コールドゲーム|コールド|試合は中止/.test(headPlain)) {
      return true
    }
  }

  // 出場成績テーブルがノーゲーム表示（実施試合では出ない）
  if (/bb-splitsTable__nogame/i.test(html)) return true

  // text raw の現在カードは href を持たない span だけになることがある
  if (/<span[^>]*\bbb-scoreList__state\b[^>]*>\s*(試合中止|ノーゲーム)\s*<\/span>/i.test(html)) {
    return true
  }

  // 当該試合カード先頭の状態のみ（同日他試合の scoreList / サイド欄の「試合中止」は見ない）
  const primaryCardMatch = html.match(
    /<p[^>]*\bbb-gameCard__state\b[^>]*>[\s\S]*?<span>\s*([^<]+?)\s*<\/span>/i,
  )
  const primaryState = primaryCardMatch ? String(primaryCardMatch[1]).trim() : ""
  if (primaryState === "試合中止" || primaryState === "ノーゲーム") return true

  const gid = String(gameId || "").trim()
  if (gid) {
    // 当該試合自身への scoreList リンク
    if (
      new RegExp(
        `class="bb-scoreList__state"[^>]*href="/npb/game/${gid}/index"[^>]*>[\\s\\S]*?(試合中止|ノーゲーム)`,
        "i",
      ).test(html)
    ) {
      return true
    }
    // 他試合への中止リンクだけなら未成立とみなさない
    const otherOnly =
      new RegExp(
        `class="bb-scoreList__state"[^>]*href="/npb/game/(?!${gid})\\d+/index"[^>]*>\\s*(試合中止|ノーゲーム)`,
        "i",
      ).test(html) &&
      !/bb-splitsTable__nogame/i.test(html) &&
      !(headMatch && /試合中止|ノーゲーム/.test(headMatch[1]))
    if (otherOnly) return false
  }

  return false
}

/**
 * @param {string} html
 * @returns {{ yahooPlayerId: string, playerName: string, cells: string[] }[]}
 */
export function parseSportsnaviStatsHtml(html) {
  if (!html || isFetchFailed(html)) return []
  return parseSportsnaviStatsPlayerRows(html)
}

/**
 * @param {string} html
 * @returns {{ sectionTitle: string, lines: string[], playHeadlineJa: (string|null)[] }[]}
 * playHeadlineJa[i]: 各プレー（li.bb-liveText__item）の一球速報上段の動画見出し（p.bb-liveText__itemTitle）。無い場合は null。
 */
export function parseSportsnaviTextHtml(html) {
  if (!html || isFetchFailed(html)) return []

  /** @type {{ sectionTitle: string, lines: string[], playHeadlineJa: (string|null)[] }[]} */
  const out = []
  const parts = html.split('class="bb-liveText"')
  for (let p = 1; p < parts.length; p++) {
    const block = parts[p]
    const titleM = block.match(/bb-liveText__inning[^>]*>([\s\S]*?)<\/h1>/i)
    const sectionTitle = titleM ? stripTags(titleM[1]).replace(/\s+/g, " ").trim() : ""

    const lines = []
    /** @type {(string|null)[]} */
    const playHeadlineJa = []
    const liRe = /<li[^>]*bb-liveText__item[^>]*>([\s\S]*?)<\/li>/gi
    let lm
    while ((lm = liRe.exec(block)) !== null) {
      const itemHtml = lm[1] ?? ""
      const htM = itemHtml.match(/<p\s+class="bb-liveText__itemTitle"[^>]*>([\s\S]*?)<\/p>/i)
      const headline = htM ? stripTags(htM[1]).replace(/\s+/g, " ").trim() : ""
      const t = stripTags(itemHtml).replace(/\s+/g, " ").trim()
      if (t) {
        lines.push(t)
        playHeadlineJa.push(headline || null)
      }
    }

    if (sectionTitle || lines.length > 0) {
      out.push({ sectionTitle, lines, playHeadlineJa })
    }
  }

  return out
}

/**
 * Sportsnavi text raw HTML から、盗塁/盗塁死イベントを抽出する（best-effort）。
 *
 * ポイント:
 * - `yahooPlayersMentioned` への依存を避け、`/npb/player/{id}/` のリンクから runnerId を確定する
 * - 同一 li 内に打者リンクもあるため、「盗塁」文言より前に出現する player link の **最後** を走者とみなす
 */
export function parseRunnerEventsFromRawTextHtml(html, gameId) {
  if (!html || isFetchFailed(html)) return []
  const out = []
  const parts = html.split('class="bb-liveText"')
  let seq = 0
  for (let p = 1; p < parts.length; p++) {
    const block = parts[p]
    const titleM = block.match(/bb-liveText__inning[^>]*>([\s\S]*?)<\/h1>/i)
    const sectionTitle = titleM ? stripTags(titleM[1]).replace(/\s+/g, " ").trim() : ""
    const inningHalf = inningHalfFromSectionTitle(sectionTitle) || undefined

    const liRe = /<li[^>]*bb-liveText__item[^>]*>([\s\S]*?)<\/li>/gi
    let lm
    while ((lm = liRe.exec(block)) !== null) {
      const itemHtml = lm[1] ?? ""
      const stealM = String(itemHtml).match(/盗塁成功|盗塁死|盗塁失敗/)
      if (!stealM) continue
      const kind = /盗塁成功/.test(stealM[0]) ? "SB" : "CS"

      const stealIdx = itemHtml.indexOf(stealM[0])
      const before = stealIdx >= 0 ? itemHtml.slice(0, stealIdx) : itemHtml
      const linkRe = /href\s*=\s*["'][^"']*\/npb\/player\/(\d+)\//gi
      let lastId = null
      let mm
      while ((mm = linkRe.exec(before)) !== null) {
        lastId = mm[1] ?? lastId
      }
      if (!lastId) continue

      const sourceLine = stripTags(itemHtml).replace(/\s+/g, " ").trim()
      seq += 1
      out.push({
        eventId: `${gameId}-runner-${seq}`,
        inningHalf,
        kind,
        yahooRunnerId: String(lastId),
        runnerNameJa: undefined,
        sourceLine: sourceLine || undefined,
        sourceTier: "rawTextSteal",
      })
    }
  }
  return out
}

/**
 * @param {{ yahooPlayerId: string, playerName: string, cells: string[] }[]} rows
 * @param {string} [statsHtml] 出場成績 HTML（bb-scoreTable の投手成績をマージする）
 */
export function buildBattingPitchingFromStatsRows(rows, statsHtml) {
  const battingLines = []
  /** @type {Record<string, unknown>[]} */
  const statsPitchingLines = []
  for (const r of rows) {
    const b = inferBattingLineFromStatsRow(r)
    if (b) battingLines.push(b)
    const p = inferPitchingLineFromStatsRow(r)
    if (p) statsPitchingLines.push(p)
  }
  const scorePitching = statsHtml ? parseSportsnaviPitcherScoreTableRows(statsHtml) : []
  const pitchingLines = mergePitchingLinesFromScoreAndStatsTables(scorePitching, statsPitchingLines)
  return { battingLines, pitchingLines }
}

/**
 * @param {{ yahooPlayerId: string, playerName: string, cells: string[] }[]} rows
 */
export function yahooPlayersMentionedFromStatsRows(rows) {
  /** @type {Record<string, string>} */
  const o = {}
  for (const r of rows) {
    const id = (r.yahooPlayerId ?? "").trim()
    if (id) o[id] = r.playerName
  }
  return o
}
