/**
 * Phase2 入力3種（スポナビ raw）の充足度を一覧する。
 *
 * - raw_sportsnavi_stats: `parseSportsnaviStatsHtml` と同条件で「選手行」が取れるか
 *   （`href="/npb/player/{数字}/"` の件数が目安）
 * - raw_sportsnavi_text: `class="bb-liveText"` ブロックが存在するか（テキスト速報本文）
 *
 * 取得できなかった主因の典型:
 * - stats に選手リンクが無い → HTML はあるが **打撃表 tbody が空**（試合前取得・未反映・ノーゲーム等）
 * - text に bb-liveText が無い → 同上、または別レイアウト
 * - 試合トップに bb-head01__title「試合中止」→ 出場成績・テキストは空で正常（phase2 充足扱い）
 *
 * 使い方:
 *   node scripts/diag_phase2_raw_completeness.mjs --year 2026
 *   node scripts/diag_phase2_raw_completeness.mjs --game-ids 2021038726,2021038710
 */

import fs from "node:fs"
import path from "node:path"
import { isSportsnaviMainGameCancelled } from "../lib/yahooGame/sportsnaviStatsTextParse.mjs"

function parseArgs(argv) {
  const yearIdx = argv.indexOf("--year")
  const idsIdx = argv.indexOf("--game-ids")
  const year = yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026"
  const idsRaw = idsIdx >= 0 ? String(argv[idsIdx + 1] ?? "").trim() : ""
  const gameIds = idsRaw
    ? idsRaw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : null
  return { year, gameIds }
}

function countPlayerLinksInStatsHtml(html) {
  if (!html || typeof html !== "string") return 0
  const t = html.trimStart()
  if (t.startsWith("FETCH_FAILED") || t.startsWith("<!-- fetch failed")) return -1
  const re = /href="\/npb\/player\/(\d+)\//g
  let n = 0
  while (re.exec(html) !== null) n += 1
  return n
}

function countBbLiveTextBlocks(html) {
  if (!html || typeof html !== "string") return 0
  const t = html.trimStart()
  if (t.startsWith("FETCH_FAILED") || t.startsWith("<!-- fetch failed")) return -1
  const parts = html.split('class="bb-liveText"')
  return Math.max(0, parts.length - 1)
}

function main() {
  const root = process.cwd()
  const { year, gameIds: idsArg } = parseArgs(process.argv.slice(2))

  let gameIds = idsArg
  if (!gameIds || gameIds.length === 0) {
    const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
    if (!fs.existsSync(idxPath)) {
      console.error("[diag] missing:", idxPath)
      process.exit(1)
    }
    const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"))
    gameIds = Array.isArray(idx.gameIds) ? idx.gameIds.map(String) : []
  }

  const mainDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi")
  const statsDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi_stats")
  const textDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi_text")

  const rows = []
  for (const gameId of gameIds) {
    const mainPath = path.join(mainDir, `${gameId}.html`)
    const statsPath = path.join(statsDir, `${gameId}.html`)
    const textPath = path.join(textDir, `${gameId}.html`)
    const htmlMain = fs.existsSync(mainPath) ? fs.readFileSync(mainPath, "utf8") : null
    const htmlStats = fs.existsSync(statsPath) ? fs.readFileSync(statsPath, "utf8") : null
    const htmlText = fs.existsSync(textPath) ? fs.readFileSync(textPath, "utf8") : null
    const gameCancelled = htmlMain != null && isSportsnaviMainGameCancelled(htmlMain)
    const statsLinks = htmlStats == null ? -2 : countPlayerLinksInStatsHtml(htmlStats)
    const textBlocks = htmlText == null ? -2 : countBbLiveTextBlocks(htmlText)

    let phase2StatsOk = statsLinks >= 2 || gameCancelled
    let phase2TextOk = textBlocks >= 1 || gameCancelled
    if (statsLinks < 0) phase2StatsOk = false
    if (textBlocks < 0) phase2TextOk = false

    const missing = []
    if (statsLinks === -2) missing.push("no_stats_file")
    else if (statsLinks <= 0 && !gameCancelled) missing.push("stats_no_player_links")
    if (textBlocks === -2) missing.push("no_text_file")
    else if (textBlocks === 0 && !gameCancelled) missing.push("text_no_bb_liveText")

    rows.push({
      gameId,
      game_cancelled_main_html: gameCancelled,
      raw_stats_href_player_count: statsLinks,
      raw_text_bb_liveText_splits: textBlocks,
      phase2_stats_parseable: phase2StatsOk,
      phase2_text_parseable: phase2TextOk,
      missing_hints: missing,
    })
  }

  const bad = rows.filter((r) => !r.phase2_stats_parseable || !r.phase2_text_parseable)
  const out = {
    schemaVersion: "diag-phase2-raw-completeness-v1",
    year,
    gameCount: rows.length,
    incompleteCount: bad.length,
    note:
      'stats: href="/npb/player/{数字}/" の件数（選手行の目安）。text: class="bb-liveText" の分割数。',
    rows,
    incompleteGameIds: bad.map((r) => r.gameId),
  }

  console.log(JSON.stringify(out, null, 2))
}

main()
