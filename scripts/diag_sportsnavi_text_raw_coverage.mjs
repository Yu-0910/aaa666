/**
 * スポナビ テキスト速報 raw の「どれだけ揃っているか」を要約する（index 対比）。
 *
 * 主な参照:
 *   - `_data/scraped_games/raw_sportsnavi_text/{gameId}.html`（Phase2 正本）
 *   - 補助: `_data/scraped_games/raw/{gameId}/text.html`（Phase4 用コピーがある場合）
 *
 * 試合中止検知: `_data/scraped_games/raw_sportsnavi/{gameId}.html` があれば利用（無ければ中止扱いしない）。
 *
 *   node scripts/diag_sportsnavi_text_raw_coverage.mjs --year 2026
 *   npm run diag:sportsnavi-text-raw-coverage
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function loadCancelledChecker() {
  const mod = await import(path.join(__dirname, "../lib/yahooGame/sportsnaviStatsTextParse.mjs"))
  return mod.isSportsnaviMainGameCancelled
}

function parseArgs(argv) {
  let year = "2026"
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--year") year = String(argv[++i] ?? "").trim() || year
    if (argv[i]?.startsWith("--year=")) year = argv[i].slice("--year=").trim() || year
  }
  return { year }
}

function countBbLiveTextSplits(html) {
  if (!html || typeof html !== "string") return 0
  const t = html.trimStart()
  if (t.startsWith("FETCH_FAILED") || t.startsWith("<!-- fetch failed")) return -1
  const parts = html.split('class="bb-liveText"')
  return Math.max(0, parts.length - 1)
}

function readIfExists(p) {
  try {
    if (!fs.existsSync(p)) return null
    return fs.readFileSync(p, "utf8")
  } catch {
    return null
  }
}

async function main() {
  const root = process.cwd()
  const isCancelledFn = await loadCancelledChecker()

  const { year } = parseArgs(process.argv.slice(2))
  const indexPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  if (!fs.existsSync(indexPath)) {
    console.error("[diag text-raw] missing index:", indexPath)
    process.exit(1)
  }
  const idx = JSON.parse(fs.readFileSync(indexPath, "utf8"))
  const gameIds = Array.isArray(idx.gameIds) ? idx.gameIds.map((x) => String(x).trim()).filter(Boolean) : []

  const textDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi_text")
  const mainDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi")
  const rawLegacyDir = path.join(root, "_data", "scraped_games", "raw")

  let primaryFileGames = 0
  let altOnlyGames = 0
  let noTextFile = 0
  let fetchFailed = 0
  let cancelledOk = 0
  let thinNoLiveText = 0
  let okLiveText = 0

  let totalBytesRead = 0
  const thinSamples = []
  const failedSamples = []
  /** @type {string[]} */
  const mismatchNote = []

  for (const gid of gameIds) {
    const pPrimary = path.join(textDir, `${gid}.html`)
    const pAlt = path.join(rawLegacyDir, gid, "text.html")
    const htmlMain = readIfExists(path.join(mainDir, `${gid}.html`))

    const hasPrimary = fs.existsSync(pPrimary)
    const hasAlt = fs.existsSync(pAlt)

    let htmlText = null
    /** @type {string | null} */
    let bytesPath = null
    if (hasPrimary) {
      const t = readIfExists(pPrimary)
      if (t != null) {
        htmlText = t
        bytesPath = pPrimary
      }
    }
    if (htmlText == null && hasAlt) {
      const t = readIfExists(pAlt)
      if (t != null) {
        htmlText = t
        bytesPath = pAlt
      }
    }

    if (hasPrimary) primaryFileGames++
    else if (hasAlt) altOnlyGames++

    const gameCancelled =
      typeof isCancelledFn === "function" && htmlMain != null ? isCancelledFn(htmlMain) : false

    if (htmlText == null) {
      noTextFile++
      continue
    }

    if (bytesPath) {
      try {
        totalBytesRead += fs.statSync(bytesPath).size
      } catch {
        /* ignore */
      }
    }

    const blocks = countBbLiveTextSplits(htmlText)
    if (blocks === -1) {
      fetchFailed++
      if (failedSamples.length < 8) failedSamples.push(gid)
      continue
    }
    if (gameCancelled && blocks === 0) {
      cancelledOk++
      continue
    }
    if (blocks === 0) {
      thinNoLiveText++
      if (thinSamples.length < 8) thinSamples.push(gid)
      continue
    }
    okLiveText++
  }

  if (altOnlyGames > 0) {
    mismatchNote.push(
      `raw_sportsnavi_text が無く raw/{{game}}/text.html のみの試合が ${altOnlyGames} 件 → Phase2 の text 取得で正本を埋めるとよい`,
    )
  }

  console.log("")
  console.log("[diag sportsnavi text raw]")
  console.log(`  year=${year}`)
  console.log(`  index games                     : ${gameIds.length}`)
  console.log(`  text file absent (両系統とも無い): ${noTextFile}`)
  console.log(`  FETCH_FAILED / fetch failed 印 : ${fetchFailed}`)
  console.log(`  試合中止（main HTML）で空で正常 : ${cancelledOk}`)
  console.log(`  ファイルあり・bb-liveText 0 （薄いCSR等）: ${thinNoLiveText}`)
  console.log(`  bb-liveText あり（実況本文ありの目安）: ${okLiveText}`)
  console.log("")
  console.log(`  raw_sportsnavi_text ファイルが存在する試合: ${primaryFileGames} / ${gameIds.length}`)
  console.log(`  （補）raw/{{game}}/text.html のみ（正本なし）     : ${altOnlyGames}`)
  console.log(`  上記で実際に読んだ HTML の合計バイト概算           : ${totalBytesRead.toLocaleString("ja-JP")} bytes`)
  console.log("")
  console.log("  ─ 詳細 JSON が欲しいとき ─")
  console.log(`    node scripts/diag_phase2_raw_completeness.mjs --year ${year}`)
  console.log("    （全試合一覧・欠損ヒントつき・JSON 出力）")
  console.log("")
  if (failedSamples.length) console.log(`  FETCH FAILED 試合例（最大8）: ${failedSamples.join(", ")}`)
  if (thinSamples.length) console.log(`  bb-liveText=0 の試合例（最大8）: ${thinSamples.join(", ")}`)
  if (mismatchNote.length) {
    console.log("")
    for (const m of mismatchNote) console.log(`  ※ ${m}`)
  }
  console.log("")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
