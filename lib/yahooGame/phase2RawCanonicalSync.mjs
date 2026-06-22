/**
 * Phase2: raw_sportsnavi(_stats/_text) と canonical の同期判定。
 * CSR 空テーブル → 後から raw だけ更新 → canonical が古いまま、を防ぐ。
 */

import crypto from "node:crypto"
import { parseSportsnaviStatsHtml, parseSportsnaviTextHtml, isSportsnaviMainGameCancelled } from "./sportsnaviStatsTextParse.mjs"

export function sha256Utf8(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex")
}

/** @param {string} html */
export function isHtmlFetchFailed(html) {
  if (html == null || html === "") return true
  const t = html.trimStart()
  return t.startsWith("FETCH_FAILED") || t.startsWith("<!-- fetch failed")
}

/**
 * @param {string} htmlMain
 * @param {string|null|undefined} htmlStats
 * @param {string|null|undefined} htmlText
 */
export function computePhase2RawFingerprint(htmlMain, htmlStats, htmlText) {
  return sha256Utf8([htmlMain, htmlStats ?? "", htmlText ?? ""].join("\n---\n"))
}

/** @param {string} html */
export function countParsedStatsRowsInHtml(html) {
  if (!html || isHtmlFetchFailed(html)) return -1
  return parseSportsnaviStatsHtml(html).length
}

/** @param {string} html */
export function isStatsHtmlParseComplete(html) {
  return countParsedStatsRowsInHtml(html) >= 2
}

/** @param {string} html */
export function countBbLiveTextSplits(html) {
  if (!html || isHtmlFetchFailed(html)) return -1
  const parts = html.split('class="bb-liveText"')
  return Math.max(0, parts.length - 1)
}

/** @param {string} html */
export function isTextHtmlParseComplete(html) {
  return countBbLiveTextSplits(html) >= 1
}

/**
 * stats/text raw がパース可能か（fetch の --only-incomplete と同基準）。
 * @param {{ htmlMain?: string|null, htmlStats?: string|null, htmlText?: string|null }} p
 */
export function isPhase2RawComplete(p) {
  const htmlMain = p.htmlMain ?? ""
  if (htmlMain && isSportsnaviMainGameCancelled(htmlMain)) {
    const statsOk = p.htmlStats != null && !isHtmlFetchFailed(p.htmlStats)
    const textOk = p.htmlText != null && !isHtmlFetchFailed(p.htmlText)
    return statsOk && textOk
  }
  const statsParsed = p.htmlStats == null ? -2 : countParsedStatsRowsInHtml(p.htmlStats)
  const textBlocks = p.htmlText == null ? -2 : countBbLiveTextSplits(p.htmlText)
  if (statsParsed < 0 || textBlocks < 0) return false
  return statsParsed >= 2 && textBlocks >= 1
}

/**
 * 既存 canonical を stats/text の raw から再生成すべきか。
 * @param {object|null|undefined} existingCanonical
 * @param {{ rawFingerprint: string, parsedStatsRowCount: number, parsedTextSectionCount: number, parsedStarterSlotCount?: number, gameCancelled: boolean }} ctx
 * @returns {{ rebuild: boolean, reason: string }}
 */
export function sportsnaviCanonicalNeedsRebuild(existingCanonical, ctx) {
  const {
    rawFingerprint,
    parsedStatsRowCount,
    parsedTextSectionCount,
    parsedStarterSlotCount = 0,
    gameCancelled,
  } = ctx
  // 中止試合: 既に stub canonical があればスキップ。無いときだけ初回生成（検証・day:fetch-display 用）
  if (gameCancelled) {
    return existingCanonical
      ? { rebuild: false, reason: "game_cancelled" }
      : { rebuild: true, reason: "missing_cancelled_stub" }
  }
  if (!existingCanonical) return { rebuild: true, reason: "missing_canonical" }

  const prevFp = String(existingCanonical.sourceCompositeFingerprint ?? "")
  if (prevFp && prevFp !== rawFingerprint) {
    return { rebuild: true, reason: "raw_fingerprint_changed" }
  }

  const prevStatsRows = (existingCanonical.game?.statsPlayerLinkedRows ?? []).length
  const prevTextSections = (existingCanonical.game?.textPlayByPlay ?? []).length
  const prevBattingLines = (existingCanonical.domain?.battingLines ?? []).length
  const prevTeams = (existingCanonical.game?.teams ?? []).length
  const prevStarterSlots = (existingCanonical.game?.teams ?? []).reduce(
    (n, t) => n + (t?.startingLineup ?? []).length,
    0,
  )

  if (parsedStarterSlotCount >= 14 && prevTeams < 2 && prevStarterSlots === 0) {
    return { rebuild: true, reason: "stale_empty_teams" }
  }

  if (parsedStatsRowCount >= 2 && prevStatsRows === 0 && prevBattingLines === 0) {
    return { rebuild: true, reason: "stale_empty_stats" }
  }
  if (parsedTextSectionCount >= 1 && prevTextSections === 0) {
    return { rebuild: true, reason: "stale_empty_text" }
  }

  const miss = existingCanonical.game?.missingOrPartial ?? []
  if (
    miss.some((s) => String(s).includes("no player rows parsed")) &&
    parsedStatsRowCount >= 2
  ) {
    return { rebuild: true, reason: "stale_phase2_hint" }
  }
  if (
    miss.some((s) => String(s).includes("text HTML present but no bb-liveText")) &&
    parsedTextSectionCount >= 1
  ) {
    return { rebuild: true, reason: "stale_text_hint" }
  }

  return { rebuild: false, reason: "up_to_date" }
}

/**
 * stats/text 再生成後も Phase10 一球ログを落とさない。
 * @param {object} rebuilt
 * @param {object|null|undefined} existing
 */
export function preservePhase10DomainOnSportsnaviRebuild(rebuilt, existing) {
  if (!existing) return rebuilt
  const prevPas = existing.domain?.plateAppearances ?? []
  if (!Array.isArray(prevPas) || prevPas.length === 0) return rebuilt

  rebuilt.domain = rebuilt.domain ?? {}
  rebuilt.domain.plateAppearances = prevPas

  const prevPitch = existing.domain?.pitchEvents
  if (Array.isArray(prevPitch) && prevPitch.length > 0) {
    rebuilt.domain.pitchEvents = prevPitch
  }

  const prevRunner = existing.domain?.runnerEvents
  if (Array.isArray(prevRunner) && prevRunner.length > 0) {
    const fromStats = rebuilt.domain.runnerEvents ?? []
    if (fromStats.length === 0) {
      rebuilt.domain.runnerEvents = prevRunner
    }
  }

  const prevBatter = existing.domain?.batterEvents
  if (Array.isArray(prevBatter) && prevBatter.length > 0) {
    rebuilt.domain.batterEvents = prevBatter
  }

  if (existing.eventsFingerprint) {
    rebuilt.eventsFingerprint = existing.eventsFingerprint
  }

  if (existing.game?.pitchByPitchNote) {
    rebuilt.game = rebuilt.game ?? {}
    rebuilt.game.pitchByPitchNote = existing.game.pitchByPitchNote
  }

  if (Array.isArray(existing.game?.pickoffCatchMissInvestigations)) {
    rebuilt.game = rebuilt.game ?? {}
    rebuilt.game.pickoffCatchMissInvestigations = existing.game.pickoffCatchMissInvestigations
  }

  const prevMiss = existing.game?.missingOrPartial ?? []
  const phase10Miss = prevMiss.filter((s) => !String(s).startsWith("phase2:"))
  const rebuiltMiss = rebuilt.game?.missingOrPartial ?? []
  const phase2Miss = rebuiltMiss.filter(
    (s) => String(s).startsWith("phase2:") || String(s).startsWith("raw") || String(s).startsWith("seasonYear"),
  )
  rebuilt.game = rebuilt.game ?? {}
  const mergedMiss = [...phase2Miss, ...phase10Miss]
  rebuilt.game.missingOrPartial = [...new Set(mergedMiss)]

  return rebuilt
}
