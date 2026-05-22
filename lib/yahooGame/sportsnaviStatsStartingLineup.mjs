/**
 * スポーツナビ出場成績 HTML の「位置」列からスタメン打順（1〜9）を復元する。
 *
 * 表記ルール（Sportsnavi 出場成績）:
 * - `(右)` `(二)` `(捕)` `(投)` … 括弧付き → スタメン（行の出現順が打順 1〜9）
 * - `投` `打` `打一` `走左` など括弧なし → 救援・代打・代走等（打順集計から除外）
 *
 * `parseSportsnaviStatsHtml`（フラット行）と同期: 行パースは `parseStatsPlayerRowFromTrInner` を共有。
 */

import { buildStatCellsFromTdParts } from "./sportsnaviStatsRowCells.mjs"

const MIN_STATS_CELLS = 24

/** @param {string} html */
function decodeHtmlEntities(s) {
  return String(s ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

/** @param {string} html */
export function stripTags(html) {
  return decodeHtmlEntities(String(html ?? "").replace(/<[^>]+>/g, " "))
}

function padCells(cells, minLen) {
  const out = [...cells]
  while (out.length < minLen) out.push("")
  return out
}

/**
 * 1 行分の stats 打者/投手行をパース。失敗時は null。
 * @param {string} trInner `<tr>...</tr>` の内側 HTML
 * @returns {{ yahooPlayerId: string, playerName: string, cells: string[], positionCell: string } | null}
 */
export function parseStatsPlayerRowFromTrInner(trInner) {
  if (!/\/npb\/player\/\d+\//.test(trInner)) return null

  const idMatch = trInner.match(/\/npb\/player\/(\d+)\//)
  if (!idMatch) return null
  const yahooPlayerId = idMatch[1]

  const nameMatch = trInner.match(
    /<a[^>]*href\s*=\s*["'][^"']*\/npb\/player\/\d+\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
  )
  const playerName = nameMatch ? stripTags(nameMatch[1]).replace(/\s+/g, " ").trim() : ""

  /** @type {{ attrs: string, inner: string }[]} */
  const tdParts = []
  const tdRe = /<td([^>]*)>([\s\S]*?)<\/td>/gi
  let tm
  while ((tm = tdRe.exec(trInner)) !== null) {
    tdParts.push({ attrs: tm[1] ?? "", inner: tm[2] ?? "" })
  }
  if (tdParts.length === 0) return null

  let playerIdx = -1
  for (let i = 0; i < tdParts.length; i++) {
    if (/npb\/player\/\d+\//.test(tdParts[i].inner)) {
      playerIdx = i
      break
    }
  }
  if (playerIdx < 0) return null

  const positionCell =
    playerIdx >= 1 ? stripTags(tdParts[playerIdx - 1].inner).replace(/\s+/g, " ").trim() : ""
  const statCells = buildStatCellsFromTdParts(tdParts, playerIdx, stripTags)
  const cells = padCells([positionCell, playerName, ...statCells], MIN_STATS_CELLS)

  return { yahooPlayerId, playerName, cells, positionCell }
}

/**
 * 「位置」セルがスタメン（括弧付き守備略号）か。
 * @param {string} positionCell
 */
export function isStarterPositionCell(positionCell) {
  const p = String(positionCell ?? "").trim()
  if (!p) return false
  return /^\([^)]+\)$/.test(p)
}

/**
 * `(二)` → `二`、`(中右)` → `中右`
 * @param {string} positionCell
 */
export function fieldingPositionFromStarterCell(positionCell) {
  const p = String(positionCell ?? "").trim()
  const m = p.match(/^\(([^)]+)\)$/)
  return m ? String(m[1] ?? "").trim() : ""
}

/**
 * 出場成績 HTML からチーム別の Yahoo チーム ID ヒント（スコアボード・表 class）。
 * @param {string} html
 * @returns {Map<string, { yahooTeamId: string, teamName: string }>}
 */
export function parseTeamHintsFromSportsnaviStatsHtml(html) {
  /** @type {Map<string, { yahooTeamId: string, teamName: string }>} */
  const byNum = new Map()

  const headRe =
    /bb-teamScoreTable__head--npbTeam(\d+)[\s\S]*?bb-gameScoreTable__team[^>]*>([\s\S]*?)<\/a>/gi
  let hm
  while ((hm = headRe.exec(html)) !== null) {
    const num = hm[1]
    const teamName = stripTags(hm[2]).replace(/\s+/g, " ").trim()
    if (num) byNum.set(num, { yahooTeamId: num, teamName })
  }

  const linkRe = /href="\/npb\/teams\/(\d+)\/index"[^>]*>([\s\S]*?)<\/a>/gi
  let lm
  while ((lm = linkRe.exec(html)) !== null) {
    const num = lm[1]
    const teamName = stripTags(lm[2]).replace(/\s+/g, " ").trim()
    if (!num) continue
    const cur = byNum.get(num)
    if (!cur) byNum.set(num, { yahooTeamId: num, teamName })
    else if (!cur.teamName && teamName) cur.teamName = teamName
  }

  return byNum
}

/**
 * 打撃成績テーブル 1 ブロック（`bb-statsTable--npbTeamN`）からスタメン行を抽出。
 * @param {string} tableBlock
 * @param {string} teamNum
 * @param {{ yahooTeamId: string, teamName: string } | undefined} hint
 */
function startingLineupFromBattingTableBlock(tableBlock, teamNum, hint) {
  /** @type {{ battingOrder: string, fieldingPosition: string, playerName: string, yahooPlayerId: string, bats: null, avgDisplay: string | null }[]} */
  const startingLineup = []
  const trRe = /<tr[^>]*class="bb-statsTable__row"[^>]*>([\s\S]*?)<\/tr>/gi
  let m
  let slot = 0
  while ((m = trRe.exec(tableBlock)) !== null) {
    const row = parseStatsPlayerRowFromTrInner(m[1])
    if (!row) continue
    if (!isStarterPositionCell(row.positionCell)) continue
    slot += 1
    if (slot > 9) break
    startingLineup.push({
      battingOrder: String(slot),
      fieldingPosition: fieldingPositionFromStarterCell(row.positionCell),
      playerName: row.playerName,
      yahooPlayerId: row.yahooPlayerId,
      bats: null,
      avgDisplay: (row.cells[2] ?? "").trim() || null,
    })
  }

  return {
    yahooTeamId: hint?.yahooTeamId ?? teamNum ?? null,
    teamName: hint?.teamName ?? "",
    startingLineup,
  }
}

/**
 * 出場成績 HTML から `game.teams[]`（スタメン打順付き）を組み立てる。
 * @param {string} html
 * @returns {{ teams: object[], totalStarterSlots: number, teamTableCount: number }}
 */
export function parseTeamsFromSportsnaviStatsHtml(html) {
  if (!html || typeof html !== "string") return { teams: [], totalStarterSlots: 0, teamTableCount: 0 }

  const hints = parseTeamHintsFromSportsnaviStatsHtml(html)
  /** @type {object[]} */
  const teams = []

  const tableRe =
    /class="bb-statsTable bb-statsTable--npbTeam(\d+)"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/gi
  let tm
  let teamTableCount = 0
  while ((tm = tableRe.exec(html)) !== null) {
    teamTableCount += 1
    const teamNum = tm[1] ?? ""
    const tbody = tm[2] ?? ""
    const block = `<tbody>${tbody}</tbody>`
    const hint = teamNum ? hints.get(teamNum) : undefined
    const team = startingLineupFromBattingTableBlock(block, teamNum, hint)
    if (team.startingLineup.length > 0) teams.push(team)
  }

  let totalStarterSlots = 0
  for (const t of teams) totalStarterSlots += (t.startingLineup ?? []).length

  return { teams, totalStarterSlots, teamTableCount }
}

/**
 * フラットな stats 行（従来の `parseSportsnaviStatsHtml` 互換）。
 * @param {string} html
 */
export function parseSportsnaviStatsPlayerRows(html) {
  if (!html || typeof html !== "string") return []

  /** @type {{ yahooPlayerId: string, playerName: string, cells: string[] }[]} */
  const rows = []
  const tableRe =
    /class="bb-statsTable bb-statsTable--npbTeam\d+"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/gi
  let tm
  while ((tm = tableRe.exec(html)) !== null) {
    const tbody = tm[1] ?? ""
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let m
    while ((m = trRe.exec(tbody)) !== null) {
      const row = parseStatsPlayerRowFromTrInner(m[1])
      if (!row) continue
      rows.push({
        yahooPlayerId: row.yahooPlayerId,
        playerName: row.playerName,
        cells: row.cells,
      })
    }
  }

  if (rows.length > 0) return rows

  // フォールバック: 旧 HTML（チーム class 無し）用に全文 tr 走査
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let m
  while ((m = trRe.exec(html)) !== null) {
    const row = parseStatsPlayerRowFromTrInner(m[1])
    if (!row) continue
    rows.push({
      yahooPlayerId: row.yahooPlayerId,
      playerName: row.playerName,
      cells: row.cells,
    })
  }

  return rows
}
