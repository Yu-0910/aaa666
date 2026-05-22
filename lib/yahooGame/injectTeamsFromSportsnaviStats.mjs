/**
 * canonical の `game.teams` が空のとき、同一試合の出場成績 raw HTML からスタメン打順を注入する。
 * Phase15 / loadCanonicalGamesMergedForDerivedPipeline 用（ディスク上の canonical は変更しない）。
 */

import fs from "node:fs"
import path from "node:path"
import { parseTeamsFromSportsnaviStatsHtml } from "./sportsnaviStatsStartingLineup.mjs"
import { isHtmlFetchFailed } from "./phase2RawCanonicalSync.mjs"

/**
 * @param {object} doc canonical 相当
 * @param {string} statsHtml
 * @returns {object}
 */
export function injectTeamsFromSportsnaviStatsHtml(doc, statsHtml) {
  const teams = doc?.game?.teams ?? []
  if (Array.isArray(teams) && teams.length >= 2) return doc
  if (!statsHtml || isHtmlFetchFailed(statsHtml)) return doc

  const { teams: parsed, totalStarterSlots } = parseTeamsFromSportsnaviStatsHtml(statsHtml)
  if (!parsed.length) return doc

  const miss = [...(doc.game?.missingOrPartial ?? [])]
  if (totalStarterSlots < 14 && !miss.some((s) => String(s).includes("starting_lineup_partial"))) {
    miss.push(
      `phase2: starting_lineup_partial from stats (${parsed.length} teams, ${totalStarterSlots} starter slots)`,
    )
  }

  return {
    ...doc,
    game: {
      ...doc.game,
      teams: parsed,
      missingOrPartial: miss,
    },
  }
}

/**
 * @param {object} doc
 * @param {string} projectRoot
 * @returns {object}
 */
export function injectTeamsFromSportsnaviStatsIfMissing(doc, projectRoot) {
  const teams = doc?.game?.teams ?? []
  if (Array.isArray(teams) && teams.length >= 2) return doc

  const gameId = String(doc?.gameId ?? "").trim()
  if (!gameId || !projectRoot) return doc

  const statsPath = path.join(
    projectRoot,
    "_data",
    "scraped_games",
    "raw_sportsnavi_stats",
    `${gameId}.html`,
  )
  if (!fs.existsSync(statsPath)) return doc

  let html
  try {
    html = fs.readFileSync(statsPath, "utf8")
  } catch {
    return doc
  }

  return injectTeamsFromSportsnaviStatsHtml(doc, html)
}
