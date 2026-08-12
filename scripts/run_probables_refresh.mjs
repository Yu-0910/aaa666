#!/usr/bin/env node
/**
 * トップ「予想投手」タブ更新の一括スクリプト。
 *
 * ここに含めるもの:
 * - 1回目push用: ランキング/順位表/チームページ/選手基本成績タブ/top-leaders を生成・反映
 * - 2回目push用: 残り詳細成績/予想先発タブを生成・反映
 * - Sporting News ローテーション取得（以前の稼働方針）
 * - Sportsnavi 未来日程取得
 * - Yahoo! 日程ページから当日/翌日の予告先発を明示取得
 * - top-probables JSON 生成（Yahoo 予告先発フォールバック、短縮名→フルネーム/ID補正は lib 側）
 * - ローカル検証（フルネーム、NPB ID、英字名解決、成績欄の欠落確認）
 * - R2 反映 2回目: top-probables（予想先発タブ本体）と残り詳細成績
 *
 * 使い方:
 *   node scripts/run_probables_refresh.mjs --year 2026 --as-of 2026-07-09
 *   node scripts/run_probables_refresh.mjs --year 2026 --as-of 2026-07-09 --no-upload
 *   node scripts/run_probables_refresh.mjs --year 2026 --as-of 2026-07-09 --dry-run
 */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

function argValue(name, fallback = null) {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`))
  if (eq) return eq.split("=").slice(1).join("=")
  const idx = process.argv.indexOf(name)
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]
  return fallback
}

const year = String(argValue("--year", "2026")).replace(/[^\d]/g, "") || "2026"
const asOfDate = argValue("--as-of", null)
const fromDate = argValue("--from", `${year}-03-27`)
const toDate = argValue("--to", asOfDate)
const dryRun = process.argv.includes("--dry-run")
const noUpload = process.argv.includes("--no-upload")
const skipDerivedUpload = process.argv.includes("--skip-derived-upload")
const allowUnboundedCanonical = process.argv.includes("--allow-unbounded-canonical")
const skipFetch = process.argv.includes("--skip-fetch")
const forceCanonical = process.argv.includes("--force-canonical")
const yahooForce = process.argv.includes("--yahoo-force") || process.argv.includes("--complete")
const childEnv = {
  ...process.env,
  // 旧日次一括と同じ本番方針: 打席結果・通算/ランキングは出場成績末尾列を正にする。
  TOPPAGE_PLATE_RESULT_SOURCE: process.env.TOPPAGE_PLATE_RESULT_SOURCE ?? "appearance_only",
  TOPPAGE_BATTING_SEASON_AGG: process.env.TOPPAGE_BATTING_SEASON_AGG ?? "appearance_slots",
  TOPPAGE_STRICT_PHASE2_CANONICAL_REBUILD:
    process.env.TOPPAGE_STRICT_PHASE2_CANONICAL_REBUILD ?? "1",
}

function log(message) {
  const now = new Date().toISOString()
  console.log(`[probables:refresh] [${now}] ${message}`)
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T00:00:00+09:00`)
  d.setUTCDate(d.getUTCDate() + days)
  const y = d.toLocaleString("en-CA", { timeZone: "Asia/Tokyo", year: "numeric" })
  const m = d.toLocaleString("en-CA", { timeZone: "Asia/Tokyo", month: "2-digit" })
  const day = d.toLocaleString("en-CA", { timeZone: "Asia/Tokyo", day: "2-digit" })
  return `${y}-${m}-${day}`
}

function todayJstYmd() {
  const now = new Date()
  const y = now.toLocaleString("en-CA", { timeZone: "Asia/Tokyo", year: "numeric" })
  const m = now.toLocaleString("en-CA", { timeZone: "Asia/Tokyo", month: "2-digit" })
  const day = now.toLocaleString("en-CA", { timeZone: "Asia/Tokyo", day: "2-digit" })
  return `${y}-${m}-${day}`
}

function run(label, command, args) {
  const printable = [command, ...args].join(" ")
  log(`${label}: ${printable}`)
  if (dryRun) return
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: childEnv,
    shell: process.platform === "win32",
  })
}

function runNpm(label, script) {
  run(label, "npm", ["run", script])
}

function runTry(label, command, args) {
  try {
    run(label, command, args)
    return true
  } catch (e) {
    return false
  }
}

function runNpmTry(label, script) {
  return runTry(label, "npm", ["run", script])
}

function gameDateFromTitle(title) {
  const m = String(title ?? "").match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return null
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
}

function assertCanonicalDateScope() {
  if (allowUnboundedCanonical) {
    log("--allow-unbounded-canonical: canonical 日付上限チェックをスキップ")
    return
  }
  if (!asOfDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(asOfDate))) {
    throw new Error(
      "--as-of YYYY-MM-DD が必須です。例: node scripts/run_probables_refresh.mjs --year 2026 --as-of 2026-07-09",
    )
  }

  const canonicalDir = path.join(ROOT, "_data", "scraped_games", "canonical")
  const files = fs.existsSync(canonicalDir)
    ? fs.readdirSync(canonicalDir).filter((f) => f.endsWith(".json"))
    : []
  const futureGames = []
  let latestDate = ""

  for (const file of files) {
    const p = path.join(canonicalDir, file)
    let json
    try {
      json = JSON.parse(fs.readFileSync(p, "utf8"))
    } catch {
      continue
    }
    const date = gameDateFromTitle(json?.game?.meta?.documentTitle)
    if (!date) continue
    if (!latestDate || date > latestDate) latestDate = date
    if (date > asOfDate) {
      futureGames.push({
        gameId: path.basename(file, ".json"),
        date,
        title: json?.game?.meta?.documentTitle ?? "",
      })
    }
  }

  log(`canonical 日付確認: asOf=${asOfDate} latestCanonical=${latestDate || "-"} games=${files.length}`)
  if (futureGames.length > 0) {
    const sample = futureGames
      .slice(0, 8)
      .map((g) => `  ${g.gameId} ${g.date} ${g.title}`)
      .join("\n")
    throw new Error(
      `--as-of ${asOfDate} より後の canonical が ${futureGames.length} 件あります。\n` +
        "このまま実行すると、未確定/不完全な未来日データがランキング・選手成績に混ざります。\n" +
        `${sample}\n` +
        "対処: as-of を最新試合日に合わせるか、後日分の canonical を退避/修復してから再実行してください。",
    )
  }
}

function assertFetchDateScope() {
  if (skipFetch) return
  if (!fromDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(fromDate))) {
    throw new Error("--from YYYY-MM-DD の形式が不正です。例: --from 2026-03-27")
  }
  if (!toDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(toDate))) {
    throw new Error("--to または --as-of YYYY-MM-DD が必要です。例: --as-of 2026-07-09")
  }
  if (fromDate > toDate) {
    throw new Error(`取得範囲が不正です: from=${fromDate} to=${toDate}`)
  }
}

function runAcquisitionAndCanonicalRefresh() {
  if (skipFetch) {
    log("--skip-fetch: 取得/canonical更新をスキップし、既存canonicalから派生します")
    return
  }

  const canonicalMode = forceCanonical || yahooForce ? "--force" : "--only-stale"
  const phase4Force = yahooForce ? ["--force"] : []

  run("Phase0 日程スナップショット + インデックス（--merge）", "npx", [
    "tsx",
    "scripts/phase0_fetch_sportsnavi_schedule.ts",
    "--year",
    year,
    "--from",
    fromDate,
    "--to",
    toDate,
    "--merge",
  ])
  run("Phase0 未来日程（今日+14日・三連戦検出用）", "npx", [
    "tsx",
    "scripts/phase0_fetch_schedule_ahead.ts",
    "--year",
    year,
  ])
  run("Phase1 試合ページ raw（トップ）", "node", [
    "scripts/phase1_fetch_sportsnavi_games.mjs",
    "--year",
    year,
  ])
  run("Phase2a 出場成績・テキスト速報 raw", "node", [
    "scripts/phase2_fetch_sportsnavi_stats_text.mjs",
    "--year",
    year,
    "--from",
    fromDate,
    "--to",
    toDate,
  ])
  run("Phase2a-repair 不完全な stats/text のみ再取得", "node", [
    "scripts/phase2_fetch_sportsnavi_stats_text.mjs",
    "--year",
    year,
    "--only-incomplete",
    "--from",
    fromDate,
    "--to",
    toDate,
  ])
  run("Phase2a-b 一球速報 score?index= raw", "python", [
    "-u",
    "scripts/fetch_sportsnavi_score_raw_snapshot.py",
    "--year",
    year,
    "--sleep",
    "1.2",
    "--from-date",
    fromDate,
    "--to-date",
    toDate,
  ])
  run("Phase2b canonical 生成（raw 指紋不一致・thin のみ再生成）", "node", [
    "scripts/phase2_build_canonical_from_raw_sportsnavi.mjs",
    "--year",
    year,
    "--from",
    fromDate,
    "--to",
    toDate,
    canonicalMode,
  ])
  const gateArgs = [
    "-u",
    "scripts/gate_score_raw_complete_for_pipeline.py",
    "--year",
    year,
    "--from-date",
    fromDate,
    "--to-date",
    toDate,
    "--fail",
  ]
  if (!runTry("ゲート: score raw 完了確認（未完了なら停止）", "python", gateArgs)) {
    log("score raw ゲートNG: 旧日次一括同様、stats/text・score raw・canonicalを1回だけ再取得/再生成して再確認")
    run("Phase2a-repair（ゲートNG復旧）不完全な stats/text のみ再取得", "node", [
      "scripts/phase2_fetch_sportsnavi_stats_text.mjs",
      "--year",
      year,
      "--only-incomplete",
      "--from",
      fromDate,
      "--to",
      toDate,
    ])
    run("score raw 再取得（ゲートNG復旧）", "python", [
      "-u",
      "scripts/fetch_sportsnavi_score_raw_snapshot.py",
      "--year",
      year,
      "--sleep",
      "1.2",
      "--from-date",
      fromDate,
      "--to-date",
      toDate,
    ])
    run("Phase2b canonical 再生成（ゲートNG復旧・--force）", "node", [
      "scripts/phase2_build_canonical_from_raw_sportsnavi.mjs",
      "--year",
      year,
      "--from",
      fromDate,
      "--to",
      toDate,
      "--force",
    ])
    run("ゲート: score raw 完了確認（復旧後）", "python", gateArgs)
  }
  run("Yahoo 一球速報ログ復元 + canonical マージ", "node", [
    "scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs",
    "--year",
    year,
    "--from-date",
    fromDate,
    "--to-date",
    toDate,
    "--sleep",
    "1.2",
    ...phase4Force,
  ])
  run("実況テキストから resultSummaryJa 再補完", "npx", [
    "tsx",
    "scripts/backfill_plate_appearances_from_text_play_by_play.ts",
  ])
  run("検証: pitch-by-pitch coverage", "node", [
    "scripts/diag_pitch_by_pitch_coverage_all_games.mjs",
    "--year",
    year,
    "--from-date",
    fromDate,
    "--to-date",
    toDate,
    "--fail",
  ])
  const canonicalNonemptyArgs = [
    "tsx",
    "scripts/validate_phase2_canonical_nonempty.ts",
    "--year",
    year,
    "--fail",
  ]
  if (!runTry("検証: canonical に打撃データが皆無の試合が残っていないこと", "npx", canonicalNonemptyArgs)) {
    log("canonical打撃データ検証NG: 旧日次一括同様、不完全stats/text再取得→canonical --force→再検証を1回実行")
    run("Phase2a-repair（canonical検証NG復旧）不完全な stats/text のみ再取得", "node", [
      "scripts/phase2_fetch_sportsnavi_stats_text.mjs",
      "--year",
      year,
      "--only-incomplete",
      "--from",
      fromDate,
      "--to",
      toDate,
    ])
    run("Phase2b canonical 再生成（canonical検証NG復旧・--force）", "node", [
      "scripts/phase2_build_canonical_from_raw_sportsnavi.mjs",
      "--year",
      year,
      "--force",
    ])
    run("実況テキストから resultSummaryJa 再補完（canonical検証NG復旧後）", "npx", [
      "tsx",
      "scripts/backfill_plate_appearances_from_text_play_by_play.ts",
    ])
    run("検証: canonical に打撃データが皆無の試合が残っていないこと（復旧後）", "npx", canonicalNonemptyArgs)
  }
}

function runFirstPushBuild() {
  runNpm("派生: pitcher PoC + Yahoo pitcher index", "phase:pitcher-poc1")
  runNpm("派生: phase11 batting", "phase11:build:batting")
  runNpm("検証: 出場成績 打数列 vs 末尾スロット", "validate:appearance-slots-vs-line-ab:fail")
  runNpm("検証: appearance_slots の CS と代走のみ SB", "verify:cs-runner-events-appearance-slots")
  runNpm("名簿: NPB 英字名更新", "roster:fetch-npb-en")
  runNpm("ランキング JSON: phase12 batting rankings", "phase12:build:rankings")
  if (!runNpmTry("ランキング JSON: phase19 pitching rankings", "phase19:build:pitching-rankings")) {
    log("phase19 失敗: romanName不足等を想定し、名簿再取得後に1回だけ再試行")
    runNpm("名簿: NPB 英字名再取得", "roster:fetch-npb-en")
    runNpm("ランキング JSON: phase19 pitching rankings（再試行）", "phase19:build:pitching-rankings")
  }
  runNpm("ランキング JSON: phase28 weekly rankings", "phase28:build:weekly-rankings")
  runNpm("ランキング JSON: phase29 team standings", "phase29:build:standings")
  runNpm("検証: phase29 team standings", "validate:team-standings:2026:fail")
  runNpm("トップ表示: 通算リーダー", "top-leaders:build:2026")
  runNpm("トップ表示: 今週リーダー", "top-weekly-leaders:build:2026")
  runNpm("検証: canonical batting completeness", "validate:canonical-batting-completeness")
}

function runSecondPushBuild() {
  runNpm("派生: text play headlines", "enrich:text-play-headlines")
  runNpm("派生: pitcher catcher splits", "phase6:build:pitcher-catcher-splits")
  runNpm("派生: phase13 context", "phase13:build:context")
  runNpm("検証: phase13 context vs phase11", "validate:phase13-context-vs-phase11:fail")
  runNpm("派生: phase14 pitch", "phase14:build:pitch")
  runNpm("派生: phase15 batting splits", "phase15:build:batting-splits")
  runNpm("派生: phase16 batting count", "phase16:build:batting-count")
  runNpm("派生: phase17 batting period", "phase17:build:period")
  runNpm("派生: phase7 pitcher period", "phase7:build:pitcher-period")
  runNpm("派生: pitcher season pitch types", "phase25:build:pitcher-season-pitch-types")
  runNpm("派生: catcher appearances", "phase22:build:catcher-appearances")
  runNpm("派生: catcher pitcher splits", "phase23:build:catcher-pitcher-splits")
  runNpm("派生: catcher defense basic", "phase24:build:catcher-defense-basic")
  runNpm("検証: catcher defense active", "validate:catcher-defense-active:2026")
  runNpm("派生: catcher starting summary", "phase25:build:catcher-starting-summary")
  runNpm("派生: catcher PA round pitch types", "phase26:build:catcher-pa-round-pitch-types")
  runNpm("派生: pitcher zones", "phase20:build:pitcher-zones")
  runNpm("派生: player matchup", "phase30:build:player-matchup")
  runNpm("検証: matchup vs phase11", "validate:phase31-matchup-vs-phase11:fail")
  runNpm("派生: batter vs team count pitch types", "phase33:build:batter-vs-team-count-pitch-types")
  runNpm("検証: batter vs team pitch vs phase14", "validate:phase34-batter-vs-team-pitch-vs-phase14:fail")
  runNpm("索引: Yahoo NPB full index", "build:yahoo-npb-full-index")
  runNpm("検証: phase11 vs vs_hand P0", "validate:vs-hand-vs-phase11")
}

function readSnapshot() {
  const p = path.join(ROOT, "public", "data", "top-probables", year, "current.json")
  const raw = fs.readFileSync(p, "utf8")
  return JSON.parse(raw)
}

function isProbablyShortJapaneseName(name) {
  const compact = String(name ?? "").replace(/[\s\u3000]+/g, "")
  if (!compact) return false
  if (/^[Ａ-ＺA-Z][．.]/u.test(compact)) return false
  if (/^[\u30A0-\u30FFー]+$/u.test(compact)) return false
  return compact.length <= 3
}

function hasSeasonStats(slot) {
  return (
    slot?.seasonEra != null ||
    slot?.seasonWins != null ||
    slot?.seasonLosses != null ||
    slot?.seasonKbbPct != null
  )
}

function collectSlots(snapshot) {
  const slots = []
  for (const card of snapshot.cards ?? []) {
    for (const game of card.games ?? []) {
      for (const key of ["homeProbable", "awayProbable"]) {
        const slot = game[key]
        if (!slot?.pitcherNameJa) continue
        slots.push({
          cardKey: card.cardKey,
          dateJst: game.dateJst,
          side: key,
          teamCode: slot.teamCode,
          name: slot.pitcherNameJa,
          npbId: slot.pitcherNpbId,
          publicId: slot.pitcherPublicId,
          source: slot.source,
          hasStats: hasSeasonStats(slot),
        })
      }
    }
  }
  return slots
}

function verifySnapshot() {
  const snapshot = readSnapshot()
  const slots = collectSlots(snapshot)
  const shortNames = slots.filter((s) => isProbablyShortJapaneseName(s.name))
  const missingIds = slots.filter((s) => !s.npbId)
  const missingStats = slots.filter((s) => !s.hasStats)

  log(
    `検証: generatedAt=${snapshot.generatedAt ?? "-"} cards=${snapshot.cards?.length ?? 0} ` +
      `named=${slots.length} ids=${slots.length - missingIds.length}/${slots.length} ` +
      `stats=${slots.length - missingStats.length}/${slots.length}`,
  )

  if (shortNames.length > 0) {
    console.warn("[probables:refresh] WARN: フルネーム未解決の可能性:")
    for (const s of shortNames) {
      console.warn(`  ${s.dateJst} ${s.teamCode} ${s.name} (${s.source})`)
    }
  }
  if (missingIds.length > 0) {
    console.warn("[probables:refresh] WARN: NPB IDなし（球団不一致や元データ未登録の可能性）:")
    for (const s of missingIds) {
      console.warn(`  ${s.dateJst} ${s.teamCode} ${s.name} (${s.source})`)
    }
  }
  if (missingStats.length > 0) {
    console.warn("[probables:refresh] WARN: 成績欄なし（投手PoC未生成・当年登板なし等）:")
    for (const s of missingStats) {
      console.warn(`  ${s.dateJst} ${s.teamCode} ${s.name} npb=${s.npbId ?? "-"} (${s.source})`)
    }
  }

  return { slots, missingIds, missingStats, shortNames }
}

function main() {
  log(
    `開始 year=${year}${asOfDate ? ` asOf=${asOfDate}` : ""} fetch=${skipFetch ? "skip" : `${fromDate}..${toDate}`}${dryRun ? " dry-run" : ""}${
      noUpload ? " no-upload" : ""
    }`,
  )
  log(
    `打撃集計方針: TOPPAGE_PLATE_RESULT_SOURCE=${childEnv.TOPPAGE_PLATE_RESULT_SOURCE} ` +
      `TOPPAGE_BATTING_SEASON_AGG=${childEnv.TOPPAGE_BATTING_SEASON_AGG}`,
  )

  assertFetchDateScope()
  runAcquisitionAndCanonicalRefresh()
  assertCanonicalDateScope()

  runFirstPushBuild()

  if (noUpload) {
    log("--no-upload: R2 アップロードをスキップ")
  } else if (skipDerivedUpload) {
    log("--skip-derived-upload: 詳細成績派生のR2反映をスキップ")
  } else {
    run("R2 反映 1回目: ランキング/順位表/チームページ/top-leaders", "node", [
      "scripts/display_r2_upload.mjs",
      "--year",
      year,
      "--only",
      "rankings,standings,top-leaders",
    ])
    run("R2 反映 1回目: 選手ページ基本成績（野手）", "node", [
      "scripts/display_r2_upload_derived.mjs",
      "--year",
      year,
      "--only",
      "player_season_batting",
    ])
    run("R2 反映 1回目: 選手ページ基本成績（投手）", "node", [
      "scripts/display_r2_upload_derived.mjs",
      "--year",
      year,
      "--only",
      "player_season_pitching_poc",
    ])
  }

  runSecondPushBuild()

  run("Sporting News ローテーション取得", "npx", [
    "tsx",
    "scripts/phase35_fetch_sportingnews_rotation.ts",
    "--year",
    year,
  ])
  if (skipFetch) {
    run("未来日程取得", "npx", ["tsx", "scripts/phase0_fetch_schedule_ahead.ts", "--year", year])
  }
  const probablesAsOfDate = asOfDate ?? todayJstYmd()
  run("Yahoo! 当日予告先発取得", "npx", [
    "tsx",
    "scripts/fetch_yahoo_schedule_probables.ts",
    "--year",
    year,
    "--date",
    probablesAsOfDate,
  ])
  run("Yahoo! 翌日予告先発取得", "npx", [
    "tsx",
    "scripts/fetch_yahoo_schedule_probables.ts",
    "--year",
    year,
    "--date",
    addDaysYmd(probablesAsOfDate, 1),
  ])

  run("予想投手 JSON 生成", "npx", [
    "tsx",
    "scripts/phase36_build_top_probables.ts",
    "--year",
    year,
    "--as-of",
    probablesAsOfDate,
  ])

  if (!dryRun) verifySnapshot()

  if (noUpload) {
    log("--no-upload: top-probables のR2反映をスキップ")
  } else {
    if (skipDerivedUpload) {
      log("--skip-derived-upload: 残り詳細成績派生のR2反映をスキップ")
    } else {
      run("R2 反映 2回目: 残り詳細成績", "node", [
        "scripts/display_r2_upload_derived.mjs",
        "--year",
        year,
        "--exclude",
        "player_season_batting,player_season_pitching_poc",
      ])
    }
    run("R2 反映 2回目: top-probables", "node", [
      "scripts/display_r2_upload.mjs",
      "--year",
      year,
      "--only",
      "top-probables",
    ])
  }

  log("完了")
}

try {
  main()
} catch (e) {
  console.error("[probables:refresh] failed:", e?.message || e)
  process.exit(1)
}
