/**
 * 全試合の一球速報カバレッジ調査
 * - raw score HTML（raw_sportsnavi_score）
 * - derived phase10（*_phase10_restored.json）
 * - canonical ディスク上（plateAppearances / pitchEvents）
 * - マージ後（mergePhase10RestoredIntoDocIfPresent 相当の有無）
 *
 *   node scripts/diag_pitch_by_pitch_coverage_all_games.mjs --year 2026
 *   node scripts/diag_pitch_by_pitch_coverage_all_games.mjs --year 2026 --json
 *   node scripts/diag_pitch_by_pitch_coverage_all_games.mjs --year 2026 --fail
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const require = createRequire(import.meta.url)

function parseArgs(argv) {
  let year = "2026"
  let jsonOnly = false
  let fail = false
  let limitWorst = 15
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--year" && argv[i + 1]) year = String(argv[++i]).trim() || year
    if (a?.startsWith("--year=")) year = a.slice("--year=".length).trim() || year
    if (a === "--json") jsonOnly = true
    if (a === "--fail") fail = true
    if (a === "--worst" && argv[i + 1]) limitWorst = Number(argv[++i]) || limitWorst
  }
  return { year, jsonOnly, fail, limitWorst }
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"))
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

function isCancelled(doc) {
  const miss = doc.game?.missingOrPartial ?? []
  if (miss.some((s) => String(s).includes("game_cancelled"))) return true
  const title = doc.game?.meta?.documentTitle ?? ""
  return /試合中止|ノーゲーム|サスペンド|コールド/.test(title)
}

function analyzePaCoverage(doc) {
  const pas = doc.domain?.plateAppearances ?? []
  let total = 0
  let withEvents = 0
  let summaryOnly = 0
  let empty = 0
  let totalPitchEvents = 0
  for (const pa of pas) {
    total += 1
    const pe = pa.pitchEvents ?? []
    const summary = String(pa.resultSummaryJa ?? "").trim()
    const n = Array.isArray(pe) ? pe.length : 0
    totalPitchEvents += n
    if (n > 0) withEvents += 1
    else if (summary) summaryOnly += 1
    else empty += 1
  }
  const flat = doc.domain?.pitchEvents?.length ?? 0
  return {
    paTotal: total,
    paWithEvents: withEvents,
    paSummaryOnly: summaryOnly,
    paEmpty: empty,
    paEventPct: total ? Math.round((withEvents / total) * 1000) / 10 : 0,
    pitchEventsOnPas: totalPitchEvents,
    pitchEventsFlat: flat,
  }
}

function phase10DerivedPath(gameId) {
  return path.join(root, "_data", "scraped_games", "derived", `${gameId}_phase10_restored.json`)
}

function hasPhase10Derived(gameId) {
  const p = phase10DerivedPath(gameId)
  if (!fs.existsSync(p)) return { exists: false, rows: 0 }
  try {
    const raw = readJson(p)
    const rows = Array.isArray(raw.pitchRows) ? raw.pitchRows.length : 0
    return { exists: true, rows }
  } catch {
    return { exists: true, rows: -1 }
  }
}

function hasMergedStamp(gameId) {
  return fs.existsSync(
    path.join(root, "_data", "scraped_games", "derived", `${gameId}_phase10_merged.stamp`),
  )
}

async function loadMergeFn() {
  try {
    const mod = await import("../lib/seasonStatsPilot.ts")
    return mod.mergePhase10RestoredIntoDocIfPresent
  } catch {
    return null
  }
}

function main() {
  const { year, jsonOnly, fail, limitWorst } = parseArgs(process.argv.slice(2))
  const indexPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  const canonDir = path.join(root, "_data", "scraped_games", "canonical")
  const scoreRoot = path.join(root, "_data", "scraped_games", "raw_sportsnavi_score")

  /** @type {string[]} */
  let gameIds = []
  if (fs.existsSync(indexPath)) {
    const idx = readJson(indexPath)
    gameIds = (idx.gameIds ?? []).map((x) => String(x).trim()).filter(Boolean)
  } else {
    gameIds = fs
      .readdirSync(canonDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort()
  }

  /** @type {import('../lib/yahooGame/types').CanonicalGameDocument[]} */
  const diskDocs = []
  const missingCanon = []

  for (const gid of gameIds) {
    const cp = path.join(canonDir, `${gid}.json`)
    if (!fs.existsSync(cp)) {
      missingCanon.push(gid)
      continue
    }
    diskDocs.push(readJson(cp))
  }

  const mergeFn = null // sync path only below; ts merge optional in summary

  /** @type {object[]} */
  const rows = []

  for (const gid of gameIds) {
    const cp = path.join(canonDir, `${gid}.json`)
    if (!fs.existsSync(cp)) {
      rows.push({
        gameId: gid,
        missing_canonical: true,
      })
      continue
    }
    const disk = readJson(cp)
    const cancelled = isCancelled(disk)
    const scorePages = countScoreHtmlFiles(path.join(scoreRoot, gid))
    const p10 = hasPhase10Derived(gid)
    const mergedStamp = hasMergedStamp(gid)
    const diskStatus = disk.game?.pitchByPitchNote?.status ?? "unknown"
    const diskCov = analyzePaCoverage(disk)

    const phase10Missing = (disk.game?.missingOrPartial ?? []).filter((s) =>
      String(s).startsWith("phase10:"),
    )

    let effective = disk
    let effectiveStatus = diskStatus
    if (p10.exists && p10.rows > 0 && diskStatus !== "restored_phase10") {
      effectiveStatus = "would_merge_derived_phase10"
    }

    rows.push({
      gameId: gid,
      cancelled,
      score_pages: scorePages,
      phase10_derived: p10.exists,
      phase10_rows: p10.rows,
      phase10_merged_stamp: mergedStamp,
      disk_pitch_status: diskStatus,
      effective_pitch_status: effectiveStatus,
      events_fingerprint: Boolean(disk.eventsFingerprint),
      phase10_missing_flags: phase10Missing.length,
      ...diskCov,
      has_events: diskCov.pitchEventsOnPas > 0 || diskCov.pitchEventsFlat > 0,
    })
  }

  const actionable = rows.filter((r) => !r.cancelled && !r.missing_canonical)
  const cancelledN = rows.filter((r) => r.cancelled).length
  const noCanon = rows.filter((r) => r.missing_canonical).length

  const withScoreRaw = actionable.filter((r) => r.score_pages > 0).length
  const withPhase10Derived = actionable.filter((r) => r.phase10_derived && r.phase10_rows > 0).length
  const diskRestored = actionable.filter((r) => r.disk_pitch_status === "restored_phase10").length
  const diskPartial = actionable.filter((r) => r.disk_pitch_status === "partial").length
  const hasAnyEvents = actionable.filter((r) => r.has_events).length
  const fullPaEvents = actionable.filter((r) => r.paTotal > 0 && r.paWithEvents === r.paTotal).length
  const zeroEvents = actionable.filter((r) => r.paTotal > 0 && r.paWithEvents === 0).length

  const sumPas = actionable.reduce((a, r) => a + (r.paTotal ?? 0), 0)
  const sumPaEvents = actionable.reduce((a, r) => a + (r.paWithEvents ?? 0), 0)
  const sumSummaryOnly = actionable.reduce((a, r) => a + (r.paSummaryOnly ?? 0), 0)

  const derivedButNotMerged = actionable.filter(
    (r) => r.phase10_derived && r.phase10_rows > 0 && r.disk_pitch_status !== "restored_phase10",
  )
  const scoreButNoEvents = actionable.filter((r) => r.score_pages > 0 && !r.has_events)
  const eventsButNotFull = actionable.filter(
    (r) => r.has_events && r.paTotal > 0 && r.paWithEvents < r.paTotal,
  )

  const report = {
    year,
    index_games: gameIds.length,
    canonical_on_disk: diskDocs.length,
    missing_canonical: noCanon,
    cancelled_games: cancelledN,
    actionable_games: actionable.length,
    raw_score_html: {
      games_with_pages: withScoreRaw,
      games_without_pages: actionable.length - withScoreRaw,
    },
    phase10_derived: {
      games_with_rows: withPhase10Derived,
      derived_not_in_canonical_disk: derivedButNotMerged.length,
    },
    canonical_disk: {
      restored_phase10: diskRestored,
      partial_status: diskPartial,
      other_status: actionable.length - diskRestored - diskPartial,
    },
    plate_appearances: {
      total: sumPas,
      with_pitch_events: sumPaEvents,
      summary_only_no_events: sumSummaryOnly,
      pa_event_coverage_pct: sumPas ? Math.round((sumPaEvents / sumPas) * 1000) / 10 : 0,
    },
    games: {
      any_pitch_events: hasAnyEvents,
      all_pas_have_events: fullPaEvents,
      zero_pitch_events: zeroEvents,
      partial_pa_events: eventsButNotFull.length,
    },
    gaps: {
      score_raw_but_no_canonical_events: scoreButNoEvents.length,
      sample_score_no_events: scoreButNoEvents.slice(0, 10).map((r) => r.gameId),
      derived_not_merged_sample: derivedButNotMerged.slice(0, 10).map((r) => r.gameId),
    },
  }

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  console.log("")
  console.log("[diag 一球速報カバレッジ — 全試合]")
  console.log(`  対象年: ${year}`)
  console.log(`  インデックス試合数: ${gameIds.length}`)
  console.log(`  canonical ファイル: ${diskDocs.length}（欠損 ${noCanon}）`)
  console.log(`  試合中止等除外: ${cancelledN} → 分析対象 ${actionable.length} 試合`)
  console.log("")
  console.log("  ─ raw（raw_sportsnavi_score）─")
  console.log(`    score HTML あり: ${withScoreRaw} / ${actionable.length}`)
  console.log(`    score HTML なし: ${actionable.length - withScoreRaw}`)
  console.log("")
  console.log("  ─ Phase10 derived（*_phase10_restored.json）─")
  console.log(`    復元 JSON あり（pitchRows>0）: ${withPhase10Derived}`)
  console.log(
    `    derived あるが canonical 未マージ（status≠restored_phase10）: ${derivedButNotMerged.length}`,
  )
  console.log("")
  console.log("  ─ canonical ディスク上 ─")
  console.log(`    pitchByPitchNote=restored_phase10: ${diskRestored}`)
  console.log(`    pitchByPitchNote=partial: ${diskPartial}`)
  console.log(`    いずれかの pitchEvents あり: ${hasAnyEvents} 試合`)
  console.log(`    全打席に pitchEvents: ${fullPaEvents} 試合`)
  console.log(`    pitchEvents ゼロ（打席はある）: ${zeroEvents} 試合`)
  console.log(`    打席の一部のみ pitchEvents: ${eventsButNotFull.length} 試合`)
  console.log("")
  console.log("  ─ 打席単位（全試合合算）─")
  console.log(`    plateAppearances 合計: ${sumPas}`)
  console.log(`    pitchEvents あり: ${sumPaEvents}（${report.plate_appearances.pa_event_coverage_pct}%）`)
  console.log(`    resultSummary のみ（events なし）: ${sumSummaryOnly}`)
  console.log("")
  console.log("  ─ ギャップ ─")
  console.log(`    score raw あるのに canonical に events 無し: ${scoreButNoEvents.length} 試合`)
  if (scoreButNoEvents.length) {
    console.log(`      例: ${report.gaps.sample_score_no_events.join(", ")}`)
  }
  if (derivedButNotMerged.length) {
    console.log(`    phase10 derived 未マージ例: ${report.gaps.derived_not_merged_sample.join(", ")}`)
  }

  const noScore = actionable.filter((r) => r.score_pages === 0).map((r) => r.gameId)
  const emptyP10 = actionable.filter((r) => !r.phase10_rows || r.phase10_rows <= 0).map((r) => r.gameId)
  if (noScore.length) console.log(`\n  score HTML なし試合 (${noScore.length}): ${noScore.join(", ")}`)
  if (emptyP10.length) {
    console.log(`\n  phase10 pitchRows=0 (${emptyP10.length}): ${emptyP10.join(", ")}`)
  }

  const worst = [...actionable]
    .filter((r) => r.paTotal > 0)
    .sort((a, b) => (a.paEventPct ?? 0) - (b.paEventPct ?? 0))
    .slice(0, limitWorst)

  console.log("")
  console.log(`  ─ PAイベント率が低い試合（下位 ${limitWorst}）─`)
  for (const r of worst) {
    console.log(
      `    ${r.gameId}\tPA=${r.paTotal}\tevents=${r.paWithEvents}（${r.paEventPct}%）\tsummaryOnly=${r.paSummaryOnly}\tscorePages=${r.score_pages}\tdisk=${r.disk_pitch_status}\tp10rows=${r.phase10_rows}`,
    )
  }
  console.log("")

  const gapCount = scoreButNoEvents.length
  if (fail && gapCount > 0) {
    console.error(
      `[diag pitch-by-pitch] FAIL: score HTML あり & pitchRows 空（canonical events なし）が ${gapCount} 試合あります。`,
    )
    process.exit(2)
  }
}

main()
