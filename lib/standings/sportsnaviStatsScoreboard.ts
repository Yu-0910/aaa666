/**
 * 順位表用: 出場成績 HTML（raw_sportsnavi_stats）のスコア表「計」列から得点を読む。
 * 一球速報ページと同位置の `#ing_brd` 表（bb-gameScoreTable）。
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { parseYahooScoreboardFromScorePageHtml } from "@/lib/yahooGame/parseYahooScorePageScoreboard"
import type { ScoreboardTeamLine } from "@/lib/yahooGame/types"

const cache = new Map<string, ScoreboardTeamLine[] | null>()

function statsHtmlPath(projectRoot: string, gameId: string): string {
  return join(projectRoot, "_data", "scraped_games", "raw_sportsnavi_stats", `${gameId}.html`)
}

/** 出場成績 raw があればスコア表（計・安・失）をパース。 */
export function loadScoreboardFromSportsnaviStatsRaw(
  projectRoot: string,
  gameId: string,
): ScoreboardTeamLine[] | null {
  const id = String(gameId ?? "").trim()
  if (!id) return null
  if (cache.has(id)) return cache.get(id) ?? null

  const htmlPath = statsHtmlPath(projectRoot, id)
  if (!existsSync(htmlPath)) {
    cache.set(id, null)
    return null
  }
  try {
    const html = readFileSync(htmlPath, "utf8")
    const board = parseYahooScoreboardFromScorePageHtml(html)
    const out = board.length >= 2 ? board : null
    cache.set(id, out)
    return out
  } catch {
    cache.set(id, null)
    return null
  }
}

export function clearSportsnaviStatsScoreboardCache(): void {
  cache.clear()
}
