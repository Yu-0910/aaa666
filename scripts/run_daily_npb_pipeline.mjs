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
 *   Phase4 直後の diag:pitch-by-pitch-coverage:fail は strictQuality 既定で **失敗時にパイプライン停止**（日付範囲付き）。
 * 派生ブロック: phase7 直後に pitcher season pitch types（個人ページ「投球データ」表）。
 * 派生ブロック末尾: Phase12/19 → Phase28（週間）→ Phase29（順位表）→ top-leaders / top-weekly-leaders（トップの指標名・上位選手・数値）。`rankings:rebuild` と同順。
 * 投手 PoC（phase:pitcher-poc1）: カウント別は phase16 と同じ最終球直前 B-S、球種は巡目別/カウント別とも by*PitchTypes ＋対左右 VsL/VsR、球場別は Phase0 日程、巡目別 ER は一球テキスト、
 *   ホーム/ビジター別は scoreboard 先攻/後攻（空なら試合前情報補完）、
 *   デー/ナイター別は raw_sportsnavi 開始時刻（yahoo_game_meta 補完）、
 *   対チーム別は scoreboard 補完済み canonical の対戦相手名 × pitchingLines、
 *   捕手別は phase6（poc1 直後・実守備捕手で打席振分・pitchingLines は BF 最大の実守備捕手に ip/er 合算）。
 *   捕手の先発/勝敗/QS（phase25）・巡目別球種（phase26）・防御率等（phase23）はいずれも実守備捕手帰属。
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
 * 状況別打撃成績（Phase15 `base_sit`）:
 *   - 塁分類: 一球速報 score の打撃確定スナップ `resultBallClass`（スポナビ準拠）。
 *   - 打点: 同一スナップ `#result` の「＋N点」`resultBallRbi`。
 *   - 打席結果: 出場成績末尾列（`appearance_only`）。再生成: `npm run phase15:rebuild:batting-splits`。
 *
 * 盗塁（SB）・盗塁死（CS）:
 *   - Phase11（appearance_slots）の SB は出場成績 `battingLines.sb`。末尾スロットが無い代走のみ試合でも加算する。
 *   - CS は Phase4 マージ後の `domain.runnerEvents`（**一球 score 記録文のみ**・`sourceTier: score`）のみ。
 *   - Phase11 直後に `verify:cs-runner-events-appearance-slots`（CS=score / 代走のみ SB 退行検証）。
 *   詳細: `docs/data_operation_rules.md` §盗塁死
 *
 * 所要時間短縮・復旧（2026-06）:
 *   - Phase2a-b（score raw）完了後に Phase4 前ゲート（未完了なら停止・ネット取得地獄を防ぐ）。
 *   - ゲート NG 時は未完了試合だけ score raw を **1回自動再取得**して再ゲート（`TOPPAGE_SCORE_RAW_GATE_NO_RETRY=1` で無効化）。
 *   - phase19 前に `roster:fetch-npb-en` を実行。romanName 不足で失敗したら名簿再取得＋phase19 を1回再試行。
 *   - `--derive-only` 開始時に Phase4 スキップの警告を表示（ゲート通過後の誤用防止）。
 *   - Phase10 restore はキャッシュ命中時 sleep しない（score-raw と同規則）。
 *   - Phase2a-repair は `--from`/`--to` の日付範囲内だけスキャン（シーズン全体の再取得を避ける）。
 *   - 各ステップの所要時間を `pipeline_bulk.log` に記録。
 *   - Phase4: 試合中止/ノーゲームは restore・merge をスキップ（score raw ゲートと同様。打席 0 でパイプライン停止しない）。
 *
 * 運用メモ（取得・一括生成の目安）:
 *   1. Phase0 後: `by_date` の試合数は **1日 0〜6 件**が通常。それ以外は異常の可能性（Phase0 は >6 件で前回スナップショット維持＋ `pipeline_bulk.log`）。
 *   2. Phase2a-repair（`--only-incomplete`）は日次で必ず実行（CSR 空テーブル対策）。日次は from/to 付きで範囲限定。
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
 *     … 20:30 先行取得（Phase0〜2b。Phase4・派生なし。未来日程ベースの予想投手 JSON は更新）
 *   node scripts/run_daily_npb_pipeline.mjs --finalize-only
 *     … 全試合終了後の続き（既定は当日。過去日は --from/--to も指定）
 *   node scripts/run_daily_npb_pipeline.mjs --finalize-only --from 2026-06-21 --to 2026-06-21
 *     … 指定日の続き（Phase4・派生）
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
 *   node scripts/run_daily_npb_pipeline.mjs --skip-score-raw-gate
 *     … Phase4 前の score raw 完了ゲートをスキップ（非推奨）
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
  /** phase2_fetch 内 canonical 再生成失敗時に日次パイプラインを止める（fetch_and_display_day も継承） */
  TOPPAGE_STRICT_PHASE2_CANONICAL_REBUILD:
    process.env.TOPPAGE_STRICT_PHASE2_CANONICAL_REBUILD ?? "1",
}

/** @type {string} run() 直前のステップ名（異常終了時の pipeline_bulk.log 用） */
let lastPipelineStepLabel = ""

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
    /** Phase4 前の score raw 完了ゲートをスキップ（非推奨・遅いルートに入り得る） */
    skipScoreRawGate: false,
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
    } else if (a === "--skip-score-raw-gate") {
      out.skipScoreRawGate = true
    }
  }
  if (!out.from) out.from = defaultSeasonStart(out.year)
  if (!out.to) out.to = todayJstYmd()
  return out
}

function run(label, command) {
  lastPipelineStepLabel = label
  const startedAt = Date.now()
  logProgress(`→ 開始: ${label}`)
  console.log(`\n========== ${label} ==========\n${command}\n`)
  try {
    execSync(command, { stdio: "inherit", cwd: root, shell: true, env: childEnv })
    const elapsed = Date.now() - startedAt
    const elapsedLabel = formatMs(elapsed)
    logProgress(`← 終了: ${label}（所要 ${elapsedLabel}）`)
    appendPipelineBulkLog(root, "daily:npb-pipeline", `ステップ完了: ${label} 所要=${elapsedLabel}`)
  } catch (e) {
    const elapsed = Date.now() - startedAt
    const code = e && typeof e.status === "number" ? e.status : 1
    const elapsedLabel = formatMs(elapsed)
    logProgress(`← 失敗: ${label}（所要 ${elapsedLabel}） exit=${code}`)
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline",
      `ステップ失敗: ${label} 所要=${elapsedLabel} exit=${code}`,
    )
    throw e
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
    const elapsedLabel = formatMs(elapsed)
    logProgress(`← 終了: ${label}（所要 ${elapsedLabel}）`)
    appendPipelineBulkLog(root, "daily:npb-pipeline", `ステップ完了(try): ${label} 所要=${elapsedLabel}`)
    return true
  } catch (e) {
    const elapsed = Date.now() - startedAt
    const code = e && typeof e.status === "number" ? e.status : 1
    const elapsedLabel = formatMs(elapsed)
    logProgress(`← 失敗: ${label}（所要 ${elapsedLabel}） exit=${code}`)
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline",
      `ステップ失敗(try): ${label} 所要=${elapsedLabel} exit=${code}`,
    )
    return false
  }
}

function runDerivedAndRankings({ build, skipVsHandValidate }) {
  logProgress("派生・ランキングブロック開始（各 npm が順に実行されます）")
  // `npm run phase3:derived:2026` は 1 コマンドで長く見えるため、
  // ここで分解して「どこが長いか」をターミナル上で追えるようにする。
  run("派生: enrich:text-play-headlines", "npm run enrich:text-play-headlines")
  run("派生: phase:pitcher-poc1", "npm run phase:pitcher-poc1")
  run(
    "派生: phase6 pitcher-catcher splits（実守備捕手で byCatcher 付与）",
    "npm run phase6:build:pitcher-catcher-splits",
  )
  run("派生: phase11 batting", "npm run phase11:build:batting")
  run(
    "検証: 出場成績 打数列 vs 末尾スロット（不一致ならここで停止）",
    "npm run validate:appearance-slots-vs-line-ab:fail",
  )
  run(
    "検証: appearance_slots の CS（score のみ）と代走のみ SB",
    "npm run verify:cs-runner-events-appearance-slots",
  )
  run("派生: phase13 context", "npm run phase13:build:context")
  run(
    "検証: phase13 対チーム vs Phase11 SSOT（不一致ならここで停止）",
    "npm run validate:phase13-context-vs-phase11:fail",
  )
  run("派生: phase14 pitch", "npm run phase14:build:pitch")
  run(
    "派生: phase15 batting splits（base_sit=resultBallClass/resultBallRbi）",
    "npm run phase15:build:batting-splits",
  )
  run("派生: phase16 batting count", "npm run phase16:build:batting-count")
  run("派生: phase17 period", "npm run phase17:build:period")
  run("派生: phase7 pitcher period", "npm run phase7:build:pitcher-period")
  run(
    "派生: pitcher season pitch types（投球データ表・空振り率=空振り÷投球数・登板試合と同期）",
    "npm run phase25:build:pitcher-season-pitch-types",
  )
  run("派生: phase22 catcher appearances", "npm run phase22:build:catcher-appearances")
  run(
    "派生: phase23 catcher-pitcher splits（phase6 実守備捕手ベース）",
    "npm run phase23:build:catcher-pitcher-splits",
  )
  run(
    "派生: phase24 catcher defense basic（CS・PB/9 分子・GO/AO 等・実守備捕手帰属）",
    "npm run phase24:build:catcher-defense-basic",
  )
  run("検証: phase24 実守備捕手帰属", "npm run validate:catcher-defense-active:2026")
  run(
    "派生: phase25 catcher starting summary（BF 最大の実守備捕手）",
    "npm run phase25:build:catcher-starting-summary",
  )
  run(
    "派生: phase26 catcher pa round pitch types（打席ごと実守備捕手）",
    "npm run phase26:build:catcher-pa-round-pitch-types",
  )
  run("派生: phase20 pitcher zones", "npm run phase20:build:pitcher-zones")
  run(
    "派生: phase30 player matchup（対戦成績タブ・選手×相手選手）",
    "npm run phase30:build:player-matchup",
  )
  run(
    "検証: phase31 対戦成績 vs Phase11（不一致ならここで停止）",
    "npm run validate:phase31-matchup-vs-phase11:fail",
  )
  run(
    "トップ表示: 予想投手（三連戦カード + SN + 対戦成績 OPS top3）",
    "npm run phase36:build:top-probables",
  )
  run(
    "派生: phase33 batter vs team count pitch types（野手球団別配球タブ）",
    "npm run phase33:build:batter-vs-team-count-pitch-types",
  )
  run(
    "検証: phase34 球団別配球 vs Phase14（不一致ならここで停止）",
    "npm run validate:phase34-batter-vs-team-pitch-vs-phase14:fail",
  )
  run("派生: build yahoo npb full index", "npm run build:yahoo-npb-full-index")

  run("ランキング JSON: phase12 batting rankings", "npm run phase12:build:rankings")
  runPhase19PitchingRankingsWithRosterRefresh()
  run("ランキング JSON: phase28 weekly rankings", "npm run phase28:build:weekly-rankings")
  run("ランキング JSON: phase29 team standings", "npm run phase29:build:standings")
  run(
    "検証: phase29 team standings（不一致ならここで停止）",
    "npm run validate:team-standings:2026:fail",
  )
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
    const repairDate =
      from && to ? ` --from ${from} --to ${to}` : from ? ` --from ${from}` : to ? ` --to ${to}` : ""
    run(
      "Phase2a-repair 不完全な stats/text のみ再取得（--only-incomplete・日付範囲内）",
      `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --only-incomplete${repairDate}${phase1Extra}`,
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

function scoreRawGateDateArgs(from, to) {
  if (from && to) return ` --from-date ${from} --to-date ${to}`
  if (from) return ` --from-date ${from}`
  if (to) return ` --to-date ${to}`
  return ""
}

/** @returns {{ ok: boolean; incompleteIds: string[] }} */
/** @param {string} combined @returns {{ gameId: string; reason: string }[]} */
function parseGateIncompleteDetails(combined) {
  const details = []
  for (const line of combined.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*(\d+):\s*(\S+)\s*$/)
    if (m) details.push({ gameId: m[1], reason: m[2] })
  }
  return details
}

/** @returns {{ ok: true } | { ok: false; incompleteIds: string[]; incompleteDetails: { gameId: string; reason: string }[]; scoreRawRetryableIds: string[]; statsTextRetryableIds: string[]; scriptError: boolean; gateNg: boolean }} */
function checkScoreRawGate({ year, from, to }) {
  const dateArgs = scoreRawGateDateArgs(from, to)
  const cmd =
    `python -u scripts/gate_score_raw_complete_for_pipeline.py --year ${year}${dateArgs}` +
    " --fail --emit-incomplete-csv"
  try {
    const out = execSync(cmd, { cwd: root, encoding: "utf8", env: childEnv })
    if (out) process.stdout.write(out)
    return { ok: true }
  } catch (e) {
    const stdout = String(e.stdout || "")
    const stderr = String(e.stderr || "")
    if (stderr) process.stderr.write(stderr)
    if (stdout) process.stdout.write(stdout)
    const combined = `${stdout}\n${stderr}`
    const m = combined.match(/SCORE_RAW_GATE_INCOMPLETE_CSV=([^\r\n]+)/)
    const incompleteIds = m
      ? m[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    const scriptError =
      /Traceback \(most recent call last\)|\b(Syntax|Type|Attribute|Name|Import)Error:/.test(combined)
    const gateNg = /\[score-raw-gate\] NG:/.test(combined)
    const incompleteDetails = parseGateIncompleteDetails(combined)
    const scoreRawRetryableIds = incompleteDetails
      .filter((d) => d.reason === "score_raw_incomplete")
      .map((d) => d.gameId)
    const statsTextRetryableIds = incompleteDetails
      .filter((d) => d.reason === "no_plate_appearances" || d.reason === "missing_text_raw")
      .map((d) => d.gameId)
    const asyncShellIds = incompleteDetails
      .filter((d) => d.reason === "async_shell_no_live_text")
      .map((d) => d.gameId)
    return {
      ok: false,
      incompleteIds,
      incompleteDetails,
      scoreRawRetryableIds,
      statsTextRetryableIds,
      asyncShellIds,
      scriptError,
      gateNg,
    }
  }
}

function runRenderedTextRecovery({ year, gameIds }) {
  const gids = gameIds.join(",")
  console.warn(
    `\n[daily:npb-pipeline] JS 空シェルの /text を描画後 HTML に差し替えます: ${gids}\n`,
  )
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline",
    `Playwright rendered text recovery gameIds=${gids}`,
  )
  run(
    "Phase2a-repair rendered text（async shell 復旧）",
    `python scripts/refetch_sportsnavi_text_rendered_playwright.py --year ${year} --game-ids ${gids}`,
  )
}

function runPhase2StatsTextRepair({ year, from, to, gameIds }) {
  const gids = gameIds.join(",")
  const dateScope =
    from && to
      ? ` from=${from} to=${to}`
      : from
        ? ` from=${from}`
        : to
          ? ` to=${to}`
          : ""
  console.warn(
    `\n[daily:npb-pipeline] Phase2 stats/text を再取得します（no_plate_appearances / missing_text_raw）: ${gids}${dateScope}\n`,
  )
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline",
    `Phase2 stats/text 再取得 gameIds=${gids}${dateScope}`,
  )
  run(
    `Phase2a-repair stats/text（未完了試合のみ）`,
    `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --only-incomplete --game-ids ${gids}`,
  )
}

function runPhase19PitchingRankingsWithRosterRefresh() {
  runTry("名簿: NPB 英字名更新（phase19 前）", "npm run roster:fetch-npb-en")
  try {
    run("ランキング JSON: phase19 pitching rankings", "npm run phase19:build:pitching-rankings")
  } catch (e) {
    console.warn(
      "\n[daily:npb-pipeline] phase19 失敗（romanName 不足等）→ 名簿再取得後に phase19 を1回だけ再試行します。\n",
    )
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline",
      "phase19 失敗 → roster 再取得 + phase19 再試行",
    )
    runTry("名簿: NPB 英字名再取得", "npm run roster:fetch-npb-en")
    run("ランキング JSON: phase19 pitching rankings（再試行）", "npm run phase19:build:pitching-rankings")
  }
}

function runScoreRawGate({ year, from, to, noScoreRaw, skipScoreRawGate, yahooForce }) {
  if (noScoreRaw || skipScoreRawGate || yahooForce) {
    if (skipScoreRawGate || yahooForce) {
      console.warn(
        "\n[daily:npb-pipeline] Phase4 前の score raw ゲートをスキップします（Phase4 がネット取得中心になり得ます）。\n",
      )
    }
    return
  }

  const label = "ゲート: score raw 完了確認（未完了なら Phase4 前に停止）"
  const scoreRawRetryDisabled = process.env.TOPPAGE_SCORE_RAW_GATE_NO_RETRY === "1"
  let scoreRawRetryCount = 0
  let statsTextRetryCount = 0

  while (true) {
    lastPipelineStepLabel = label
    const startedAt = Date.now()
    logProgress(
      `→ 開始: ${label}${statsTextRetryCount > 0 || scoreRawRetryCount > 0 ? "（再確認）" : ""}`,
    )
    const result = checkScoreRawGate({ year, from, to })
    const elapsedLabel = formatMs(Date.now() - startedAt)

    if (result.ok) {
      logProgress(`← 終了: ${label}（所要 ${elapsedLabel}）`)
      appendPipelineBulkLog(root, "daily:npb-pipeline", `ステップ完了: ${label} 所要=${elapsedLabel}`)
      return
    }

    if (result.scriptError) {
      logProgress(`← 失敗: ${label}（所要 ${elapsedLabel}） exit=1 — ゲートスクリプト異常`)
      appendPipelineBulkLog(
        root,
        "daily:npb-pipeline",
        `ステップ失敗: ${label} 所要=${elapsedLabel} exit=1 reason=gate_script_error`,
      )
      console.error(
        "\n[daily:npb-pipeline] score raw ゲートがデータ未完了ではなくスクリプト異常で停止しました。\n" +
          "  → scripts/gate_score_raw_complete_for_pipeline.py の Traceback を確認してください。\n" +
          `  → 修正後は node scripts/run_daily_npb_pipeline.mjs --year ${year} --from ${from} --to ${to} --finalize-only で Phase4 以降を続行できます。\n`,
      )
      const err = new Error("score raw gate script error")
      err.status = 1
      throw err
    }

    const canRetryStatsText =
      statsTextRetryCount < 1 && result.statsTextRetryableIds.length > 0
    const canRetryScoreRaw =
      !scoreRawRetryDisabled && scoreRawRetryCount < 1 && result.scoreRawRetryableIds.length > 0

    if (!canRetryStatsText && !canRetryScoreRaw) {
      const incompleteLabel =
        result.incompleteDetails.length > 0
          ? result.incompleteDetails.map((d) => `${d.gameId}:${d.reason}`).join(",")
          : result.incompleteIds.join(",") || (result.gateNg ? "unknown" : "?")
      logProgress(`← 失敗: ${label}（所要 ${elapsedLabel}） exit=1`)
      appendPipelineBulkLog(
        root,
        "daily:npb-pipeline",
        `ステップ失敗: ${label} 所要=${elapsedLabel} exit=1 incomplete=${incompleteLabel}`,
      )
      if (result.asyncShellIds && result.asyncShellIds.length > 0) {
        console.error(
          "\n[daily:npb-pipeline] score/text ページが JS 空シェルのため、Phase2a-repair では直りません。\n" +
            "  → async-inning が描画される取得経路（ブラウザ描画 or 別 API）を追加してください。\n",
        )
      } else if (result.statsTextRetryableIds.length > 0) {
        console.error(
          "\n[daily:npb-pipeline] score raw ゲート NG ですが、原因は stats/text の空取得です。\n" +
            "  → Phase2a-repair を再実行してから finalize を続けてください。\n",
        )
      } else if (result.incompleteIds.length > 0 && result.scoreRawRetryableIds.length === 0) {
        console.error(
          "\n[daily:npb-pipeline] score raw ゲート NG ですが、score ページの再取得では解消できません（テキスト未着・打席未解析）。\n" +
            "  → 試合終了後に node scripts/run_daily_npb_pipeline.mjs --finalize-only --from ... --to ... を再実行してください。\n",
        )
      } else if (!result.gateNg && result.incompleteIds.length === 0) {
        console.error(
          "\n[daily:npb-pipeline] score raw ゲートが不明な理由で失敗しました（未完了試合 ID なし）。\n" +
            "  → gate_score_raw_complete_for_pipeline.py の出力を確認してください。\n",
        )
      }
      const err = new Error("score raw gate failed")
      err.status = 1
      throw err
    }

    if (result.asyncShellIds && result.asyncShellIds.length > 0) {
      runRenderedTextRecovery({ year, gameIds: result.asyncShellIds })
      continue
    }

    if (canRetryStatsText) {
      runPhase2StatsTextRepair({ year, from, to, gameIds: result.statsTextRetryableIds })
      statsTextRetryCount += 1
      continue
    }

    const gids = result.scoreRawRetryableIds.join(",")
    console.warn(
      `\n[daily:npb-pipeline] score raw ゲート NG（score 未完了 ${result.scoreRawRetryableIds.length}試合）` +
        ` → 未完了試合のみ再取得して再ゲートします: ${gids}\n`,
    )
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline",
      `score raw ゲート NG → 自動再取得 gameIds=${gids}`,
    )

    const fromDate = from || to
    const toDate = to || from
    run(
      `score raw 自動再取得（ゲート NG・${result.scoreRawRetryableIds.length}試合）`,
      `python -u scripts/fetch_sportsnavi_score_raw_snapshot.py --year ${year}` +
        ` --from-date ${fromDate} --to-date ${toDate} --game-ids ${gids} --sleep 1.2`,
    )
    scoreRawRetryCount += 1
  }
}

function runPhase4AndBackfill({
  year,
  from,
  to,
  withYahooPhase10,
  yahooForce,
  strictQuality,
  noScoreRaw,
  skipScoreRawGate,
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
  runScoreRawGate({ year, from, to, noScoreRaw, skipScoreRawGate, yahooForce })
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
    const dateScope =
      from && to
        ? ` --from-date ${from} --to-date ${to}`
        : from
          ? ` --from-date ${from}`
          : to
            ? ` --to-date ${to}`
            : ""
    run(
      "検証: score HTML あり & pitchRows 空 / derived 未マージが残っていないこと（中止除く・NG ならパイプライン停止）",
      "node scripts/diag_pitch_by_pitch_coverage_all_games.mjs --year " + year + dateScope + " --fail",
    )
  }
}

function runStrictCanonicalValidation({
  year,
  from,
  to,
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
      const repairDate =
        from && to ? ` --from ${from} --to ${to}` : from ? ` --from ${from}` : to ? ` --to ${to}` : ""
      run(
        "Phase2a-repair（自動リカバリ）不完全な stats/text のみ再取得",
        `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --only-incomplete${repairDate}${phase1Extra}`,
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
    skipScoreRawGate,
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
    console.warn(
      "\n[daily:npb-pipeline] 注意: --derive-only は Phase4（一球マージ）を実行しません。" +
        "当日試合の表示 OK や phase10=restored_phase10 には Phase4 完了が必要です。" +
        "ゲート通過後・取得済みの復旧は `npm run daily:npb-pipeline:finalize` を使い、derive-only は Phase4 完了後の派生やり直し専用です。\n",
    )
    appendPipelineBulkLog(root, "daily:npb-pipeline", "derive-only 開始")
    try {
      runDerivedAndRankings({ build, skipVsHandValidate })
      appendPipelineBulkLog(root, "daily:npb-pipeline", "derive-only 完了 exit=0")
      console.log("\n[daily:npb-pipeline] done (derive-only).\n")
    } catch (e) {
      const code = e && typeof e.status === "number" ? e.status : 1
      appendPipelineBulkLog(
        root,
        "daily:npb-pipeline",
        `derive-only 異常終了 exit=${code} lastStep=${lastPipelineStepLabel || "?"}`,
      )
      throw e
    }
    return
  }

  const phase1Extra = phase1Limit ? ` --limit ${phase1Limit}` : ""
  const today = todayJstYmd()
  // finalize-only 既定は当日のみ。--from/--to で狭い範囲が指定されていればその日付を使う。
  const finalizeRangeExplicit =
    finalizeOnly && (from !== defaultSeasonStart(year) || to !== today)
  const finalizeFrom = finalizeOnly ? (finalizeRangeExplicit ? from : today) : from
  const finalizeTo = finalizeOnly ? (finalizeRangeExplicit ? to : today) : to

  const modeLabel = fetchOnly ? "fetch-only" : finalizeOnly ? "finalize-only" : "full"
  logProgress(
    `本番フロー開始 year=${year} from=${from} to=${to} mode=${modeLabel} yahooPhase10=${withYahooPhase10} build=${build} forceCanonical=${forceCanonical}`,
  )
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline",
    `開始 year=${year} from=${from} to=${to} mode=${modeLabel}`,
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
      "\n[daily:npb-pipeline] --fetch-only: Phase4・strict 検証・派生はスキップします（予想投手 JSON は未来日程から更新）。試合終了後は --finalize-only または watch:daily-pipeline を実行してください。\n",
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

    run(
      "Phase0 未来日程（今日+14日・三連戦検出用）",
      `npx tsx scripts/phase0_fetch_schedule_ahead.ts --year ${year}`,
    )

    run("Phase1 試合ページ raw（トップ）", `node scripts/phase1_fetch_sportsnavi_games.mjs --year ${year}${phase1Extra}`)
    runPhase2FetchBlock({ year, from, to, noStatsText, noScoreRaw, phase1Limit, phase1Extra })
    runPhase2bCanonical({ year, from, to, forceCanonical })
  } else {
    logProgress(
      `finalize-only: 日程更新と再取得から開始（from=${finalizeFrom} to=${finalizeTo}）`,
    )
    run(
      "Phase0 日程（--merge）",
      `npx tsx scripts/phase0_fetch_sportsnavi_schedule.ts --year ${year} --from ${finalizeFrom} --to ${finalizeTo} --merge`,
    )
    run(
      "Phase0 未来日程（今日+14日・三連戦検出用）",
      `npx tsx scripts/phase0_fetch_schedule_ahead.ts --year ${year}`,
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
    runPhase4AndBackfill({
      year,
      from: finalizeOnly ? finalizeFrom : from,
      to: finalizeOnly ? finalizeTo : to,
      withYahooPhase10,
      yahooForce,
      strictQuality,
      noScoreRaw,
      skipScoreRawGate,
    })
    runStrictCanonicalValidation({
      year,
      from: finalizeOnly ? finalizeFrom : from,
      to: finalizeOnly ? finalizeTo : to,
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
    run(
      "トップ表示: 予想投手（fetch-only 先行更新・未来日程ベース）",
      "npm run phase36:build:top-probables",
    )
    appendPipelineBulkLog(root, "daily:npb-pipeline", `fetch-only 完了 (from=${from} to=${to})。続きは全試合終了後に --finalize-only`)
    console.log(
      "\n[daily:npb-pipeline] fetch-only 完了。予想投手タブ用の future snapshot は更新済みです。" +
        "当日の試合中カードは raw が未充足のまま残り得ます。" +
        "全試合終了後に `npm run daily:npb-pipeline:finalize` または `npm run watch:daily-pipeline` を実行してください。\n",
    )
  }

  logProgress("全ステップ完了")
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline",
    `完了 exit=0 (from=${from} to=${to} mode=${modeLabel})`,
  )
  console.log("[daily:npb-pipeline] 完了。\n")
}

try {
  main()
} catch (e) {
  const code = e && typeof e.status === "number" ? e.status : 1
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline",
    `異常終了 exit=${code} lastStep=${lastPipelineStepLabel || "?"}`,
  )
  process.exit(code)
}
