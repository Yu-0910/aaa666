/**
 * Phase 11 (batting, minimal): canonical から打者別の通算行を一括生成する。
 *
 * 集計ロジックは `lib/yahooGame/canonicalBattingSeasonAgg.ts`（phase12 と共有）。
 *
 * 出力:
 *   _data/derived/player_season_batting/{year}/yahoo_{yahooBatterId}.json
 *   各 JSON に `appearancePrimaryZipEnabled`（ビルド時の `TOPPAGE_APPEARANCE_PRIMARY` 相当）を付与する。
 *
 * 使い方:
 *   npx tsx scripts/phase11_build_season_stats_from_canonical.ts --year 2026
 *
 * 入力: `loadCanonicalGamesMergedForDerivedPipeline` と同じ（一球マージ済み canonical）。
 */

import { mkdirSync, readdirSync, unlinkSync, writeFileSync, existsSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { isAppearancePrimaryZipEnabled } from "../lib/yahooGame/appearancePrimaryFeatureFlag"
import { battingSeasonAggSource } from "../lib/yahooGame/battingSeasonAggSourceFeatureFlag"
import { isPlateResultAppearanceOnly } from "../lib/yahooGame/plateResultSourceFeatureFlag"
import {
  aggregateBattingSeasonForProfilesAndRankings,
  buildEnrichedBattingSeasonRow,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): {
  year: string
  onlyYahooIds: string[] | null
  reconcileGidpFromYahooTop: boolean
} {
  const args = process.argv.slice(2)
  let year = "2026"
  let onlyYahooIds: string[] | null = null
  let reconcileGidpFromYahooTop = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    } else if (args[i] === "--only-yahoo-ids" && args[i + 1]) {
      onlyYahooIds = String(args[i + 1])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    } else if (args[i] === "--reconcile-gidp-from-yahoo-top") {
      reconcileGidpFromYahooTop = true
    }
  }
  return { year, onlyYahooIds, reconcileGidpFromYahooTop }
}

function stripTags(s: string): string {
  return String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function extractYahooTopSummaryTds(html: string): string[] | null {
  const m = html.match(/bb-playerStatsTable--summary[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)
  if (!m) return null
  const tbody = m[1]
  const tds = [...tbody.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => stripTags(x[1]))
  if (tds.length < 20) return null
  return tds
}

function normalizeNum(x: unknown): number | null {
  const s = String(x ?? "").trim()
  if (!s) return null
  if (s === "-" || s === "—") return null
  if (/^\.\d+$/.test(s)) return Number(`0${s}`)
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  return null
}

async function fetchYahooPlayerTopCached(playerId: string): Promise<string | null> {
  const dir = join(projectRoot, "_data", "scraped_players", "raw_yahoo_player_top")
  mkdirSync(dir, { recursive: true })
  const p = join(dir, `${playerId}.html`)
  if (existsSync(p)) {
    try {
      return readFileSync(p, "utf8")
    } catch {
      // fallthrough
    }
  }
  const url = `https://baseball.yahoo.co.jp/npb/player/${encodeURIComponent(playerId)}/top`
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    },
  })
  if (!res.ok) return null
  const html = await res.text()
  try {
    writeFileSync(p, html, "utf8")
  } catch {
    // ignore
  }
  return html
}

async function gidpFromYahooPlayerTop(playerId: string): Promise<number | null> {
  const html = await fetchYahooPlayerTopCached(playerId)
  if (!html) return null
  const tds = extractYahooTopSummaryTds(html)
  if (!tds) return null
  // columns (24 tds): ... 18 = GIDP
  return normalizeNum(tds[18])
}

async function main(): Promise<void> {
  const { year, onlyYahooIds, reconcileGidpFromYahooTop } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  if (docs.length === 0) {
    console.error("[phase11] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

  const byBatter = aggregateBattingSeasonForProfilesAndRankings(docs)
  if (byBatter.size === 0) {
    let paRows = 0
    for (const d of docs) {
      paRows += d.domain?.plateAppearances?.length ?? 0
    }
    console.error(
      "[phase11] 打撃集計できるデータがありません。canonical の domain.plateAppearances が空、または yahooBatterId 付き打席がありません。",
    )
    console.error(
      `  試合数: ${docs.length}, plateAppearance 行数の合計: ${paRows}`,
    )
    console.error(
      "  対処: 一球ログ由来の打席を canonical にマージしてから再実行。Yahoo 系: npm run phase10:yahoo:restore または phase10:yahoo:merge。スポナビ canonical へ載せる場合: npm run phase4:merge:phase10（内容は各スクリプトの README コメント参照）。",
    )
    process.exit(1)
  }

  const outDir = join(projectRoot, "_data", "derived", "player_season_batting", year)
  mkdirSync(outDir, { recursive: true })

  if (!onlyYahooIds) {
    for (const f of readdirSync(outDir)) {
      if (f.startsWith("yahoo_") && f.endsWith(".json")) {
        try {
          unlinkSync(join(outDir, f))
        } catch {
          // ignore
        }
      }
    }
  }

  const batterIds = (onlyYahooIds ?? [...byBatter.keys()]).slice().sort()
  for (const bid of batterIds) {
    const agg = byBatter.get(bid)!
    if (!agg) continue
    if (reconcileGidpFromYahooTop) {
      try {
        const gidpTop = await gidpFromYahooPlayerTop(bid)
        if (typeof gidpTop === "number" && Number.isFinite(gidpTop) && gidpTop > agg.gidp) {
          agg.gidp = gidpTop
        }
      } catch {
        // skip
      }
    }
    const row = buildEnrichedBattingSeasonRow(agg)
    const payload = {
      schemaVersion: "phase11-player-season-batting-v0",
      seasonYear: year,
      yahooBatterId: bid,
      generatedAt: new Date().toISOString(),
      /** ビルド時点で `plateAppearanceResolvedResultText` が zip を使うか（`TOPPAGE_APPEARANCE_PRIMARY` の解釈結果） */
      appearancePrimaryZipEnabled: isAppearancePrimaryZipEnabled(),
      /** `TOPPAGE_PLATE_RESULT_SOURCE`：true なら zip 不足時に要約・一球へフォールバックしない */
      plateResultAppearanceOnly: isPlateResultAppearanceOnly(),
      /** `TOPPAGE_BATTING_SEASON_AGG`：`hybrid` | `appearance_slots` */
      battingSeasonAggSource: battingSeasonAggSource(),
      source: {
        canonicalGames: docs.map((d) => d.gameId).sort(),
      },
      rows: [row],
    }
    writeFileSync(join(outDir, `yahoo_${bid}.json`), JSON.stringify(payload, null, 2), "utf8")
  }

  console.log(`[phase11] wrote ${batterIds.length} files → ${outDir}`)
}

main()
