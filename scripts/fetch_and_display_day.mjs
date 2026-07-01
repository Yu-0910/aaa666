/**
 * 指定日を日次一括で取得し、派生・TOP表示JSONまで更新したうえでターミナル表示する。
 * 途中経過をタイムスタンプ付きでターミナルに出力する。
 *
 *   npm run day:fetch-display -- 2026-05-31
 *   npm run day:fetch-display
 *   npm run day:fetch-display -- 2026-06-06 --display-only
 *     … パイプラインは実行せず表示＋サマリーのみ（finalize 完了後の確認用）
 */

import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { isSportsnaviMainGameCancelled } from "../lib/yahooGame/sportsnaviStatsTextParse.mjs"
import { isScheduleCancelledGame } from "../lib/yahooGame/sportsnaviScheduleStatus.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const PIPELINE_LOG = path.join(root, "_data", "scraped_games", "_meta", "pipeline_bulk.log")
const HEARTBEAT_SEC = Number(process.env.TOPPAGE_DAY_FETCH_HEARTBEAT_SEC || 45)

const childEnv = {
  ...process.env,
  YAHOO_SCRAPE_ENABLED: process.env.YAHOO_SCRAPE_ENABLED ?? "1",
  PYTHONUNBUFFERED: "1",
  TOPPAGE_PLATE_RESULT_SOURCE: process.env.TOPPAGE_PLATE_RESULT_SOURCE ?? "appearance_only",
  TOPPAGE_BATTING_SEASON_AGG: process.env.TOPPAGE_BATTING_SEASON_AGG ?? "appearance_slots",
  TOPPAGE_STRICT_PHASE2_CANONICAL_REBUILD:
    process.env.TOPPAGE_STRICT_PHASE2_CANONICAL_REBUILD ?? "1",
}

/** @param {string} gameId */
function isCancelledGame(gameId, year) {
  const scheduleCancelled = isScheduleCancelledGame(root, year, gameId)
  if (scheduleCancelled === true) return true
  if (scheduleCancelled === false) return false

  const paths = [
    path.join(root, "_data", "scraped_games", "raw_sportsnavi", `${gameId}.html`),
    path.join(root, "_data", "scraped_games", "raw_sportsnavi_text", `${gameId}.html`),
  ]
  for (const p of paths) {
    if (!fs.existsSync(p)) continue
    try {
      if (isSportsnaviMainGameCancelled(fs.readFileSync(p, "utf8"), gameId)) return true
    } catch {
      // keep checking the other raw source
    }
  }
  return false
}

function readCurrentWeeklyTopLeadersWeek(year) {
  const p = path.join(root, "public", "data", "rankings", "weekly", year, "current-week.json")
  if (!fs.existsSync(p)) return ""
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"))
    return String(j?.weekKey || "").trim()
  } catch {
    return ""
  }
}

function currentWeeklyTopLeadersPath(year, league, category) {
  const weekKey = readCurrentWeeklyTopLeadersWeek(year)
  if (!weekKey) return ""
  return path.join(root, "public", "data", "top-leaders", "weekly", year, weekKey, league, `${category}.json`)
}

/** @type {{ level: "ERROR" | "WARN"; where: string; message: string; hint?: string }[]} */
const issues = []

let stepNo = 0
const TOTAL_STEPS = 4

function nowLocal() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
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

function logProgress(message, sub) {
  const tag = sub != null ? `#${stepNo}.${sub}` : `#${stepNo}`
  console.log(`[day:fetch-display] [${nowLocal()}] ${tag} ${message}`)
}

function printPlan(date, displayOnly) {
  console.log("\n[実行計画]")
  if (displayOnly) {
    console.log(`  表示のみモード（${date}）`)
    console.log("  1/2 当日試合の表示（1試合ずつ）")
    console.log("  2/2 結果サマリー")
    console.log("")
    return
  }
  console.log(`  1/4 日程確認・必要なら Phase0（${date}）`)
  console.log("  2/4 日次一括（Phase0〜4・派生・ランキング・TOP表示JSON）※子プロセスのログも表示")
  console.log("  3/4 当日試合の表示（1試合ずつ）")
  console.log("  4/4 結果サマリー")
  console.log(`  （長時間処理中は ${HEARTBEAT_SEC} 秒ごとに経過秒を表示）\n`)
}

function todayJstYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function parseArgs(argv) {
  let date = ""
  let displayOnly = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--date" && argv[i + 1]) date = String(argv[++i]).trim()
    else if (a === "--display-only") displayOnly = true
    else if (/^\d{4}-\d{2}-\d{2}$/.test(a)) date = a
  }
  if (!date) date = todayJstYmd()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("[day:fetch-display] 日付は YYYY-MM-DD で指定してください")
    process.exit(1)
  }
  return { date, year: date.slice(0, 4), displayOnly }
}

/**
 * @param {string[]} logTail
 * @returns {"score_gate"|"score_gate_script_error"|"phase19"|"derive_only"|"phase4_pending"|"generic"}
 */
function detectPipelineFailureKind(logTail) {
  const text = logTail.join("\n")
  if (/ステップ失敗: ゲート: score raw/.test(text)) {
    if (/reason=gate_script_error|ゲートスクリプト異常|incomplete=\?/.test(text)) {
      return "score_gate_script_error"
    }
    return "score_gate"
  }
  if (/ステップ失敗: ランキング JSON: phase19 pitching rankings/.test(text)) return "phase19"
  if (/derive-only 異常終了/.test(text)) return "derive_only"
  if (
    /ステップ失敗: ゲート: score raw/.test(text) === false &&
    !/ステップ完了: Yahoo 一球速報ログ復元/.test(text) &&
    /mode=full/.test(text)
  ) {
    return "phase4_pending"
  }
  return "generic"
}

function finalizeOnlyCommand(year, date) {
  return `node scripts/run_daily_npb_pipeline.mjs --year ${year} --from ${date} --to ${date} --finalize-only`
}

function printNextSteps({ date, year, pipelineOk, displayResult, logTail }) {
  console.log("\n[次の一手]")
  if (!pipelineOk) {
    const kind = detectPipelineFailureKind(logTail)
    console.log("  1. pipeline_bulk.log の「ステップ失敗」「異常終了」行で止まった Phase を確認")
    if (kind === "score_gate_script_error") {
      console.log(
        "  2. score raw ゲート **スクリプト異常**（データ未完了ではない）→ gate スクリプトを修正後:",
      )
      console.log(`     ${finalizeOnlyCommand(year, date)}`)
      console.log("     ※ score raw は取得済みのことが多い。全取得のやり直しは不要")
    } else if (kind === "score_gate") {
      console.log(
        "  2. score raw ゲート NG（score 未完了）→ パイプラインは未完了試合の再取得を1回自動試行します。手動なら:",
      )
      console.log(`     ${finalizeOnlyCommand(year, date)}`)
      console.log("     ※ derive-only は Phase4 をスキップするため使わない")
    } else if (kind === "phase19") {
      console.log("  2. phase19（romanName 不足）→ 名簿更新後にランキング以降を再実行:")
      console.log("     npm run roster:fetch-npb-en")
      console.log(
        "     npm run phase19:build:pitching-rankings && npm run phase28:build:weekly-rankings && npm run top-leaders:build:2026 && npm run top-weekly-leaders:build:2026",
      )
    } else if (kind === "derive_only") {
      console.log("  2. derive-only で止まった → Phase4 完了後の派生やり直し。当日試合は:")
      console.log(`     ${finalizeOnlyCommand(year, date)}`)
      console.log("     または Phase4 済みなら: npm run daily:npb-pipeline:derive")
    } else if (kind === "phase4_pending") {
      console.log(`  2. Phase4 前で停止 → ${finalizeOnlyCommand(year, date)}（続き）`)
      console.log("     ※ derive-only は Phase4 をスキップするため使わない")
    } else {
      console.log("  2. Phase4 済み・派生のみ未了: npm run daily:npb-pipeline:derive")
      console.log(`  3. 当日の続き（推奨）: ${finalizeOnlyCommand(year, date)}`)
      console.log(`  4. 最初から: npm run day:fetch-display -- ${date}`)
    }
    console.log(`  5. 当日のみ塗り直し: npm run repaint:schedule:day -- --year ${year} --date ${date}`)
  }
  if (displayResult.ngCount > 0) {
    console.log(`  6. 実施試合の NG（一球未マージ）: npm run repaint:schedule:day -- --year ${year} --date ${date} --stage phase4`)
    console.log(`     表示のみ再確認: npm run day:fetch-display -- ${date} --display-only`)
  }
  if (pipelineOk) {
    console.log("  サイト反映: npm run display:publish:2026")
    console.log(`  表示のみ再確認: npm run day:fetch-display -- ${date} --display-only`)
  }
}

function addIssue(level, where, message, hint) {
  issues.push({ level, where, message, hint })
}

function bannerFail(title, lines) {
  console.error("\n" + "!".repeat(72))
  console.error(`>>> ${title}`)
  for (const line of lines) console.error(`>>> ${line}`)
  console.error("!".repeat(72) + "\n")
}

/**
 * @param {number} step
 * @returns {Promise<{ ok: boolean; exitCode: number }>}
 */
function runCommand(step, label, command) {
  stepNo = step
  const startedAt = Date.now()
  logProgress(`→ 開始: ${label}`)
  console.log(`\n========== ${label} ==========\n${command}\n`)

  return new Promise((resolve) => {
    const child = spawn(command, [], {
      cwd: root,
      shell: true,
      env: childEnv,
      stdio: "inherit",
    })

    const heartbeat = setInterval(() => {
      const sec = Math.round((Date.now() - startedAt) / 1000)
      logProgress(`… 実行中（経過 ${sec}秒）— 下の子プロセスログが続きます`)
    }, HEARTBEAT_SEC * 1000)

    child.on("close", (code) => {
      clearInterval(heartbeat)
      const elapsed = formatMs(Date.now() - startedAt)
      const exitCode = code ?? 1
      if (exitCode === 0) {
        logProgress(`← 終了: ${label}（所要 ${elapsed}）`)
        resolve({ ok: true, exitCode: 0 })
      } else {
        logProgress(`← 失敗: ${label}（所要 ${elapsed}、終了コード ${exitCode}）`)
        resolve({ ok: false, exitCode })
      }
    })

    child.on("error", (err) => {
      clearInterval(heartbeat)
      addIssue("ERROR", label, "プロセス起動に失敗", String(err?.message || err))
      logProgress(`← 失敗: ${label}（起動エラー）`)
      resolve({ ok: false, exitCode: 1 })
    })
  })
}

function readSnapshot(date) {
  const p = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date", `${date}.json`)
  if (!fs.existsSync(p)) return null
  try {
    const snap = JSON.parse(fs.readFileSync(p, "utf8"))
    if (!Array.isArray(snap?.gameIds)) return null
    return snap
  } catch (e) {
    addIssue("ERROR", "日程スナップショット", `JSON が読めません: ${p}`, String(e?.message || e))
    return null
  }
}

function tailPipelineLog(date, maxLines = 20) {
  if (!fs.existsSync(PIPELINE_LOG)) return []
  const lines = fs.readFileSync(PIPELINE_LOG, "utf8").split(/\r?\n/).filter(Boolean)
  const related = lines.filter((l) => l.includes(date) || /daily:npb-pipeline|phase0|phase2|phase4|validate|diag/i.test(l))
  return related.length >= 3 ? related.slice(-maxLines) : lines.slice(-maxLines)
}

/** @returns {{ allOk: boolean; ngCount: number; okCount: number }} */
function displayDay(date, year) {
  stepNo = 3
  logProgress("→ 開始: 当日試合の表示")

  const snap = readSnapshot(date)
  if (!snap) {
    addIssue("ERROR", "表示", `日程スナップショットがありません (${date})`, `_data/sportsnavi_schedule_snapshots/by_date/${date}.json`)
    logProgress("← 失敗: スナップショットなし")
    return { allOk: false, ngCount: 0, okCount: 0 }
  }

  const games = Array.isArray(snap.games)
    ? snap.games
    : snap.gameIds.map((id) => ({ gameId: id, stadiumName: "" }))
  const canonDir = path.join(root, "_data", "scraped_games", "canonical")
  const scoreRawDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi_score")
  const derivedDir = path.join(root, "_data", "scraped_games", "derived")
  let ng = 0
  let ok = 0

  console.log(`\n${"=".repeat(72)}`)
  console.log(`表示 ${date}（${games.length}試合）`)
  console.log("=".repeat(72))

  for (let i = 0; i < games.length; i++) {
    const g = games[i]
    const gid = String(g.gameId).trim()
    logProgress(`試合 ${i + 1}/${games.length}: ${gid} @ ${g.stadiumName || ""}`, i + 1)

    const cpath = path.join(canonDir, `${gid}.json`)
    const dpath = path.join(derivedDir, `${gid}_phase10_restored.json`)
    const sdir = path.join(scoreRawDir, gid)
    const scoreHtml = fs.existsSync(sdir)
      ? fs.readdirSync(sdir).filter((f) => /^\d{7}\.html$/.test(f)).length
      : 0
    const derived = fs.existsSync(dpath)

    console.log("\n" + "─".repeat(72))
    console.log(`${gid} @ ${g.stadiumName || ""}`)

    if (!fs.existsSync(cpath)) {
      if (isCancelledGame(gid, year)) {
        console.log("  [OK] 試合中止/ノーゲーム（日程ページ判定・取得不要）")
        ok++
        continue
      }
      console.log("  ★ [NG] canonical なし")
      addIssue("ERROR", `試合 ${gid}`, "canonical JSON がありません", cpath)
      ng++
      continue
    }

    let c
    try {
      c = JSON.parse(fs.readFileSync(cpath, "utf8"))
    } catch (e) {
      console.log("  ★ [NG] canonical が壊れています")
      addIssue("ERROR", `試合 ${gid}`, "canonical JSON のパースに失敗", String(e?.message || e))
      ng++
      continue
    }

    const gm = c.game || {}
    const dom = c.domain || {}
    const title = String(gm.meta?.ogTitle || "")
      .replace(/ 試合出場成績.*$/, "")
      .replace(/ 一球速報.*$/, "")
    console.log(`  ${title}`)

    const teams = gm.teams || []
    if (teams.length === 0) {
      addIssue("WARN", `試合 ${gid}`, "スタメン（teams）が空です")
    }
    for (const t of teams) {
      const lu = (t.startingLineup || [])
        .map((x) => `${x.battingOrder} ${x.fieldingPosition} ${x.playerName}`)
        .join(" | ")
      const tag = lu ? "" : " ★"
      console.log(`  [${t.teamName}] スタメン:${tag} ${lu || "(未取得)"}`)
      if (!lu) addIssue("WARN", `試合 ${gid}`, `[${t.teamName}] スタメン未取得`)
    }

    const bl = (dom.battingLines || []).length
    const pl = dom.pitchingLines || []
    const pas = dom.plateAppearances || []
    let pe = 0
    for (const pa of pas) pe += (pa.pitchEvents || []).length
    const pbp = (gm.textPlayByPlay || []).length
    const pitch = gm.pitchByPitchNote || {}
    console.log(`  出場成績: 打者行${bl} / 投手行${pl.length} / 実況${pbp}行`)
    console.log(
      `  一球: PA${pas.length} / 投球${pe} / phase10=${pitch.status || "?"}${pitch.note ? ` (${pitch.note})` : ""}`,
    )
    console.log(`  raw: score HTML ${scoreHtml}件 / derived ${derived ? "あり" : "なし"}`)

    if (!derived) addIssue("WARN", `試合 ${gid}`, "phase10 derived JSON なし", dpath)
    if (scoreHtml === 0) addIssue("WARN", `試合 ${gid}`, "一球 score raw HTML が 0 件", sdir)

    if (pl.length) {
      console.log(
        `  投手: ${pl.map((p) => `${p.playerName || "?"} ${p.ip || "-"}回${p.decision ? " " + p.decision : ""}`).join(" / ")}`,
      )
    }

    const miss = (gm.missingOrPartial || []).filter((s) => !String(s).includes("hint:"))
    const cancelled =
      isCancelledGame(gid, year) ||
      miss.some((s) => String(s).includes("game cancelled")) ||
      miss.some((s) => String(s).includes("cancelled")) ||
      /試合中止|ノーゲーム|コールド/.test(title)
    const bad = !cancelled && (!bl || !pas.length || !pe || pitch.status !== "restored_phase10")

    if (miss.length) {
      console.log(`  注意: ${miss.slice(0, 4).join(" ; ")}`)
      for (const m of miss.slice(0, 3)) {
        addIssue("WARN", `試合 ${gid}`, String(m).slice(0, 120))
      }
    }

    if (cancelled) {
      console.log("  [OK] 中止")
      ok++
    } else if (bad) {
      console.log("  ★ [NG] 出場成績または一球が未充足")
      const reasons = []
      if (!bl) reasons.push("打者行0")
      if (!pas.length) reasons.push("打席0")
      if (!pe) reasons.push("投球イベント0")
      if (pitch.status !== "restored_phase10") reasons.push(`phase10=${pitch.status || "?"}`)
      addIssue("ERROR", `試合 ${gid}`, `データ未充足 (${reasons.join(", ")})`, title)
      ng++
    } else {
      console.log("  [OK]")
      ok++
    }
  }

  console.log("\n" + "─".repeat(72))
  console.log("サイト表示用 JSON（トップ）")
  const topMissing = []
  for (const lg of ["CL", "PL"]) {
    const bat = path.join(root, "public", "data", "top-leaders", year, lg, "batting.json")
    const pit = path.join(root, "public", "data", "top-leaders", year, lg, "pitching.json")
    const wbat = currentWeeklyTopLeadersPath(year, lg, "batting")
    const batOk = fs.existsSync(bat)
    const pitOk = fs.existsSync(pit)
    const wOk = Boolean(wbat) && fs.existsSync(wbat)
    const mark = batOk && pitOk && wOk ? "" : " ★"
    console.log(
      `  ${lg}${mark}: 通算打撃=${batOk ? "あり" : "なし"} 通算投手=${pitOk ? "あり" : "なし"} 今週打撃=${wOk ? "あり" : "なし"}`,
    )
    if (!batOk) topMissing.push(`${lg} 通算打撃`)
    if (!pitOk) topMissing.push(`${lg} 通算投手`)
    if (!wOk) topMissing.push(`${lg} 今週打撃`)
  }
  if (topMissing.length) {
    addIssue("WARN", "TOP表示JSON", `不足: ${topMissing.join(", ")}`, "パイプライン派生ブロックが失敗した可能性")
  }
  console.log("─".repeat(72))
  console.log(`表示完了 ${date} — OK ${ok}件 / NG ${ng}件 / 全 ${games.length}件`)
  console.log("=".repeat(72))
  logProgress(`← 終了: 表示（OK ${ok} / NG ${ng} / 全 ${games.length}）`)

  if (ng > 0) {
    addIssue("ERROR", "表示サマリー", `${date} の NG 試合が ${ng} 件あります`)
  }

  return { allOk: ng === 0 && games.length > 0, ngCount: ng, okCount: ok }
}

function printFinalReport({ date, year, pipelineOk, pipelineExitCode, displayResult, totalElapsedSec }) {
  stepNo = TOTAL_STEPS
  logProgress("→ 開始: 結果サマリー")

  const errors = issues.filter((i) => i.level === "ERROR")
  const warns = issues.filter((i) => i.level === "WARN")
  const success = pipelineOk && displayResult.allOk && errors.length === 0

  console.log("\n" + "#".repeat(72))
  if (success) {
    console.log("#  結果: 成功")
    console.log(`#  ${date} — 日次一括・当日試合・TOP表示JSON まで問題なし`)
  } else if (pipelineOk && !displayResult.allOk) {
    console.log("#  結果: 一部失敗（取得パイプラインは完了、試合データに不備あり）")
  } else if (!pipelineOk && displayResult.okCount > 0) {
    console.log("#  結果: 一部失敗（日次一括が途中で止まったが、表示可能な試合あり）")
  } else {
    console.log("#  結果: 失敗")
  }
  console.log(`#  総所要時間: ${formatMs(totalElapsedSec * 1000)}`)
  console.log("#".repeat(72))

  console.log("\n[チェック項目]")
  console.log(`  日次一括パイプライン: ${pipelineOk ? "OK" : `NG（終了コード ${pipelineExitCode}）`}`)
  console.log(
    `  当日試合データ: ${displayResult.allOk ? "OK" : `NG（${displayResult.ngCount}試合）`} （OK ${displayResult.okCount}件）`,
  )

  if (errors.length || warns.length) {
    console.log("\n[問題一覧]")
    let n = 0
    for (const i of errors) {
      n++
      console.log(`  ${n}. [ERROR] ${i.where}: ${i.message}`)
      if (i.hint) console.log(`       → ${i.hint}`)
    }
    for (const i of warns) {
      n++
      console.log(`  ${n}. [WARN]  ${i.where}: ${i.message}`)
      if (i.hint) console.log(`       → ${i.hint}`)
    }
  }

  const logTail = tailPipelineLog(date)
  console.log(`\n[詳細ログ] ${PIPELINE_LOG}`)
  if (logTail.length) {
    console.log("  （直近・関連行）")
    for (const line of logTail) console.log(`  | ${line}`)
  }

  if (!success) {
    printNextSteps({ date, year, pipelineOk, displayResult, logTail })
    console.log("#".repeat(72))
    logProgress("← 終了: 失敗（終了コード 1）")
    console.error("\n★ day:fetch-display はエラーで終了しました（終了コード 1）\n")
  } else {
    console.log("#".repeat(72))
    logProgress("← 終了: 成功（終了コード 0）")
    console.log("\n✓ day:fetch-display 正常終了\n")
  }
}

async function main() {
  const { date, year, displayOnly } = parseArgs(process.argv.slice(2))
  const startedAt = Date.now()
  stepNo = 0
  logProgress(`開始（対象日 ${date} / year ${year}${displayOnly ? " / 表示のみ" : ""}）`)
  printPlan(date, displayOnly)

  let pipelineOk = true
  let pipelineExitCode = 0
  let displayResult = { allOk: false, ngCount: 0, okCount: 0 }

  if (displayOnly) {
    displayResult = displayDay(date, year)
    const totalElapsedSec = Math.round((Date.now() - startedAt) / 1000)
    logProgress(`全体の経過時間: ${formatMs(totalElapsedSec * 1000)}`)
    printFinalReport({
      date,
      year,
      pipelineOk: true,
      pipelineExitCode: 0,
      displayResult,
      totalElapsedSec,
    })
    const errors = issues.filter((i) => i.level === "ERROR")
    const failed = !displayResult.allOk || errors.length > 0
    if (failed) process.exit(1)
    return
  }

  try {
    stepNo = 1
    const snapBefore = readSnapshot(date)
    if (!snapBefore || snapBefore.gameIds.length === 0) {
      logProgress("日程スナップショットなし → Phase0 を実行", 1)
      const p0 = await runCommand(
        1,
        "Phase0 日程",
        `npx tsx scripts/phase0_fetch_sportsnavi_schedule.ts --year ${year} --from ${date} --to ${date} --merge`,
      )
      if (!p0.ok) {
        addIssue("ERROR", "Phase0", "日程取得に失敗", `終了コード ${p0.exitCode}`)
        bannerFail("Phase0 失敗", [`終了コード: ${p0.exitCode}`])
        pipelineOk = false
        pipelineExitCode = p0.exitCode
      }
      const snapAfter = readSnapshot(date)
      if (!snapAfter || snapAfter.gameIds.length === 0) {
        console.log("\n" + "#".repeat(72))
        console.log(`#  結果: 成功（${date} は試合なし — 休養日の可能性）`)
        console.log("#".repeat(72) + "\n")
        return
      }
      logProgress(`Phase0 完了: ${snapAfter.gameIds.length} 試合`, 2)
    } else {
      logProgress(`日程 OK: 既存スナップショットに ${snapBefore.gameIds.length} 試合`, 1)
    }

    stepNo = 2
    const pr = await runCommand(
      2,
      "日次一括（取得・一球・派生・ランキング・TOP表示JSON）",
      `node scripts/run_daily_npb_pipeline.mjs --year ${year} --from ${date} --to ${date} --no-build`,
    )
    pipelineOk = pr.ok
    pipelineExitCode = pr.exitCode
    if (!pr.ok) {
      addIssue(
        "ERROR",
        "日次一括パイプライン",
        `異常終了（終了コード ${pr.exitCode}）`,
        "表示は続行します。",
      )
      bannerFail("日次一括パイプライン失敗", [
        `終了コード: ${pr.exitCode}`,
        "このあと当日試合の表示と結果サマリーを出力します。",
        `詳細ログ: ${PIPELINE_LOG}`,
      ])
    }
  } catch (e) {
    addIssue("ERROR", "実行", "想定外の例外", String(e?.message || e))
    pipelineOk = false
  } finally {
    displayResult = displayDay(date, year)
    const totalElapsedSec = Math.round((Date.now() - startedAt) / 1000)
    logProgress(`全体の経過時間: ${formatMs(totalElapsedSec * 1000)}`)
    printFinalReport({ date, year, pipelineOk, pipelineExitCode, displayResult, totalElapsedSec })

    const errors = issues.filter((i) => i.level === "ERROR")
    const failed = !pipelineOk || !displayResult.allOk || errors.length > 0
    if (failed) process.exit(1)
  }
}

main().catch((e) => {
  console.error("[day:fetch-display] 致命的エラー:", e)
  process.exit(1)
})
