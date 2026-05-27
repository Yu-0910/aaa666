/**
 * スポナビ出場成績 HTML 内の「投手成績」テーブル（bb-scoreTable）をパースする。
 * bb-statsTable の「投」行（防御率 "-"）だけでは ip/bf が取れないため、phase19 用の数値はこちらを正とする。
 */

import { stripTags } from "./sportsnaviStatsStartingLineup.mjs"

const DIGITS = /^\d+$/

function parseIntCell(s) {
  const t = String(s ?? "").trim()
  return t && DIGITS.test(t) ? parseInt(t, 10) : undefined
}

/** @param {string} tdInner */
function scoreLabelFromTd(tdInner) {
  const m = String(tdInner ?? "").match(
    /class="bb-scoreTable__dataLabel"[^>]*>([\s\S]*?)<\//i,
  )
  if (m) return stripTags(m[1]).replace(/\s+/g, " ").trim()
  return stripTags(tdInner).replace(/\s+/g, " ").trim()
}

/** @param {string} state */
function decisionFromStateCell(state) {
  const s = String(state ?? "").trim()
  if (s === "勝") return "win"
  if (s === "敗") return "loss"
  if (s === "H") return "hold"
  if (s === "S" || s === "Ｓ") return "save"
  return null
}

/**
 * @param {string} trInner
 * @returns {{ yahooPlayerId: string, playerName: string, era: string, ip: string, pitches?: number, bf?: number, h?: number, hr?: number, so?: number, bb?: number, hbp?: number, bk?: number, r?: number, er?: number, decision: "win"|"loss"|"hold"|"save"|null, inferredFrom: "score_table_v0" } | null}
 */
export function parsePitcherScoreTableRowFromTrInner(trInner) {
  if (!/\/npb\/player\/\d+\//.test(trInner)) return null
  const idMatch = trInner.match(/\/npb\/player\/(\d+)\//)
  if (!idMatch) return null
  const yahooPlayerId = idMatch[1]

  const nameMatch = trInner.match(
    /<a[^>]*href\s*=\s*["'][^"']*\/npb\/player\/\d+\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
  )
  const playerName = nameMatch ? stripTags(nameMatch[1]).replace(/\s+/g, " ").trim() : ""

  /** @type {string[]} */
  const tdInners = []
  const tdRe = /<td([^>]*)>([\s\S]*?)<\/td>/gi
  let tm
  while ((tm = tdRe.exec(trInner)) !== null) {
    tdInners.push(tm[2] ?? "")
  }
  if (tdInners.length < 4) return null

  const state = stripTags(tdInners[0]).replace(/\s+/g, " ").trim()
  const labels = tdInners.slice(2).map(scoreLabelFromTd)
  const era = labels[0] ?? ""
  const ip = labels[1] ?? ""
  if (!era && !ip) return null

  return {
    yahooPlayerId,
    playerName,
    era: era || undefined,
    ip: ip || undefined,
    pitches: parseIntCell(labels[2]),
    bf: parseIntCell(labels[3]),
    h: parseIntCell(labels[4]),
    hr: parseIntCell(labels[5]),
    so: parseIntCell(labels[6]),
    bb: parseIntCell(labels[7]),
    hbp: parseIntCell(labels[8]),
    bk: parseIntCell(labels[9]),
    r: parseIntCell(labels[10]),
    er: parseIntCell(labels[11]),
    decision: decisionFromStateCell(state),
    inferredFrom: "score_table_v0",
  }
}

/**
 * @param {string} html
 */
export function parseSportsnaviPitcherScoreTableRows(html) {
  if (!html || typeof html !== "string") return []

  /** @type {ReturnType<typeof parsePitcherScoreTableRowFromTrInner>[]} */
  const rows = []
  const tableRe =
    /class="bb-scoreTable bb-scoreTable--npbTeam\d+"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/gi
  let tm
  while ((tm = tableRe.exec(html)) !== null) {
    const tbody = tm[1] ?? ""
    const trRe = /<tr[^>]*class="bb-scoreTable__row"[^>]*>([\s\S]*?)<\/tr>/gi
    let m
    while ((m = trRe.exec(tbody)) !== null) {
      const row = parsePitcherScoreTableRowFromTrInner(m[1])
      if (row) rows.push(row)
    }
  }
  return rows
}

/**
 * scoreTable 行を正とし、stats 行の appearanceVsBfSlotsJa のみマージする。
 * @param {ReturnType<typeof parseSportsnaviPitcherScoreTableRows>} scoreLines
 * @param {Record<string, unknown>[]} statsPitchingLines
 */
export function mergePitchingLinesFromScoreAndStatsTables(scoreLines, statsPitchingLines) {
  /** @type {Map<string, Record<string, unknown>>} */
  const byId = new Map()
  for (const pl of scoreLines) {
    const id = String(pl.yahooPlayerId ?? "").trim()
    if (id) byId.set(id, { ...pl })
  }
  for (const pl of statsPitchingLines) {
    const id = String(pl.yahooPlayerId ?? "").trim()
    if (!id) continue
    const slots = pl.appearanceVsBfSlotsJa
    const existing = byId.get(id)
    if (existing) {
      if (Array.isArray(slots) && slots.length > 0) {
        existing.appearanceVsBfSlotsJa = slots
      }
    } else {
      byId.set(id, { ...pl })
    }
  }
  return [...byId.values()]
}
