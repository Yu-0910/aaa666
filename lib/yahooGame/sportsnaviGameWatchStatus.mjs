/**
 * スポナビ試合ページの HTML から「一括取得を開始してよいか」を判定する。
 * 監視用（キャッシュではなくライブ fetch 結果を渡す想定）。
 */

import { isSportsnaviMainGameCancelled } from "./sportsnaviStatsTextParse.mjs"
import {
  countBbLiveTextSplits,
  countParsedStatsRowsInHtml,
  isHtmlFetchFailed,
} from "./phase2RawCanonicalSync.mjs"

/** @param {string} html */
export function parseGameCardStateLabel(html) {
  if (!html || typeof html !== "string") return ""
  const m = html.match(
    /<p[^>]*\bbb-gameCard__state\b[^>]*>[\s\S]*?<span>\s*([^<]+?)\s*<\/span>/i,
  )
  return m ? String(m[1]).trim() : ""
}

/** @param {string} label */
export function isPreGameCardState(label) {
  return label === "試合前"
}

/** @param {string} label */
export function isNoContestCardState(label) {
  return label === "試合中止" || label === "ノーゲーム"
}

/** @param {string} label */
export function isLikelyInProgressCardState(label) {
  if (!label) return false
  if (label === "試合中") return true
  if (/^\d+回(表|裏)/.test(label)) return true
  if (/表|裏/.test(label) && /\d+回/.test(label)) return true
  return false
}

/** @param {string} html */
export function textHtmlIndicatesGameEnd(html) {
  if (!html || isHtmlFetchFailed(html)) return false
  return /試合終了/.test(html)
}

/**
 * @param {{ htmlMain?: string|null, htmlStats?: string|null, htmlText?: string|null }} p
 * @returns {{
 *   ready: boolean,
 *   status: "no_contest"|"pre_game"|"in_progress"|"finished"|"likely_finished"|"fetch_failed"|"unknown",
 *   cardState: string,
 *   statsRows: number,
 *   textBlocks: number,
 *   reason: string,
 * }}
 */
export function classifySportsnaviGameForDailyPipeline(p) {
  const htmlMain = p.htmlMain ?? ""
  const htmlStats = p.htmlStats ?? ""
  const htmlText = p.htmlText ?? ""

  if (isHtmlFetchFailed(htmlMain) && isHtmlFetchFailed(htmlStats) && isHtmlFetchFailed(htmlText)) {
    return {
      ready: false,
      status: "fetch_failed",
      cardState: "",
      statsRows: -1,
      textBlocks: -1,
      reason: "main/stats/text all fetch failed",
    }
  }

  const cardState = parseGameCardStateLabel(htmlMain || htmlStats || htmlText)

  if (isSportsnaviMainGameCancelled(htmlMain) || isNoContestCardState(cardState)) {
    return {
      ready: true,
      status: "no_contest",
      cardState,
      statsRows: countParsedStatsRowsInHtml(htmlStats),
      textBlocks: countBbLiveTextSplits(htmlText),
      reason: "cancelled_or_no_game",
    }
  }

  if (isPreGameCardState(cardState)) {
    return {
      ready: false,
      status: "pre_game",
      cardState,
      statsRows: countParsedStatsRowsInHtml(htmlStats),
      textBlocks: countBbLiveTextSplits(htmlText),
      reason: "card_state_pre_game",
    }
  }

  const statsRows = countParsedStatsRowsInHtml(htmlStats)
  const textBlocks = countBbLiveTextSplits(htmlText)
  const textEnd = textHtmlIndicatesGameEnd(htmlText)

  if (textEnd) {
    return {
      ready: true,
      status: "finished",
      cardState,
      statsRows,
      textBlocks,
      reason: "text_contains_game_end",
    }
  }

  if (isLikelyInProgressCardState(cardState)) {
    return {
      ready: false,
      status: "in_progress",
      cardState,
      statsRows,
      textBlocks,
      reason: "card_state_in_progress",
    }
  }

  if (statsRows >= 2 && textBlocks >= 1) {
    return {
      ready: true,
      status: "likely_finished",
      cardState,
      statsRows,
      textBlocks,
      reason: "stats_and_text_parse_complete",
    }
  }

  return {
    ready: false,
    status: "unknown",
    cardState,
    statsRows,
    textBlocks,
    reason: "waiting_for_stats_text_or_end_marker",
  }
}
