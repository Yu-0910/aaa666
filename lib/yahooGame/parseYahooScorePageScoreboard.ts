/**
 * Yahoo 試合ページ（出場成績・一球速報共通）の `#ing_brd` スコア表から
 * 「計」列の得点を含むスコアボード行をパースする。
 *
 * Python 実装: scripts/run_yahoo_phase2_poc.py `parse_scoreboard`
 */

import type { ScoreboardTeamLine } from "./types"

const ROW_RE =
  /<tr[^>]*class="[^"]*\bbb-gameScoreTable__row\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi

function parseScoreboardRow(trInner: string): ScoreboardTeamLine | null {
  const teamMatch = trInner.match(
    /class="bb-gameScoreTable__team"[^>]*>([\s\S]*?)<\//i,
  )
  if (!teamMatch) return null
  const teamName = teamMatch[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
  if (!teamName) return null

  const teamHrefMatch = trInner.match(/class="bb-gameScoreTable__team"[^>]*href="([^"]+)"/i)
  const yahooTeamId =
    teamHrefMatch?.[1]?.match(/\/teams\/(\d+)\//)?.[1] ?? null

  const innings: string[] = []
  const dataRe =
    /<td[^>]*class="[^"]*\bbb-gameScoreTable__data\b[^"]*"[^>]*>([\s\S]*?)<\/td>/gi
  for (const dm of trInner.matchAll(dataRe)) {
    const chunk = dm[1] ?? ""
    if (/bb-gameScoreTable__data--team/.test(dm[0] ?? "")) continue
    const scoreLink = chunk.match(/class="bb-gameScoreTable__score"[^>]*>([\s\S]*?)<\//i)
    const raw = scoreLink ? scoreLink[1]!.replace(/<[^>]+>/g, "").trim() : chunk.replace(/<[^>]+>/g, "").trim()
    innings.push(raw)
  }

  const totals: string[] = []
  const totalRe = /<td[^>]*class="[^"]*\bbb-gameScoreTable__total\b[^"]*"[^>]*>([\s\S]*?)<\/td>/gi
  for (const tm of trInner.matchAll(totalRe)) {
    totals.push((tm[1] ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
  }

  const row: ScoreboardTeamLine = {
    teamName,
    yahooTeamId,
    innings,
  }
  if (totals[0] != null && totals[0] !== "") row.runs = totals[0]
  if (totals[1] != null && totals[1] !== "") row.hits = totals[1]
  if (totals[2] != null && totals[2] !== "") row.errors = totals[2]
  return row
}

/** 一球速報 HTML からスコア表（計・安・失）を抽出。先攻行→後攻行の順。 */
export function parseYahooScoreboardFromScorePageHtml(html: string): ScoreboardTeamLine[] {
  if (!html.includes("bb-gameScoreTable")) return []
  const rows: ScoreboardTeamLine[] = []
  for (const m of html.matchAll(ROW_RE)) {
    const parsed = parseScoreboardRow(m[1] ?? "")
    if (parsed) rows.push(parsed)
  }
  return rows
}
