/**
 * 日次一括: スポナビ日程 → 試合raw（トップ・出場成績・テキスト）→ canonical → 派生 → ランキングJSON → トップ表示用スナップショット（指標名・数値）
 *
 * **打撃の本番方針**（`docs/data_operation_rules.md` §一括取得方針）:
 *   - 打席結果: 出場成績末尾列のみ（`TOPPAGE_PLATE_RESULT_SOURCE=appearance_only`）
 *   - 通算・ランキング: 出場末尾列の積み上げ（`TOPPAGE_BATTING_SEASON_AGG=appearance_slots`）
 *   子プロセス `childEnv` で両方を固定。一球の要約・line.ab は打席結果の正にしない。
 *
 * 既存の phase5 より一段多く、phase2:sportsnavi:stats-text を含める（出場成績・テキスト速報）。
 * 派生計算（打席・球種・ゾーン・カウント等）に必要な plateAppearances / pitchEvents は Yahoo 一球速報由来のため、
 *   **既定で Phase4 一球パイプラインを実行する**（Phase2b のあと。空 pitchRows の derived は再解析）。
 *   詳細: `docs/data_operation_rules.md` §「一括取得：依存順序・完了定義・再発防止」。速さ優先なら --skip-yahoo-phase10。
 * 派生ブロック末尾: Phase12/19 → Phase28（週間）→ top-leaders / top-weekly-leaders（トップの指標名・上位選手・数値）。`rankings:rebuild` と同順。
 * Phase10 マージ直後、**実況テキストから resultSummaryJa を再補完**する（新しい実況表記は `inferResultSummaryJaFromSportsnaviPlayLineText` で拾う）。
 *
 * 注意: phase0 は **--merge** で season_YYYY.json を累積（狭い from/to でも gameId 一覧を消さない）。
 *       派生・ランキングは canonical フォルダ内の全試合を集計する点は従来どおり。
 *
 * 再発防止（Phase2）:
 *   Phase2a のあと、**--only-incomplete** で「CSR スケルトン等の不完全な stats/text raw」をシーズン全体から再取得する。
 *   （運用2: 初回 stats/text だけでは空テーブルが残ることがあるため、日次パイプラインでは必ず続けて実行する。）
 *   その後 strict 検証（validate_phase2_canonical_nonempty）で NG のときは **1 回だけ**
 *   同じ incomplete 再取得 → canonical --force →（一球を取り込む設定なら）resultSummaryJa 再補完 → 検証再実行。
 *
 * 出場成績パース・打数整合（2026-05）:
 *   - Phase2b は `bb-statsTable__dataDetail` を1打席1スロットに展開（同一イニング2打席のセル結合対策）。
 *   - Phase11 直後に `validate:appearance-slots-vs-line-ab:fail`（成績表の打数列 vs 末尾スロットの isAtBat 数）。
 *   - 派生ブロック先頭で `validate:sportsnavi-stats-data-detail`（パーサ回帰・固定試合スニペット）。
 *
 * スタメン打順（打順別 Phase15）:
 *   - Phase2b が出場成績 HTML の括弧付き「位置」行から `game.teams[].startingLineup` を載せる（`sportsnaviStatsStartingLineup.mjs`）。
 *   - 古い canonical は派生読込時に `injectTeamsFromSportsnaviStatsIfMissing` で raw stats から補完。詳細: `docs/plan_sportsnavi_stats_starting_lineup.md`。
 *
 * 盗塁死（CS）:
 *   - Phase4 マージで canonical の `domain.runnerEvents` は **一球 score 記録文のみ**（`sourceTier: score`）。
 *   - Phase11（appearance_slots）は score 由来 CS のみ通算に加算（`docs/data_operation_rules.md` §盗塁死）。
 *
 * 運用メモ（取得・一括生成の目安）:
 *   1. Phase0 後: `by_date` の試合数は **1日 0〜6 件**が通常。それ以外は異常の可能性（Phase0 は >6 件で前回スナップショット維持＋ `pipeline_bulk.log`）。
 *   2. Phase2a-repair（`--only-incomplete`）は日次で必ず実行（CSR 空テーブル対策）。
 *   3. Phase2b 後: `pipeline_bulk.log` とコンソールの `thinOrIncomplete` を確認（中止以外で canonical が薄い試合）。
 *   4. Phase1 / Phase2 fetch で失敗・不完全再試行があれば `pipeline_bulk.log` に記録。Phase2b の薄い canonical は phase2_build が試合単位で記録。strict 検証 NG で自動リカバリに入ったときも日次側が記録。
 *
 * 使い方:
 *   node scripts/run_daily_npb_pipeline.mjs
 *     … データ取得〜派生・ランキングまで（末尾ビルドは付けない限りスキップ）
 *   node scripts/run_daily_npb_pipeline.mjs --build
 *     … 最後に `npm run build:clean`（.next 削除後に本番ビルド・静的ページ反映）
 *   node scripts/run_daily_npb_pipeline.mjs --no-build
 *     … `--build` を明示的に避けるとき（実質データのみ）
 *   node scripts/run_daily_npb_pipeline.mjs --year 2026
 *   node scripts/run_daily_npb_pipeline.mjs --from 2026-04-01 --to 2026-04-19
 *   node scripts/run_daily_npb_pipeline.mjs --skip-yahoo-phase10
 *   node scripts/run_daily_npb_pipeline.mjs --derive-only
 *   node scripts/run_daily_npb_pipeline.mjs --fetch-only
 *     … 20:30 先行取得（Phase0〜2b。Phase4・派生なし）
 *   node scripts/run_daily_npb_pipeline.mjs --finalize-only
 *     … 全試合終了後の続き（当日再取得・Phase4・派生）
 *   node scripts/run_daily_npb_pipeline.mjs --no-score-raw
 *   node scripts/run_daily_npb_pipeline.mjs --no-strict-quality
 *     … canonical に打撃ゼロの試合検証をスキップして派生まで進める（非推奨）
 *   node scripts/run_daily_npb_pipeline.mjs --derive-only --build --skip-vs-hand-validate
 *     … phase11 vs vs_hand P0 検証をスキップして本番ビルドまで進める（不一致が既知のときの逃げ道）
 *   node scripts/run_daily_npb_pipeline.mjs --from 2026-05-01 --force-canonical
 *     … Phase2b で既存 canonical も上書き（空シェル再生成・5月以降の埋め直し向け）
 *   node scripts/run_daily_npb_pipeline.mjs --yahoo-force
 *     … Phase4 に --force（一球 phase10 の再準備・再取得寄り。マージ漏れ・古いキャッシュ対策。時間がかかる）
 *   node scripts/run_daily_npb_pipeline.mjs --complete
 *     … --force-canonical + --yahoo-force（raw 更新後の canonical 再生成＋一球の取り直しまで一括。初回復旧・月次メンテ向け）
 *
 * npm:
 *   npm run daily:npb-pipeline        … データ〜派生（末尾 `npm run build:clean` は `--build` で有効化）
 *   npm run daily:npb-pipeline:complete
 *   npm run daily:npb-pipeline:no-build … ビルド省略（データのみ）
 *
 * 進捗表示:
 *   各ステップの前後に時刻付きログを出す。子プロセスは PYTHONUNBUFFERED=1 で Python の行バッファを抑止。
 *   Phase1 / phase2_fetch / phase2 canonical は一定間隔で進捗行を出す（間隔は環境変数で上書き可）:
 *     TOPPAGE_PHASE1_LOG_EVERY（既定 6） / TOPPAGE_PHASE2_LOG_EVERY（既定 4） / TOPPAGE_PHASE2_CANONICAL_LOG_EVERY（既定 8）
 *     いずれも対象試合が24件以下ならスキップ進捗は間引きなし（毎試合ログ）
 */

import { execSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { appendPipelineBulkLog } from "./pipelineBulkLog.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

function nowIsoLocal() {
  // Windows/PowerShell でも読みやすい ISO 風（ローカル時刻）
  const d = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

/** 子プロセス共通: Python の print をすぐ表示、npm のログも出やすくする */
/** 打撃派生: 出場成績のみ（`docs/data_operation_rules.md` §一括取得方針）。明示上書きのみ尊重。 */
const childEnv = {
  ...process.env,
  PYTHONUNBUFFERED: "1",
  TOPPAGE_PLATE_RESULT_SOURCE: process.env.TOPPAGE_PLATE_RESULT_SOURCE ?? "appearance_only",
  TOPPAGE_BATTING_SEASON_AGG: process.env.TOPPAGE_BATTING_SEASON_AGG ?? "appearance_slots",
}


let pipelineStepNo = 0

function logProgress(message) {
  console.log(`[daily:npb-pipeline] [${nowIsoLocal()}] #${++pipelineStepNo} ${message}`)
}

function formatMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n) => String(n).padStart(2, "0")
  if (hh > 0) return `${hh}:${pad(mm)}:${pad(ss)}`
  return `${mm}:${pad(ss)}`
}

/** JST の今日 YYYY-MM-DD */
function todayJstYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** 既定の開幕日以降（2026ペナント想定）。年が変わったら引数で上書き */
function defaultSeasonStart(year) {
  return `${year}-03-27`
}

function parseArgs(argv) {
  const out = {
    year: "2026",
    from: "",
    to: "",
    /** 一球ログ（phase10）。派生の「計算」を揃えるなら true が必要 */
    withYahooPhase10: true,
    build: false,
    deriveOnly: false,
    /** Phase0〜2b の取得のみ（派生・Phase4 なし）。試合前 raw は終了後に --finalize-only で直す */
    fetchOnly: false,
    /** 試合終了後の続き（当日再取得・Phase4・派生）。--fetch-only のあとに実行 */
    finalizeOnly: false,
    noStatsText: false,
    noScoreRaw: false,
    phase1Limit: "",
    /** canonical に battingLines も plateAppearances も無い試合があれば止める */
    strictQuality: true,
    /** Phase2b に --force を付け、既存 canonical を raw から再生成する */
    forceCanonical: false,
    /** Phase4 一球パイプラインに --force（phase10 準備・取得の再実行寄り） */
    yahooForce: false,
    /** validate:vs-hand-vs-phase11 をスキップ（AB 等の既知不一致でビルドまで進めたいとき） */
    skipVsHandValidate: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--year" && argv[i + 1]) {
      out.year = String(argv[++i]).trim()
    } else if (a === "--from" && argv[i + 1]) {
      out.from = String(argv[++i]).trim()
    } else if (a === "--to" && argv[i + 1]) {
      out.to = String(argv[++i]).trim()
    } else if (a === "--with-yahoo-phase10") {
      out.withYahooPhase10 = true
    } else if (a === "--skip-yahoo-phase10") {
      out.withYahooPhase10 = false
    } else if (a === "--build") {
      out.build = true
    } else if (a === "--no-build") {
      out.build = false
    } else if (a === "--derive-only") {
      out.deriveOnly = true
    } else if (a === "--fetch-only") {
      out.fetchOnly = true
    } else if (a === "--finalize-only") {
      out.finalizeOnly = true
    } else if (a === "--no-stats-text") {
      out.noStatsText = true
    } else if (a === "--no-score-raw") {
      out.noScoreRaw = true
    } else if (a === "--phase1-limit" && argv[i + 1]) {
      out.phase1Limit = String(argv[++i]).trim()
    } else if (a === "--no-strict-quality") {
      out.strictQuality = false
    } else if (a === "--force-canonical") {
      out.forceCanonical = true
    } else if (a === "--yahoo-force") {
      out.yahooForce = true
    } else if (a === "--complete") {
      out.forceCanonical = true
      out.yahooForce = true
    } else if (a === "--skip-vs-hand-validate") {
      out.skipVsHandValidate = true
    }
  }
  if (!out.from) out.from = defaultSeasonStart(out.year)
  if (!out.to) out.to = todayJstYmd()
  return out
}

function run(label, command) {
  const startedAt = Date.now()
  logProgress(`→ 開始: ${label}`)
  console.log(`\n========== ${label} ==========\n${command}\n`)
  try {
    execSync(command, { stdio: "inherit", cwd: root, shell: true, env: childEnv })
  } finally {
    const elapsed = Date.now() - startedAt
    logProgress(`← 終了: ${label}（所要 ${formatMs(elapsed)}）`)
  }
}

/** @returns {boolean} 成功時 true（exit 0）。失敗時は false を返し、パイプラインは続行できる */
function runTry(label, command) {
  const startedAt = Date.now()
  logProgress(`→ 開始: ${label}（失敗しても続行可）`)
  console.log(`\n========== ${label} ==========\n${command}\n`)
  try {
    execSync(command, { stdio: "inherit", cwd: root, shell: true, env: childEnv })
    const elapsed = Date.now() - startedAt
    logProgress(`← 終了: ${label}（所要 ${formatMs(elapsed)}）`)
    return true
  } catch (e) {
    const elapsed = Date.now() - startedAt
    const code = e && typeof e.status === "number" ? e.status : 1
    logProgress(`← 失敗: ${label}（所要 ${formatMs(elapsed)}） exit=${code}`)
    return false
  }
}

function runDerivedAndRankings({ build, skipVsHandValidate }) {
  logProgress("派生・ランキングブロック開始（各 npm が順に実行されます）")
  // `npm run phase3:derived:2026` は 1 コマンドで長く見えるため、
  // ここで分解して「どこが長いか」をターミナル上で追えるようにする。
  run("派生: enrich:text-play-headlines", "npm run enrich:text-play-headlines")
  run("派生: phase:pitcher-poc1", "npm run phase:pitcher-poc1")
  run("派生: phase11 batting", "npm run phase11:build:batting")
  run(
    "検証: 出場成績 打数列 vs 末尾スロット（不一致ならここで停止）",
    "npm run validate:appearance-slots-vs-line-ab:fail",
  )
  run("派生: phase13 context", "npm run phase13:build:context")
  run(
    "検証: phase13 対チーム vs Phase11 SSOT（不一致ならここで停止）",
    "npm run validate:phase13-context-vs-phase11:fail",
  )
  run("派生: phase14 pitch", "npm run phase14:build:pitch")
  run("派生: phase15 batting splits", "npm run phase15:build:batting-splits")
  run("派生: phase16 batting count", "npm run phase16:build:batting-count")
  run("派生: phase17 period", "npm run phase17:build:period")
  run("派生: phase6 pitcher-catcher splits", "npm run phase6:build:pitcher-catcher-splits")
  run("派生: phase7 pitcher period", "npm run phase7:build:pitcher-period")
  run("派生: phase22 catcher appearances", "npm run phase22:build:catcher-appearances")
  run("派生: phase23 catcher-pitcher splits", "npm run phase23:build:catcher-pitcher-splits")
  run("派生: phase24 catcher defense basic", "npm run phase24:build:catcher-defense-basic")
  run("派生: phase25 catcher starting summary", "npm run phase25:build:catcher-starting-summary")
  run("派生: phase26 catcher pa round pitch types", "npm run phase26:build:catcher-pa-round-pitch-types")
  run("派生: phase20 pitcher zones", "npm run phase20:build:pitcher-zones")
  run("派生: build yahoo npb full index", "npm run build:yahoo-npb-full-index")

  run("ランキング JSON: phase12 batting rankings", "npm run phase12:build:rankings")
  run("ランキング JSON: phase19 pitching rankings", "npm run phase19:build:pitching-rankings")
  run("ランキング JSON: phase28 weekly rankings", "npm run phase28:build:weekly-rankings")
  run(
    "トップ表示: 通算リーダー（指標名・数値）",
    "npm run top-leaders:build:2026",
  )
  run(
    "トップ表示: 今週リーダー（指標名・数値）",
    "npm run top-weekly-leaders:build:2026",
  )
  run("検証: canonical batting completeness", "npm run validate:canonical-batting-completeness")
  if (skipVsHandValidate) {
    console.warn(
      "\n[daily:npb-pipeline] --skip-vs-hand-validate: phase11 vs vs_hand P0 検証をスキップします（`npm run validate:vs-hand-vs-phase11` は手動で確認推奨）。\n",
    )
  } else {
    run("検証: phase11 vs vs_hand P0", "npm run validate:vs-hand-vs-phase11")
  }

  if (build) run("本番ビルド（検証付き）", "npm run build:clean")
}

function runPhase2FetchBlock({
  year,
  from,
  to,
  noStatsText,
  noScoreRaw,
  phase1Limit,
  phase1Extra,
}) {
  if (!noStatsText) {
    run(
      "Phase2a 出場成績・テキスト速報 raw",
      `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --from ${from} --to ${to}${phase1Extra}`,
    )
    run(
      "Phase2a-repair 不完全な stats/text のみ再取得（--only-incomplete・シーズン全体をスキャン）",
      `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --only-incomplete${phase1Extra}`,
    )
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline",
      "Phase2a-repair (--only-incomplete) 実行済み（運用2: CSR 空テーブル対策）",
    )
    if (!noScoreRaw) {
      const scoreLim = phase1Limit ? ` --limit ${phase1Limit}` : ""
      run(
        "Phase2a-b 一球速報 score?index= raw（全打席・テキストと同じインデックス・to まで）",
        `python -u scripts/fetch_sportsnavi_score_raw_snapshot.py --year ${year} --sleep 1.2 --from-date ${from} --to-date ${to}${scoreLim}`,
      )
    } else {
      console.log(
        "\n[daily:npb-pipeline] --no-score-raw: raw_sportsnavi_score をスキップ（Phase10 は従来どおりネット取得または既存キャッシュ）\n",
      )
    }
  } else {
    console.log("\n[daily:npb-pipeline] --no-stats-text: 出場成績・テキスト raw をスキップ（canonical が薄くなり得ます）\n")
  }
}

function runPhase2bCanonical({
  year,
  from,
  to,
  forceCanonical,
}) {
  const phase2bForce = forceCanonical ? " --force" : " --only-stale"
  const phase2bDate = from || to ? ` --from ${from} --to ${to}` : ""
  run(
    "Phase2b canonical 生成（raw 指紋不一致・thin のみ再生成。Phase10 一球ログは保持）",
    `node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year ${year}${phase2bDate}${phase2bForce}`,
  )
}

function runPhase4AndBackfill({
  year,
  from,
  to,
  withYahooPhase10,
  yahooForce,
  strictQuality,
}) {
  if (!withYahooPhase10) {
    if (yahooForce) {
      console.warn(
        "\n[daily:npb-pipeline] --yahoo-force / --complete を指定しましたが --skip-yahoo-phase10 のため Phase4 はスキップされました。\n",
      )
    }
    console.log(
      "\n[daily:npb-pipeline] --skip-yahoo-phase10: 一球を取り込まないため、canonical の plateAppearances / pitchEvents が空のままになり、球種・ゾーン・詳細集計が弱くなります。\n",
    )
    return
  }
  const phase4Force = yahooForce ? " --force" : ""
  run(
    "Yahoo 一球速報ログ復元 + canonical マージ" +
      (yahooForce ? "（`--force`: phase10 再準備・取得寄り・所要時間増）" : "（欠損試合のみ復元・既定は `--force` なし）"),
    `node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year ${year} --from-date ${from} --to-date ${to} --sleep 1.2${phase4Force}`,
  )
  run(
    "実況テキストから resultSummaryJa 再補完（マージ直後・変更が無ければ 0 file）",
    "npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts",
  )
  if (strictQuality) {
    runTry(
      "検証: score HTML あり & pitchRows 空が残っていないこと（中止除く）",
      "node scripts/diag_pitch_by_pitch_coverage_all_games.mjs --year " + year + " --fail",
    )
  }
}

function runStrictCanonicalValidation({
  year,
  noStatsText,
  phase1Extra,
  withYahooPhase10,
  strictQuality,
}) {
  if (!strictQuality) {
    console.log(
      "\n[daily:npb-pipeline] --no-strict-quality: validate_phase2_canonical_nonempty をスキップします（空 canonical が残り得ます）。\n",
    )
    return
  }
  const validateCmd = `npx tsx scripts/validate_phase2_canonical_nonempty.ts --year ${year} --fail`
  const ok = runTry(
    "検証: canonical に打撃データが皆無の試合が残っていないこと（空だと個人打率が歪む）",
    validateCmd,
  )
  if (!ok) {
    console.warn(
      "\n[daily:npb-pipeline] 検証NG → 不足 raw の再取得と canonical 再生成を自動実行します（最大1回）。手動と同じ手順です。\n",
    )
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline",
      `validate_phase2_canonical_nonempty が NG のため自動リカバリ（incomplete 再取得 → Phase2b --force）を開始しました year=${year}`,
    )
    if (!noStatsText) {
      run(
        "Phase2a-repair（自動リカバリ）不完全な stats/text のみ再取得",
        `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --only-incomplete${phase1Extra}`,
      )
    } else {
      console.warn(
        "[daily:npb-pipeline] --no-stats-text のため stats/text 再取得はスキップし、canonical のみ --force します。\n",
      )
    }
    run(
      "Phase2b canonical 再生成（自動リカバリ・--force）",
      `node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year ${year} --force`,
    )
    if (withYahooPhase10) {
      run(
        "実況テキストから resultSummaryJa 再補完（自動リカバリ後）",
        "npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts",
      )
    }
    run(
      "検証: canonical に打撃データが皆無の試合が残っていないこと（自動リカバリ後・再実行）",
      validateCmd,
    )
  }
}

function main() {
  const args = parseArgs(process.argv)
  const {
    year,
    from,
    to,
    withYahooPhase10,
    build,
    deriveOnly,
    fetchOnly,
    finalizeOnly,
    noStatsText,
    noScoreRaw,
    phase1Limit,
    strictQuality,
    forceCanonical,
    yahooForce,
    skipVsHandValidate,
  } = args

  if (deriveOnly && (fetchOnly || finalizeOnly)) {
    console.error("[daily:npb-pipeline] --derive-only は --fetch-only / --finalize-only と同時に指定できません")
    process.exit(1)
  }
  if (fetchOnly && finalizeOnly) {
    console.error("[daily:npb-pipeline] --fetch-only と --finalize-only は同時に指定できません")
    process.exit(1)
  }

  if (deriveOnly) {
    logProgress("derive-only モード（取得フェーズをスキップ）")
    runDerivedAndRankings({ build, skipVsHandValidate })
    console.log("\n[daily:npb-pipeline] done (derive-only).\n")
    return
  }

  const phase1Extra = phase1Limit ? ` --limit ${phase1Limit}` : ""
  const today = todayJstYmd()
  const finalizeFrom = today
  const finalizeTo = today

  logProgress(
    `本番フロー開始 year=${year} from=${from} to=${to} mode=${fetchOnly ? "fetch-only" : finalizeOnly ? "finalize-only" : "full"} yahooPhase10=${withYahooPhase10} build=${build} forceCanonical=${forceCanonical}`,
  )

  if (!finalizeOnly && (from !== defaultSeasonStart(year) || to !== today)) {
    console.warn(
      "\n[daily:npb-pipeline] 注意: --from/--to は phase0 の取得範囲と score raw の --to-date に使います。" +
        "phase0 は --merge のため season_" +
        year +
        ".json の gameId 一覧は累積されます（狭い範囲で全試合が消えることはありません）。意図した日付か確認してください。\n",
    )
    console.warn(
      "[daily:npb-pipeline] さらに: 派生・ランキングは `_data/scraped_games/canonical/*.json` の「フォルダ内の全試合」を集計します。" +
        "他日の canonical が残っていると、取得が2日分でも数値はシーズン全体になります。2日分だけで揃えたい場合は別途 canonical の整理が必要です。\n",
    )
  }

  if (fetchOnly) {
    console.log(
      "\n[daily:npb-pipeline] --fetch-only: Phase4・strict 検証・派生はスキップします（試合終了後に --finalize-only または watch:daily-pipeline）。\n",
    )
  }

  if (!finalizeOnly) {
    run(
      "Phase0 日程スナップショット + インデックス（--merge で gameId を累積。狭い from/to でも全試合一覧を消さない）",
      `npx tsx scripts/phase0_fetch_sportsnavi_schedule.ts --year ${year} --from ${from} --to ${to} --merge`,
    )
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline",
      `Phase0 完了 (from=${from} to=${to})。運用: 休養日・振替・交流戦のあとに Phase0 を回したら、_data/sportsnavi_schedule_snapshots/by_date/ の当該日は試合数 0〜6 件か目視で確認してください。`,
    )
    logProgress("Phase0 後チェック: by_date の試合数は 0〜6 が通常（詳細は _data/scraped_games/_meta/pipeline_bulk.log）")

    run("Phase1 試合ページ raw（トップ）", `node scripts/phase1_fetch_sportsnavi_games.mjs --year ${year}${phase1Extra}`)
    runPhase2FetchBlock({ year, from, to, noStatsText, noScoreRaw, phase1Limit, phase1Extra })
    runPhase2bCanonical({ year, from, to, forceCanonical })
  } else {
    logProgress("finalize-only: 当日の日程更新と再取得から開始")
    run(
      "Phase0 当日日程のみ（--merge）",
      `npx tsx scripts/phase0_fetch_sportsnavi_schedule.ts --year ${year} --from ${finalizeFrom} --to ${finalizeTo} --merge`,
    )
    runPhase2FetchBlock({
      year,
      from: finalizeFrom,
      to: finalizeTo,
      noStatsText,
      noScoreRaw,
      phase1Limit,
      phase1Extra,
    })
    runPhase2bCanonical({
      year,
      from: finalizeFrom,
      to: finalizeTo,
      forceCanonical: forceCanonical || true,
    })
  }

  if (!fetchOnly) {
    runPhase4AndBackfill({ year, from: finalizeOnly ? finalizeFrom : from, to: finalizeOnly ? finalizeTo : to, withYahooPhase10, yahooForce, strictQuality })
    runStrictCanonicalValidation({
      year,
      noStatsText,
      phase1Extra,
      withYahooPhase10,
      strictQuality,
    })
    runDerivedAndRankings({ build, skipVsHandValidate })

    if (build) {
      console.log("\n[daily:npb-pipeline] 本番ビルド（`npm run build:clean`）まで完了しました。`npm run start` で確認できます。\n")
    } else {
      console.log(
        "\n[daily:npb-pipeline] `--no-build` のため Next ビルドはスキップしました。静的反映は `npm run build:clean`、または `--no-build` を外して再実行してください。\n",
      )
    }
  } else {
    appendPipelineBulkLog(root, "daily:npb-pipeline", `fetch-only 完了 (from=${from} to=${to})。続きは全試合終了後に --finalize-only`)
    console.log(
      "\n[daily:npb-pipeline] fetch-only 完了。当日の試合中カードは raw が未充足のまま残り得ます。" +
        "全試合終了後に `npm run daily:npb-pipeline:finalize` または `npm run watch:daily-pipeline` を実行してください。\n",
    )
  }

  logProgress("全ステップ完了")
  console.log("[daily:npb-pipeline] 完了。\n")
}

main()
