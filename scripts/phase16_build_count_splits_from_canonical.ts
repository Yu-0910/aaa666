/**
 * Phase 16: canonical の一球 resultJa から「最終球直前のカウント」を推定し、カウント別打撃スプリットを生成する。
 *
 * Phase 10 に B/S 列が無い前提で、ボール/ファウル/空振り/見逃し等の表記からシミュレーション（lib/yahooGame/pitchCountSim）。
 *
 * 出力:
 *   _data/derived/player_season_batting_count/{year}/yahoo_{yahooBatterId}.json
 *
 * 使い方:
 *   npx tsx scripts/phase16_build_count_splits_from_canonical.ts --year 2026
 *
 * 入力は `loadCanonicalGamesMergedForDerivedPipeline`（Phase11 と同一: 一球マージ済み canonical）。
 */

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"
import { pitchCountKeyForPlateAppearance } from "../lib/yahooGame/pitchCountSim"
import { dedupePlateAppearancesByInningHalfOrder } from "../lib/yahooGame/dedupePlateAppearances"
import {
  plateAppearanceResultTextFromPitchOnly,
  plateAppearanceResolvedResultText,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import {
  emptyBattingSeasonAggYahoo,
  updateBattingAggFromPa,
  updateBattingAggFromResultJa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import type { SeasonStatsRow } from "../lib/seasonStatsPilot"
import { enrichSeasonStatsRowSabermetrics } from "../lib/seasonStatsPilotShared"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { battingSlashRatesFromCounts, slashRate3FromCounts } from "../lib/battingRateFormat"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    }
  }
  return { year }
}

function aggToSeasonStatsRow(splitValue: string, agg: BattingSeasonAggYahoo): SeasonStatsRow {
  const h1 = Math.max(0, agg.h - agg.h2 - agg.h3 - agg.hr)
  const slash = battingSlashRatesFromCounts(agg)
  const risp_avg = slashRate3FromCounts(agg.risp_h, agg.risp_ab)
  const sbPct = agg.sb + agg.cs > 0 ? agg.sb / (agg.sb + agg.cs) : null

  return enrichSeasonStatsRowSabermetrics({
    split_type: "pitch_count",
    split_value: splitValue,
    split_label: splitValue,
    g: agg.gameIds.size,
    pa: agg.pa,
    ab: agg.ab,
    r: agg.r,
    h: agg.h,
    h1,
    h2: agg.h2,
    h3: agg.h3,
    hr: agg.hr,
    tb: agg.tb,
    rbi: agg.rbi,
    so: agg.so,
    bb: agg.bb,
    ibb: agg.ibb,
    hbp: agg.hbp,
    sh: agg.sh,
    sf: agg.sf,
    sb: agg.sb,
    cs: agg.cs,
    e: agg.e,
    gidp: agg.gidp,
    avg: slash.avg,
    obp: slash.obp,
    slg: slash.slg,
    ops: slash.ops,
    risp_avg,
    risp_ab: agg.risp_ab,
    risp_h: agg.risp_h,
    sb_pct: sbPct == null ? "" : (sbPct * 100).toFixed(1),
    isop: ".000",
    isod: ".000",
    babip: ".000",
    bb_pct: ".000",
    k_pct: ".000",
    bbk: ".000",
    gpa: ".000",
    rc: ".0",
    xr: ".0",
    seca: ".000",
    ta: ".000",
    noi: ".000",
  })
}

function loadCanonicalFiles(): CanonicalGameDocument[] {
  const dir = join(projectRoot, "_data", "scraped_games", "canonical")
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  const out: CanonicalGameDocument[] = []
  for (const f of files) {
    const p = join(dir, f)
    try {
      const doc = JSON.parse(readFileSync(p, "utf8")) as CanonicalGameDocument
      if (doc?.schemaVersion === "yahoo-game-canonical-v1" && doc?.gameId) out.push(doc)
    } catch {
      // ignore
    }
  }
  return out
}

const COUNT_ORDER = [
  "0-0",
  "1-0",
  "2-0",
  "3-0",
  "0-1",
  "1-1",
  "2-1",
  "3-1",
  "0-2",
  "1-2",
  "2-2",
  "3-2",
]

function main(): void {
  const { year } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  if (docs.length === 0) {
    console.error("[phase16] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

  const byBatterCount = new Map<string, Map<string, BattingSeasonAggYahoo>>()

  function ensureCountMap(bid: string): Map<string, BattingSeasonAggYahoo> {
    let m = byBatterCount.get(bid)
    if (!m) {
      m = new Map()
      byBatterCount.set(bid, m)
    }
    return m
  }

  for (const doc of docs) {
    const gameId = doc.gameId
    const pas = dedupePlateAppearancesByInningHalfOrder(
      doc.domain.plateAppearances ?? [],
      gameId,
    )
    for (const pa of pas) {
      const bid = (pa.yahooBatterId ?? "").trim()
      if (!bid) continue
      const resolvedResultText = plateAppearanceResolvedResultText(doc, pa).trim()
      const fallbackResultText = plateAppearanceResultTextFromPitchOnly(pa).trim()
      const resultText = resolvedResultText || fallbackResultText
      if (!resultText) continue
      const ck = pitchCountKeyForPlateAppearance(pa.pitchEvents, resultText)
      if (!ck) continue
      const cm = ensureCountMap(bid)
      const agg = cm.get(ck) ?? emptyBattingSeasonAggYahoo()
      if (resolvedResultText) {
        updateBattingAggFromPa(agg, gameId, pa, doc)
      } else {
        agg.gameIds.add(gameId)
        agg.pa += 1
        updateBattingAggFromResultJa(agg, resultText)
      }
      cm.set(ck, agg)
    }
  }

  const outDir = join(projectRoot, "_data", "derived", "player_season_batting_count", year)
  mkdirSync(outDir, { recursive: true })

  for (const f of readdirSync(outDir)) {
    if (f.startsWith("yahoo_") && f.endsWith(".json")) {
      try {
        unlinkSync(join(outDir, f))
      } catch {
        // ignore
      }
    }
  }

  const batterIds = [...byBatterCount.keys()].sort()
  for (const bid of batterIds) {
    const cm = byBatterCount.get(bid)!
    const rows: SeasonStatsRow[] = []
    for (const ck of COUNT_ORDER) {
      const agg = cm.get(ck)
      if (agg && agg.pa > 0) rows.push(aggToSeasonStatsRow(ck, agg))
    }
    const payload = {
      schemaVersion: "phase16-player-season-batting-count-v0",
      seasonYear: year,
      yahooBatterId: bid,
      generatedAt: new Date().toISOString(),
      meta: {
        countDefinition:
          "最終球直前の B-S（resultJa シミュ）。四球・敬遠はログ不足時に 3-0 / 3-1 へ寄せる（Yahoo カウント別に合わせる近似）。",
      },
      source: {
        canonicalGames: docs.map((d) => d.gameId).sort(),
      },
      rows,
    }
    writeFileSync(join(outDir, `yahoo_${bid}.json`), JSON.stringify(payload, null, 2), "utf8")
  }

  console.log(`[phase16] wrote ${batterIds.length} files → ${outDir}`)
}

main()
