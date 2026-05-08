/**
 * 日次一括: スポナビ日程 → 試合raw（トップ・出場成績・テキスト）→ canonical → 派生 → ランキングJSON
 *
 * 既存の phase5 より一段多く、phase2:sportsnavi:stats-text を含める（出場成績・テキスト速報）。
 * 派生計算（打席・球種・ゾーン・カウント等）に必要な plateAppearances / pitchEvents は Yahoo 一球速報由来のため、
 *   **既定で Phase4 一球パイプライン（欠けている phase10 derived のみ復元）を実行する**。速さ優先なら --skip-yahoo-phase10。
 * Phase10 マージ直後、**実況テキストから resultSummaryJa を再補完**する（新しい実況表記は `inferResultSummaryJaFromSportsnaviPlayLineText` で拾う）。
 *
 * 注意: phase0 は **--merge** で season_YYYY.json を累積（狭い from/to でも gameId 一覧を消さない）。
 *       派生・ランキングは canonical フォルダ内の全試合を集計する点は従来どおり。
 *
 * 使い方:
 *   node scripts/run_daily_npb_pipeline.mjs
 *   node scripts/run_daily_npb_pipeline.mjs --year 2026
 *   node scripts/run_daily_npb_pipeline.mjs --from 2026-04-01 --to 2026-04-19
 *   node scripts/run_daily_npb_pipeline.mjs --skip-yahoo-phase10
 *   node scripts/run_daily_npb_pipeline.mjs --build
 *   node scripts/run_daily_npb_pipeline.mjs --derive-only
 *   node scripts/run_daily_npb_pipeline.mjs --no-score-raw
 *   node scripts/run_daily_npb_pipeline.mjs --no-strict-quality
 *     … canonical に打撃ゼロの試合検証をスキップして派生まで進める（非推奨）
 *   node scripts/run_daily_npb_pipeline.mjs --from 2026-05-01 --force-canonical
 *     … Phase2b で既存 canonical も上書き（空シェル再生成・5月以降の埋め直し向け）
 *   node scripts/run_daily_npb_pipeline.mjs --yahoo-force
 *     … Phase4 に --force（一球 phase10 の再準備・再取得寄り。マージ漏れ・古いキャッシュ対策。時間がかかる）
 *   node scripts/run_daily_npb_pipeline.mjs --complete
 *     … --force-canonical + --yahoo-force（raw 更新後の canonical 再生成＋一球の取り直しまで一括。初回復旧・月次メンテ向け）
 *
 * npm:
 *   npm run daily:npb-pipeline
 *   npm run daily:npb-pipeline:complete
 */

import { execSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

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
    noStatsText: false,
    noScoreRaw: false,
    phase1Limit: "",
    /** canonical に battingLines も plateAppearances も無い試合があれば止める */
    strictQuality: true,
    /** Phase2b に --force を付け、既存 canonical を raw から再生成する */
    forceCanonical: false,
    /** Phase4 一球パイプラインに --force（phase10 準備・取得の再実行寄り） */
    yahooForce: false,
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
    } else if (a === "--derive-only") {
      out.deriveOnly = true
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
    }
  }
  if (!out.from) out.from = defaultSeasonStart(out.year)
  if (!out.to) out.to = todayJstYmd()
  return out
}

function run(label, command) {
  console.log(`\n========== ${label} ==========\n${command}\n`)
  execSync(command, { stdio: "inherit", cwd: root, shell: true })
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
    noStatsText,
    noScoreRaw,
    phase1Limit,
    strictQuality,
    forceCanonical,
    yahooForce,
  } = args

  if (deriveOnly) {
    run("派生（fetch スキップ）", "npm run phase3:derived:2026")
    // Phase 25 で phase15b の機能は loadVsHandRowsFromCanonicalWithDebug → phase15 に統合済み（DEPRECATED）。
    run("ランキング JSON", "npm run rankings:rebuild")
    // Phase 26/27 以降、`negativeDeltaGames > 0` は過剰計上を吸収した正常経路。
    // デフォルトの validate（exit 0/1 は P0 mismatch と missingSplits のみ）を使う。
    run("検証: phase11 vs vs_hand P0", "npm run validate:vs-hand-vs-phase11")
    if (build) run("本番ビルド（検証付き）", "npm run build")
    console.log("\n[daily:npb-pipeline] done (derive-only).\n")
    return
  }

  if (from !== defaultSeasonStart(year) || to !== todayJstYmd()) {
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

  run(
    "Phase0 日程スナップショット + インデックス（--merge で gameId を累積。狭い from/to でも全試合一覧を消さない）",
    `npx tsx scripts/phase0_fetch_sportsnavi_schedule.ts --year ${year} --from ${from} --to ${to} --merge`,
  )

  const phase1Extra = phase1Limit ? ` --limit ${phase1Limit}` : ""
  run("Phase1 試合ページ raw（トップ）", `node scripts/phase1_fetch_sportsnavi_games.mjs --year ${year}${phase1Extra}`)

  if (!noStatsText) {
    run(
      "Phase2a 出場成績・テキスト速報 raw",
      `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year}${phase1Extra}`,
    )
    if (!noScoreRaw) {
      const scoreLim = phase1Limit ? ` --limit ${phase1Limit}` : ""
      run(
        "Phase2a-b 一球速報 score?index= raw（全打席・テキストと同じインデックス・to まで）",
        `python scripts/fetch_sportsnavi_score_raw_snapshot.py --year ${year} --sleep 1.2 --to-date ${to}${scoreLim}`,
      )
    } else {
      console.log(
        "\n[daily:npb-pipeline] --no-score-raw: raw_sportsnavi_score をスキップ（Phase10 は従来どおりネット取得または既存キャッシュ）\n",
      )
    }
  } else {
    console.log("\n[daily:npb-pipeline] --no-stats-text: 出場成績・テキスト raw をスキップ（canonical が薄くなり得ます）\n")
  }

  const phase2bForce = forceCanonical ? " --force" : ""
  run(
    "Phase2b canonical 生成",
    `node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year ${year}${phase2bForce}`,
  )

  if (withYahooPhase10) {
    const phase4Force = yahooForce ? " --force" : ""
    run(
      "Yahoo 一球速報ログ復元 + canonical マージ" +
        (yahooForce ? "（`--force`: phase10 再準備・取得寄り・所要時間増）" : "（欠損試合のみ復元・既定は `--force` なし）"),
      `node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year ${year} --to-date ${to} --sleep 1.2${phase4Force}`,
    )
    run(
      "実況テキストから resultSummaryJa 再補完（マージ直後・変更が無ければ 0 file）",
      "npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts",
    )
  } else {
    if (yahooForce) {
      console.warn(
        "\n[daily:npb-pipeline] --yahoo-force / --complete を指定しましたが --skip-yahoo-phase10 のため Phase4 はスキップされました。\n",
      )
    }
    console.log(
      "\n[daily:npb-pipeline] --skip-yahoo-phase10: 一球を取り込まないため、canonical の plateAppearances / pitchEvents が空のままになり、球種・ゾーン・詳細集計が弱くなります。\n",
    )
  }

  if (strictQuality) {
    run(
      "検証: canonical に打撃データが皆無の試合が残っていないこと（空だと個人打率が歪む）",
      `npx tsx scripts/validate_phase2_canonical_nonempty.ts --year ${year} --fail`,
    )
  } else {
    console.log(
      "\n[daily:npb-pipeline] --no-strict-quality: validate_phase2_canonical_nonempty をスキップします（空 canonical が残り得ます）。\n",
    )
  }

  run(
    "派生（個人ページ用・先頭で enrich:text-play-headlines＝全プレー一球見出しを常時マージ）",
    "npm run phase3:derived:2026",
  )
  // Phase 25 で phase15b の機能は loadVsHandRowsFromCanonicalWithDebug → phase15 に統合済み（DEPRECATED）。
  run("ランキング JSON", "npm run rankings:rebuild")
  // Phase 26/27 以降、`negativeDeltaGames > 0` は過剰計上を吸収した正常経路。
  // デフォルトの validate（exit 0/1 は P0 mismatch と missingSplits のみ）を使う。
  run("検証: phase11 vs vs_hand P0", "npm run validate:vs-hand-vs-phase11")

  if (build) {
    run("本番ビルド（validate:bridge 等のあと next build）", "npm run build")
  } else {
    console.log("\n[daily:npb-pipeline] 開発表示: `npm run dev` で確認。静的反映は `npm run daily:npb-pipeline -- --build`。\n")
  }

  console.log("[daily:npb-pipeline] 完了。\n")
}

main()
