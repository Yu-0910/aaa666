/**
 * Phase 2 (Sportsnavi): raw HTML → canonical v1
 *
 * 入力:
 * - `_data/scraped_games/raw_sportsnavi/{gameId}.html`（試合トップ）
 * - `_data/scraped_games/raw_sportsnavi_stats/{gameId}.html`（出場成績）
 * - `_data/scraped_games/raw_sportsnavi_text/{gameId}.html`（テキスト速報）
 *
 * 出力:
 * - `_data/scraped_games/canonical/{gameId}.json`
 *   - `game.statsPlayerLinkedRows` / `game.textPlayByPlay`
 *   - `game.teams[].startingLineup` … 出場成績 HTML の括弧付き「位置」行から打順 1〜9（`sportsnaviStatsStartingLineup.mjs`）
 *     （各イニング `lines` に加え、可能なら `playHeadlineJa`＝各プレー `li` の一球上段 `bb-liveText__itemTitle`。取得は特定条件トリガーではなくテキスト HTML 内の全プレー対象）
 *   - `domain.battingLines` / `domain.pitchingLines`（buildCanonical と同一推論）
 *
 * 使い方:
 *   node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year 2026
 *   node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year 2026 --limit 10
 *   node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year 2026 --game-ids 2021038717 --force
 *   node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year 2026 --force
 *   node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year 2026 --from 2026-05-13 --to 2026-05-13 --only-stale
 *   （Windows 全件）: scripts/run_phase2_canonical_all.cmd をダブルクリック、または npm run phase2:sportsnavi:canonical -- --force
 *
 * --only-stale … raw の指紋不一致、または CSR 空のまま残った thin canonical だけ再生成（日次運用向け）。
 * 既定（フラグ無し）… 存在する canonical でも上記に該当すれば再生成。該当しなければスキップ。
 */

import fs from "node:fs"
import path from "node:path"
import { appendPipelineBulkLog } from "./pipelineBulkLog.mjs"
import {
  computePhase2RawFingerprint,
  isHtmlFetchFailed,
  preservePhase10DomainOnSportsnaviRebuild,
  sportsnaviCanonicalNeedsRebuild,
} from "../lib/yahooGame/phase2RawCanonicalSync.mjs"
import {
  buildBattingPitchingFromStatsRows,
  isSportsnaviMainGameCancelled,
  parseSportsnaviStatsHtml,
  parseSportsnaviTextHtml,
  parseRunnerEventsFromRawTextHtml,
  parseRunnerEventsFromTextPlayByPlay,
  yahooPlayersMentionedFromStatsRows,
} from "../lib/yahooGame/sportsnaviStatsTextParse.mjs"
import { parseTeamsFromSportsnaviStatsHtml } from "../lib/yahooGame/sportsnaviStatsStartingLineup.mjs"

function parseArgs(argv) {
  const yearIdx = argv.indexOf("--year")
  const limitIdx = argv.indexOf("--limit")
  const gameIdsIdx = argv.indexOf("--game-ids")
  const fromIdx = argv.indexOf("--from")
  const toIdx = argv.indexOf("--to")
  const force = argv.includes("--force")
  const onlyStale = argv.includes("--only-stale")
  const year = yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026"
  const limitRaw = limitIdx >= 0 ? String(argv[limitIdx + 1] ?? "").trim() : ""
  const limit = limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 0) : 0
  const gameIdsRaw = gameIdsIdx >= 0 ? String(argv[gameIdsIdx + 1] ?? "").trim() : ""
  const gameIdsFilter = gameIdsRaw
    ? gameIdsRaw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : null
  const from = fromIdx >= 0 ? String(argv[fromIdx + 1] ?? "").trim() : ""
  const to = toIdx >= 0 ? String(argv[toIdx + 1] ?? "").trim() : ""
  return { year, limit, force, onlyStale, gameIdsFilter, from, to }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

/**
 * @param {any} idx
 * @param {string[]} gameIdsAll
 * @param {string} from
 * @param {string} to
 */
function filterGameIdsByDateRange(idx, gameIdsAll, from, to) {
  const byDate = idx?.byDate
  if (!byDate || typeof byDate !== "object") return gameIdsAll
  const f = String(from || "").trim()
  const t = String(to || "").trim()
  if (!f && !t) return gameIdsAll

  const allowed = new Set()
  for (const [day, ids] of Object.entries(byDate)) {
    if (!day) continue
    if (f && day < f) continue
    if (t && day > t) continue
    if (!Array.isArray(ids)) continue
    for (const x of ids) {
      const s = String(x ?? "").trim()
      if (s) allowed.add(s)
    }
  }
  if (allowed.size === 0) return gameIdsAll
  return gameIdsAll.filter((g) => allowed.has(String(g).trim()))
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? String(m[1]).replace(/\s+/g, " ").trim() : ""
}

function readIfExists(p) {
  try {
    if (!fs.existsSync(p)) return null
    return fs.readFileSync(p, "utf8")
  } catch {
    return null
  }
}

function main() {
  const { year, limit, force, onlyStale, gameIdsFilter, from, to } = parseArgs(process.argv.slice(2))
  const root = process.cwd()
  const rawDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi")
  const statsDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi_stats")
  const textDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi_text")
  const canonicalDir = path.join(root, "_data", "scraped_games", "canonical")
  ensureDir(canonicalDir)

  if (!fs.existsSync(rawDir)) {
    console.error("[phase2] missing raw dir:", rawDir)
    console.error("")
    console.error("このフォルダは Git に含まれない／別 PC でしか無い場合があります。試合トップの raw HTML を先に取得してください。")
    console.error("  1) 日程インデックス: npm run phase0:sportsnavi:schedule")
    console.error("  2) 各試合ページ取得: npm run phase1:sportsnavi:games")
    console.error("その後もう一度: npm run phase2:sportsnavi:canonical -- --force")
    console.error("")
    console.error("（出場成績・テキスト速報を canonical に載せるには _data/scraped_games/raw_sportsnavi_stats と raw_sportsnavi_text も必要です。未取得なら batting/text は空になります。）")
    process.exit(1)
  }

  let files = fs.readdirSync(rawDir).filter((f) => /^\d+\.html$/.test(f)).sort()
  if (gameIdsFilter && gameIdsFilter.length > 0) {
    const set = new Set(gameIdsFilter.map(String))
    files = files.filter((f) => set.has(f.replace(/\.html$/, "")))
  } else if (from || to) {
    const indexPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
    const idx = readJsonIfExists(indexPath)
    if (idx?.schemaVersion === "sportsnavi-schedule-season-index-v1") {
      const allIds = files.map((f) => f.replace(/\.html$/, ""))
      const filtered = filterGameIdsByDateRange(idx, allIds, from, to)
      const set = new Set(filtered.map(String))
      files = files.filter((f) => set.has(f.replace(/\.html$/, "")))
      console.log(`[phase2] date-range: from=${from || "(none)"} to=${to || "(none)"} → ${files.length} game(s)`)
    }
  }
  const targets = limit > 0 ? files.slice(0, limit) : files
  if (targets.length === 0) {
    console.error("[phase2] no raw html files under:", rawDir)
    console.error("  → npm run phase1:sportsnavi:games （必要なら --force）で {gameId}.html を生成してください。")
    process.exit(1)
  }

  const builtAt = new Date().toISOString()
  let wrote = 0
  let skipped = 0
  let staleRebuilt = 0
  let thinCanonical = 0
  const logEvery = Math.max(
    1,
    parseInt(String(process.env.TOPPAGE_PHASE2_CANONICAL_LOG_EVERY ?? "8"), 10) || 8,
  )
  const skipLogStride = targets.length <= 24 ? 1 : logEvery

  for (let fi = 0; fi < targets.length; fi++) {
    const f = targets[fi]
    const gameId = f.replace(/\.html$/, "")
    const rawPath = path.join(rawDir, f)
    const statsPath = path.join(statsDir, `${gameId}.html`)
    const textPath = path.join(textDir, `${gameId}.html`)
    const outPath = path.join(canonicalDir, `${gameId}.json`)

    const htmlMain = fs.readFileSync(rawPath, "utf8")
    const htmlStats = readIfExists(statsPath)
    const htmlText = readIfExists(textPath)
    const gameCancelled = isSportsnaviMainGameCancelled(htmlMain)

    const statsPlayerLinkedRows = parseSportsnaviStatsHtml(htmlStats ?? "")
    const lineupFromStats =
      htmlStats && !isHtmlFetchFailed(htmlStats)
        ? parseTeamsFromSportsnaviStatsHtml(htmlStats)
        : { teams: [], totalStarterSlots: 0, teamTableCount: 0 }
    const textPlayByPlay = parseSportsnaviTextHtml(htmlText ?? "")
    const fingerprint = computePhase2RawFingerprint(htmlMain, htmlStats, htmlText)

    const existingCanonical = readJsonIfExists(outPath)
    const rebuildDecision = force
      ? { rebuild: true, reason: "force" }
      : sportsnaviCanonicalNeedsRebuild(existingCanonical, {
          rawFingerprint: fingerprint,
          parsedStatsRowCount: statsPlayerLinkedRows.length,
          parsedTextSectionCount: textPlayByPlay.length,
          parsedStarterSlotCount: lineupFromStats.totalStarterSlots,
          gameCancelled,
        })

    if (!force && !rebuildDecision.rebuild) {
      skipped += 1
      if (fi === 0 || (fi + 1) % skipLogStride === 0 || fi + 1 === targets.length) {
        console.log(
          `[phase2] canonical ${fi + 1}/${targets.length} ${gameId} … skip (${rebuildDecision.reason}) wrote=${wrote} skipped=${skipped}`,
        )
      }
      continue
    }

    if (rebuildDecision.reason !== "force" && rebuildDecision.reason !== "missing_canonical") {
      staleRebuilt += 1
    }
    const { battingLines, pitchingLines } = buildBattingPitchingFromStatsRows(
      statsPlayerLinkedRows,
      htmlStats ?? "",
    )
    const yahooPlayersMentioned = yahooPlayersMentionedFromStatsRows(statsPlayerLinkedRows)
    const runnerEventsRaw = parseRunnerEventsFromRawTextHtml(htmlText ?? "", gameId)
    const runnerEvents =
      Array.isArray(runnerEventsRaw) && runnerEventsRaw.length > 0
        ? runnerEventsRaw
        : parseRunnerEventsFromTextPlayByPlay(textPlayByPlay, yahooPlayersMentioned, gameId)

    const titleStats = htmlStats && !isHtmlFetchFailed(htmlStats) ? extractTitle(htmlStats) : ""
    const titleMain = extractTitle(htmlMain)
    const documentTitle = titleStats || titleMain

    const missingOrPartial = []
    if (!htmlStats || isHtmlFetchFailed(htmlStats)) {
      missingOrPartial.push("phase2: stats HTML missing or fetch failed (batting/pitching lines may be empty)")
    } else if (statsPlayerLinkedRows.length === 0 && !gameCancelled) {
      missingOrPartial.push("phase2: stats HTML present but no player rows parsed")
      missingOrPartial.push(
        "phase2: hint: スポナビ /stats は CSR のため、初回 fetch が空テーブルだけになることがある。phase2_fetch は遅延再試行する。手動では npm run phase2:sportsnavi:stats-text -- --year " +
          year +
          " --game-ids " +
          gameId +
          " --force",
      )
    } else if (
      statsPlayerLinkedRows.length >= 2 &&
      lineupFromStats.teams.length < 2 &&
      !gameCancelled
    ) {
      missingOrPartial.push(
        "phase2: stats rows parsed but starting lineup from stats could not be built (check parenthesized position cells)",
      )
    } else if (
      lineupFromStats.totalStarterSlots > 0 &&
      lineupFromStats.totalStarterSlots < 14 &&
      !gameCancelled
    ) {
      missingOrPartial.push(
        `phase2: starting_lineup_partial from stats (${lineupFromStats.totalStarterSlots} starter slots across ${lineupFromStats.teams.length} teams)`,
      )
    }
    if (!htmlText || isHtmlFetchFailed(htmlText)) {
      missingOrPartial.push("phase2: text HTML missing or fetch failed (textPlayByPlay may be empty)")
    } else if (textPlayByPlay.length === 0 && !gameCancelled) {
      missingOrPartial.push("phase2: text HTML present but no bb-liveText sections parsed")
    }
    if (gameCancelled) {
      missingOrPartial.push("phase2: game cancelled (試合中止); empty stats/text expected")
    }
    const needsAttention =
      !gameCancelled &&
      ((!htmlStats || isHtmlFetchFailed(htmlStats) || statsPlayerLinkedRows.length === 0) ||
        (!htmlText || isHtmlFetchFailed(htmlText) || textPlayByPlay.length === 0))
    if (needsAttention) {
      thinCanonical += 1
      appendPipelineBulkLog(
        root,
        "phase2_canonical",
        `gameId=${gameId} thin_or_incomplete: statsRows=${statsPlayerLinkedRows.length} textSections=${textPlayByPlay.length} cancelled=${gameCancelled}`,
      )
    }
    missingOrPartial.push(`rawMainPath=${path.relative(root, rawPath).replace(/\\/g, "/")}`)
    if (htmlStats) missingOrPartial.push(`rawStatsPath=${path.relative(root, statsPath).replace(/\\/g, "/")}`)
    if (htmlText) missingOrPartial.push(`rawTextPath=${path.relative(root, textPath).replace(/\\/g, "/")}`)
    missingOrPartial.push(`seasonYear=${year}`)

    /** @type {Record<string, unknown>} */
    let canonical = {
      schemaVersion: "yahoo-game-canonical-v1",
      gameId,
      builtAt,
      sourceSchema: "sportsnavi-stats-text-v1",
      sourceCompositeFingerprint: fingerprint,
      normalizedFetchedAt: builtAt,
      game: {
        meta: { documentTitle, ogTitle: documentTitle },
        scoreboard: [],
        teams: lineupFromStats.teams,
        textPlayByPlay,
        statsPlayerLinkedRows,
        yahooPlayersMentioned,
        missingOrPartial,
        pitchByPitchNote: {
          status: "partial",
          note: "Sportsnavi Phase2: stats/text parsed; pitch-by-pitch / 一球速報は別ソースが必要",
        },
      },
      domain: {
        plateAppearances: [],
        pitchEvents: [],
        runnerEvents,
        battingLines,
        pitchingLines,
      },
    }

    canonical = preservePhase10DomainOnSportsnaviRebuild(canonical, existingCanonical)

    fs.writeFileSync(outPath, JSON.stringify(canonical, null, 2), "utf8")
    wrote += 1
    const tag = rebuildDecision.reason === "force" ? "wrote" : `wrote (${rebuildDecision.reason})`
    console.log(`[phase2] canonical ${fi + 1}/${targets.length} ${gameId} … ${tag}`)
    if (rebuildDecision.reason !== "force" && rebuildDecision.reason !== "missing_canonical") {
      appendPipelineBulkLog(
        root,
        "phase2_canonical",
        `gameId=${gameId} rebuilt_stale: reason=${rebuildDecision.reason} statsRows=${statsPlayerLinkedRows.length} textSections=${textPlayByPlay.length}`,
      )
    }
  }

  console.log(
    `[phase2] year=${year} targets=${targets.length} wrote=${wrote} staleRebuilt=${staleRebuilt} skipped=${skipped} thinOrIncomplete=${thinCanonical} onlyStale=${onlyStale} out=${canonicalDir}`,
  )
  if (thinCanonical > 0) {
    appendPipelineBulkLog(
      root,
      "phase2_canonical",
      `summary: wrote=${wrote} skipped=${skipped} thinOrIncomplete=${thinCanonical} (運用3: stats/text を再取得してから canonical を再生成すること)`,
    )
  }
}

main()
