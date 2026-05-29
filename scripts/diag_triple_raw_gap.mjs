/**
 * 出場成績 raw（stats）・テキスト速報 raw・一球 score raw が「同時に無い／使えない」試合を一覧する。
 *
 * 判定は `diag_phase2_raw_completeness.mjs`（stats/text）および
 * `diag_sportsnavi_score_raw_coverage.mjs`（score の .html 数）と同等の単純化。
 * ※試合中止（メイン HTML）の試合は「三種欠け」カウントから除外（同日スポナビ正常の別扱い）。
 *
 *   node scripts/diag_triple_raw_gap.mjs --year 2026
 *   node scripts/diag_triple_raw_gap.mjs --year 2026 --json
 *   node scripts/diag_triple_raw_gap.mjs --year 2026 --write-report
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isSportsnaviMainGameCancelled } from "../lib/yahooGame/sportsnaviStatsTextParse.mjs"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(SCRIPT_DIR, "..")

function parseArgs(argv) {
  let year = "2026"
  /** @type {string[] | null} */
  let gameIds = null
  let jsonOnly = false
  let writeReport = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--year" && argv[i + 1]) {
      year = String(argv[++i]).trim() || year
      continue
    }
    if (a?.startsWith("--year=")) {
      year = a.slice("--year=".length).trim() || year
      continue
    }
    if (a === "--game-ids" && argv[i + 1]) {
      gameIds = String(argv[++i])
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      continue
    }
    if (a === "--json") jsonOnly = true
    if (a === "--write-report") writeReport = true
  }
  return { year, gameIds, jsonOnly, writeReport }
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

function countScoreHtmlFiles(gdir) {
  if (!fs.existsSync(gdir)) return 0
  let n = 0
  for (const ent of fs.readdirSync(gdir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith(".html")) continue
    const base = ent.name.slice(0, -".html".length)
    if (/^\d{7}$/.test(base)) n += 1
  }
  return n
}

function classifyOne(gameId, root) {
  const mainDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi")
  const statsDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi_stats")
  const textDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi_text")
  const scoreRoot = path.join(root, "_data", "scraped_games", "raw_sportsnavi_score")

  const mainPath = path.join(mainDir, `${gameId}.html`)
  const statsPath = path.join(statsDir, `${gameId}.html`)
  const textPath = path.join(textDir, `${gameId}.html`)
  const htmlMain = fs.existsSync(mainPath) ? fs.readFileSync(mainPath, "utf8") : null
  const htmlStats = fs.existsSync(statsPath) ? fs.readFileSync(statsPath, "utf8") : null
  const htmlText = fs.existsSync(textPath) ? fs.readFileSync(textPath, "utf8") : null

  const gameCancelled = htmlMain != null && isSportsnaviMainGameCancelled(htmlMain)
  const statsLinks = htmlStats == null ? -2 : countPlayerLinksInStatsHtml(htmlStats)
  const textBlocks = htmlText == null ? -2 : countBbLiveTextBlocks(htmlText)
  const scorePages = countScoreHtmlFiles(path.join(scoreRoot, gameId))

  let statsOk = statsLinks >= 2 || gameCancelled
  let textOk = textBlocks >= 1 || gameCancelled
  /** raw_sportsnavi_score／{試合ID}／ に一球 score ページ .html が1本以上 */
  let scoreOk = scorePages >= 1

  if (statsLinks < 0) statsOk = false
  if (textBlocks < 0) textOk = false

  const hints = []
  if (!gameCancelled) {
    if (statsLinks === -2) hints.push("no_stats_file")
    else if (statsLinks <= 0) hints.push("stats_no_player_links_or_fetch_fail")
    if (textBlocks === -2) hints.push("no_text_file")
    else if (textBlocks === 0) hints.push("text_no_bb_liveText")
    if (scorePages === 0) hints.push("score_no_pages")
  }

  const actionable = !gameCancelled
  const tripleGap = actionable && !statsOk && !textOk && !scoreOk
  const anyGap = actionable && (!statsOk || !textOk || !scoreOk)

  return {
    gameId,
    game_cancelled: gameCancelled,
    stats_links: statsLinks,
    text_bb_liveText_splits: textBlocks,
    score_raw_html_pages: scorePages,
    ok_stats_raw: statsOk,
    ok_text_raw: textOk,
    ok_score_raw: scoreOk,
    triple_all_bad: tripleGap,
    any_raw_gap: anyGap,
    missing_hints: hints,
  }
}

function main() {
  const root = PROJECT_ROOT
  const { year, gameIds: idsArg, jsonOnly, writeReport } = parseArgs(process.argv.slice(2))

  let gameIds = idsArg
  if (!gameIds || gameIds.length === 0) {
    const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
    if (!fs.existsSync(idxPath)) {
      console.error("[diag triple-raw] missing index:", idxPath)
      process.exit(1)
    }
    const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"))
    gameIds = Array.isArray(idx.gameIds) ? idx.gameIds.map((x) => String(x).trim()).filter(Boolean) : []
  }

  const rows = gameIds.map((gid) => classifyOne(gid, root))

  const triple = rows.filter((r) => r.triple_all_bad)
  const anyGap = rows.filter((r) => r.any_raw_gap)
  const cancelled = rows.filter((r) => r.game_cancelled)

  const payload = {
    schemaVersion: "diag-triple-raw-gap-v1",
    year,
    gameCount: rows.length,
    cancelledCount: cancelled.length,
    /** 試合中止を除き、stats・text・score raw が同時に使えない試合（最も強い欠損） */
    tripleAllBadCount: triple.length,
    tripleAllBadGameIds: triple.map((r) => r.gameId),
    /** いずれかが欠ける試合（中止除く） */
    anyGapCount: anyGap.length,
    note_statsText: `stats/text の OK 条件は diag_phase2_raw_completeness と同一（選手リンク≥2／bb-liveText≥1 を目安／FETCH_FAILED は NG／中止は除外）。`,
    note_score:
      "score は raw_sportsnavi_score/{試合ID}/ 直下に 7桁index由来の *.html が1本以上あることとする。triple_all_bad は試合中止（メイン HTML）を除いた試合のみ。",
    rows,
  }

  if (jsonOnly) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  if (writeReport) {
    const outDir = path.join(root, "_data", "reports")
    fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, `diag_triple_raw_gap_${year}.json`)
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8")
    console.log(`[diag triple-raw] wrote ${outPath}`)
  }

  console.log("")
  console.log("[diag triple raw gap] 出場・テキスト・一球(score) raw の同時充足")
  console.log(`  year=${year}`)
  console.log(`  index games（対象試合）     : ${rows.length}`)
  console.log(`  試合中止（メイン HTML）除外 : ${cancelled.length}`)
  console.log("")
  console.log(`  ★三種とも取得・解析できていない試合（中止除く・最優先確認）: ${triple.length}`)
  if (triple.length) {
    const show = triple.slice(0, 40).map((r) => r.gameId)
    console.log(`      ${show.join(", ")}${triple.length > 40 ? " …" : ""}`)
    for (const r of triple.slice(0, 12)) {
      console.log(
        `      - ${r.gameId} hints=${JSON.stringify(r.missing_hints)} (links=${r.stats_links}, liveTextSplits=${r.text_bb_liveText_splits}, scorePages=${r.score_raw_html_pages})`,
      )
    }
    if (triple.length > 12) console.log(`      … 他 ${triple.length - 12} 件は --json で全文`)
  }
  console.log("")
  console.log(`  いずれか欠け（中止除く）     : ${anyGap.length}`)
  console.log("")
  console.log("  ─ 詳細 JSON ─")
  console.log(`    node scripts/diag_triple_raw_gap.mjs --year ${year} --json`)
  console.log("    node scripts/diag_phase2_raw_completeness.mjs --year …（stats/text の行単位・同一指標）")
  console.log("    npm run diag:sportsnavi-score-raw-coverage")
  console.log("")
}

main()
