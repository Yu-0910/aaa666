/**
 * 今季試合のうち「raw には出場成績が取れるのに canonical に載っていない」等を一覧。
 *
 *   node scripts/diag_stale_sportsnavi_appearance_stats.mjs --year 2026
 *   node scripts/diag_stale_sportsnavi_appearance_stats.mjs --year 2026 --write-report
 */

import fs from "node:fs"
import path from "node:path"
import {
  computePhase2RawFingerprint,
  countParsedStatsRowsInHtml,
  isHtmlFetchFailed,
  isPhase2RawComplete,
  sportsnaviCanonicalNeedsRebuild,
} from "../lib/yahooGame/phase2RawCanonicalSync.mjs"
import {
  isSportsnaviMainGameCancelled,
  parseSportsnaviStatsHtml,
  parseSportsnaviTextHtml,
} from "../lib/yahooGame/sportsnaviStatsTextParse.mjs"

function parseArgs(argv) {
  const yearIdx = argv.indexOf("--year")
  const writeReport = argv.includes("--write-report")
  const year = yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026"
  return { year, writeReport }
}

function readText(p) {
  try {
    if (!fs.existsSync(p)) return null
    return fs.readFileSync(p, "utf8")
  } catch {
    return null
  }
}

function readJson(p) {
  try {
    if (!fs.existsSync(p)) return null
    return JSON.parse(fs.readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

function parseYmdFromTitleJa(title) {
  const m = String(title ?? "").match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return null
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
}

function shouldSkipAsTodayOrFuture(title) {
  const ymd = parseYmdFromTitleJa(title)
  if (!ymd) return false
  const today = new Date()
  const ty = today.getFullYear()
  const tm = today.getMonth() + 1
  const td = today.getDate()
  const [y, mo, d] = ymd.split("-").map((x) => parseInt(x, 10))
  if (y > ty) return true
  if (y < ty) return false
  if (mo > tm) return true
  if (mo < tm) return false
  return d >= td
}

/**
 * 試合中止・ノーゲームのみ除外。試合前は **stats がパース可能なら除外しない**
 * （トップ raw が試合前のまま・出場成績だけ後から取れたケースがある）。
 */
function shouldSkipAsNoContest(htmlMain, htmlStats, htmlText, parsedStatsRows) {
  const htmls = [htmlMain, htmlStats, htmlText].filter(Boolean)
  const titleRe = /<h2[^>]*\bbb-head01__title\b[^>]*>\s*(試合中止|ノーゲーム)\s*<\/h2>/i
  for (const h of htmls) {
    if (titleRe.test(h)) return { skip: true, reason: "no_contest_title" }
  }
  const preGameRe =
    /<p[^>]*\bbb-gameCard__state\b[^>]*>[\s\S]*?<span>\s*試合前\s*<\/span>/i
  if (parsedStatsRows < 2) {
    for (const h of htmls) {
      if (preGameRe.test(h)) return { skip: true, reason: "pre_game_card_and_empty_stats" }
    }
  }
  return { skip: false, reason: "" }
}

function main() {
  const root = process.cwd()
  const { year, writeReport } = parseArgs(process.argv.slice(2))
  const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  const idx = readJson(idxPath)
  if (!idx?.gameIds?.length) {
    console.error("[diag:stale-appearance] missing index:", idxPath)
    process.exit(1)
  }

  const mainDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi")
  const statsDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi_stats")
  const textDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi_text")
  const canonicalDir = path.join(root, "_data", "scraped_games", "canonical")

  const indexIds = idx.gameIds.map(String)
  const canonicalIds = fs.existsSync(canonicalDir)
    ? fs
        .readdirSync(canonicalDir)
        .filter((f) => /^\d+\.json$/.test(f))
        .map((f) => f.replace(/\.json$/, ""))
    : []
  const gameIds = [...new Set([...indexIds, ...canonicalIds])].sort()

  /** @type {Record<string, any[]>} */
  const buckets = {
    stale_canonical_empty_stats: [],
    raw_stats_incomplete: [],
    canonical_missing: [],
    canonical_and_raw_both_empty: [],
    cancelled: [],
    future_or_today: [],
    main_html_pre_game_but_stats_ok: [],
    ok: [],
  }

  for (const gameId of gameIds) {
    const htmlMain = readText(path.join(mainDir, `${gameId}.html`))
    const htmlStats = readText(path.join(statsDir, `${gameId}.html`))
    const htmlText = readText(path.join(textDir, `${gameId}.html`))
    const canonical = readJson(path.join(canonicalDir, `${gameId}.json`))

    const title =
      canonical?.game?.meta?.documentTitle ??
      (htmlStats && !isHtmlFetchFailed(htmlStats) ? htmlStats.match(/<title[^>]*>([^<]+)/i)?.[1] : "") ??
      ""

    if (!String(title).includes(`${year}年`) && htmlMain == null && canonical == null) continue

    const gameCancelled =
      (htmlMain && isSportsnaviMainGameCancelled(htmlMain)) ||
      (canonical?.game?.missingOrPartial ?? []).some((s) => String(s).includes("game cancelled"))

    if (gameCancelled) {
      buckets.cancelled.push({ gameId, title })
      continue
    }

    const parsedStatsRows = htmlStats && !isHtmlFetchFailed(htmlStats) ? parseSportsnaviStatsHtml(htmlStats).length : 0

    const nf = shouldSkipAsNoContest(htmlMain ?? "", htmlStats ?? "", htmlText ?? "", parsedStatsRows)
    if (nf.skip) {
      buckets.cancelled.push({ gameId, title, note: nf.reason })
      continue
    }

    if (shouldSkipAsTodayOrFuture(title) && parsedStatsRows < 2) {
      buckets.future_or_today.push({ gameId, title })
      continue
    }
    const parsedTextSections =
      htmlText && !isHtmlFetchFailed(htmlText) ? parseSportsnaviTextHtml(htmlText).length : 0
    const rawComplete = isPhase2RawComplete({ htmlMain, htmlStats, htmlText })
    const fingerprint = computePhase2RawFingerprint(htmlMain ?? "", htmlStats, htmlText)

    const canonStatsRows = (canonical?.game?.statsPlayerLinkedRows ?? []).length
    const canonBattingLines = (canonical?.domain?.battingLines ?? []).length
    const canonTextSections = (canonical?.game?.textPlayByPlay ?? []).length
    const canonPa = (canonical?.domain?.plateAppearances ?? []).length

    const row = {
      gameId,
      title: String(title).replace(/\s+/g, " ").trim(),
      gameDate: parseYmdFromTitleJa(title),
      rawParsedStatsRows: parsedStatsRows,
      rawPhase2Complete: rawComplete,
      canonicalStatsRows: canonStatsRows,
      canonicalBattingLines: canonBattingLines,
      canonicalTextSections: canonTextSections,
      canonicalPlateAppearances: canonPa,
    }

    if (!canonical) {
      buckets.canonical_missing.push(row)
      continue
    }

    const rebuild = sportsnaviCanonicalNeedsRebuild(canonical, {
      rawFingerprint: fingerprint,
      parsedStatsRowCount: parsedStatsRows,
      parsedTextSectionCount: parsedTextSections,
      gameCancelled: false,
    })

    const mainPreGame =
      htmlMain != null &&
      /<p[^>]*\bbb-gameCard__state\b[^>]*>[\s\S]*?<span>\s*試合前\s*<\/span>/i.test(htmlMain)

    if (rebuild.rebuild && parsedStatsRows >= 2 && canonStatsRows === 0) {
      buckets.stale_canonical_empty_stats.push({
        ...row,
        rebuildReason: rebuild.reason,
        mainHtmlStillPreGame: mainPreGame,
      })
      continue
    }

    if (!rawComplete && parsedStatsRows < 2) {
      buckets.raw_stats_incomplete.push({
        ...row,
        missingRaw: [
          !htmlStats ? "no_stats_file" : null,
          htmlStats && isHtmlFetchFailed(htmlStats) ? "stats_fetch_failed" : null,
          parsedStatsRows < 2 ? "stats_unparseable" : null,
        ].filter(Boolean),
      })
      continue
    }

    if (canonStatsRows === 0 && canonBattingLines === 0 && parsedStatsRows < 2) {
      buckets.canonical_and_raw_both_empty.push(row)
      continue
    }

    buckets.ok.push({ gameId })
  }

  const emptyCanonAll = []
  for (const gameId of gameIds) {
    const canonical = readJson(path.join(canonicalDir, `${gameId}.json`))
    if (!canonical) continue
    const title = canonical?.game?.meta?.documentTitle ?? ""
    if (!String(title).includes(`${year}年`)) continue
    if ((canonical.game?.statsPlayerLinkedRows ?? []).length > 0) continue
    const htmlStats = readText(path.join(statsDir, `${gameId}.html`))
    const parsed =
      htmlStats && !isHtmlFetchFailed(htmlStats) ? parseSportsnaviStatsHtml(htmlStats).length : -1
    emptyCanonAll.push({
      gameId,
      gameDate: parseYmdFromTitleJa(title),
      rawParsedStatsRows: parsed,
      canonicalPlateAppearances: (canonical.domain?.plateAppearances ?? []).length,
    })
  }
  emptyCanonAll.sort((a, b) => String(a.gameDate).localeCompare(String(b.gameDate)))

  const summary = {
    schemaVersion: "diag-stale-sportsnavi-appearance-stats-v1",
    year,
    scannedGameIds: gameIds.length,
    counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    note: {
      stale_canonical_empty_stats:
        "raw に出場成績表あり・canonical の statsPlayerLinkedRows が空（8856 と同型）。--only-stale で再生成",
      canonical_empty_stats_all:
        "canonical で stats が空の試合一覧（raw 未取込・試合前を含む）",
    },
    stale_canonical_empty_stats: buckets.stale_canonical_empty_stats.sort((a, b) =>
      String(a.gameDate).localeCompare(String(b.gameDate)),
    ),
    canonical_empty_stats_all: emptyCanonAll,
    raw_stats_incomplete: buckets.raw_stats_incomplete.sort((a, b) =>
      String(a.gameDate).localeCompare(String(b.gameDate)),
    ),
    canonical_missing: buckets.canonical_missing,
    canonical_and_raw_both_empty: buckets.canonical_and_raw_both_empty,
    byDate: {},
  }

  for (const r of buckets.stale_canonical_empty_stats) {
    const d = r.gameDate ?? "unknown"
    if (!summary.byDate[d]) summary.byDate[d] = []
    summary.byDate[d].push(r.gameId)
  }

  console.log(JSON.stringify(summary, null, 2))

  if (writeReport) {
    const outPath = path.join(
      root,
      "_data",
      "derived",
      `diag_stale_sportsnavi_appearance_stats_${year}.json`,
    )
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8")
    console.error(`[diag:stale-appearance] wrote ${outPath}`)
  }
}

main()
