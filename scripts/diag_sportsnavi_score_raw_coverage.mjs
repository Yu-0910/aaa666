/**
 * 一球 score スナップショット raw（raw_sportsnavi_score）の「どれだけ揃っているか」を集計する。
 *
 * - インデックス上の試合数
 * - score フォルダが無い／HTML ゼロの試合
 * - メタ（_meta/{gameId}.json）との一致・不一致（最終正常完了時の page 件数）
 * - HTML 総数（サイト全体でのオーダー感の目安）
 *
 *   node scripts/diag_sportsnavi_score_raw_coverage.mjs --year 2026
 *   npm run diag:sportsnavi-score-raw-coverage
 */

import fs from "node:fs"
import path from "node:path"

const root = path.resolve(process.cwd())

function parseArgs(argv) {
  let year = "2026"
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--year") year = String(argv[++i] ?? "").trim() || year
    if (argv[i]?.startsWith("--year=")) year = argv[i].slice("--year=".length).trim() || year
  }
  return { year }
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

function main() {
  const { year } = parseArgs(process.argv.slice(2))
  const indexPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  if (!fs.existsSync(indexPath)) {
    console.error("[diag score-raw] missing index:", indexPath)
    process.exit(1)
  }
  const idx = readJson(indexPath)
  const gameIds = Array.isArray(idx.gameIds) ? idx.gameIds.map((x) => String(x).trim()).filter(Boolean) : []

  const scoreRoot = path.join(root, "_data", "scraped_games", "raw_sportsnavi_score")
  const metaDir = path.join(scoreRoot, "_meta")

  /** @type {{ gameId: string, html: number, metaPages?: number, metaPAs?: number, status: string }[]} */
  const rows = []

  let totalHtml = 0
  let metaMatched = 0
  let metaMismatched = 0
  let noDirOrZero = 0
  let htmlOnlyNoMeta = 0

  for (const gid of gameIds) {
    const gdir = path.join(scoreRoot, gid)
    const html = countScoreHtmlFiles(gdir)
    totalHtml += html
    const metaPath = path.join(metaDir, `${gid}.json`)
    let metaPages
    let metaPAs
    let status

    if (html === 0) {
      status = fs.existsSync(gdir) ? "empty_dir" : "no_dir"
      noDirOrZero += 1
    } else if (!fs.existsSync(metaPath)) {
      status = "html_without_meta"
      htmlOnlyNoMeta += 1
    } else {
      try {
        const m = readJson(metaPath)
        metaPages = typeof m.scorePageCount === "number" ? m.scorePageCount : undefined
        metaPAs = typeof m.plateAppearances === "number" ? m.plateAppearances : undefined
        if (metaPages === undefined && Array.isArray(m.scoreIndexes))
          metaPages = m.scoreIndexes.length
      } catch {
        metaPages = undefined
      }
      if (metaPages != null && metaPages === html) {
        status = "meta_match"
        metaMatched += 1
      } else if (metaPages != null) {
        status = `meta_mismatch(meta=${metaPages},disk=${html})`
        metaMismatched += 1
      } else {
        status = "meta_unreadable"
      }
    }
    rows.push({ gameId: gid, html, metaPages, metaPAs, status })
  }

  console.log("")
  console.log("[diag sportsnavi score raw]")
  console.log(`  year=${year}`)
  console.log(`  index games           : ${gameIds.length}`)
  console.log(`  no score html (0/file): ${noDirOrZero}`)
  console.log(`  meta_match (完了目安): ${metaMatched}`)
  console.log(`  meta_mismatch         : ${metaMismatched}`)
  console.log(`  html but no meta      : ${htmlOnlyNoMeta}`)
  console.log(`  total score .html sum : ${totalHtml}  （全試合の score ページ数の近似）`)
  const paSum = rows.reduce((a, r) => a + (r.metaPAs ?? 0), 0)
  const metaGames = rows.filter((r) => r.metaPages != null).length
  if (metaMatched + metaMismatched > 0 || paSum > 0) {
    console.log(`  sum plateAppearances  : ${paSum}  （メタが付いている試合のみ合算）`)
  }
  console.log("")
  console.log("  ─ 解釈（初心者向け） ─")
  console.log(
    "  「欠損」は index にある試合のうち、score の HTML が 1 つも無いフォルダ = no score html と数えています。"
  )
  console.log(
    "  メタがある試合は、fetch_sportsnavi_score_raw が最後まで走ったときに _meta が書けた試合です（途中中断だと無いことがあります）。"
  )
  console.log(
    "  total score .html sum が「サイト全体で何ページ分くらい disk にあるか」のオーダー感です（1万〜数万が多いです）。"
  )
  console.log("")

  const samples = [...rows].sort((a, b) => b.html - a.html).slice(0, 5)
  console.log(`  ─ HTML 上位5試合 ─`)
  for (const r of samples) console.log(`    ${r.gameId}\tpages=${r.html}\tstatus=${r.status}`)
  console.log("")
}

main()
