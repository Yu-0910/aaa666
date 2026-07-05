/**
 * Phase 17: 試合開催日（canonical タイトルから）で暦月・火曜始まり週別の打撃スプリットを生成する。
 *
 * 出力:
 *   _data/derived/player_season_batting_period/{year}/yahoo_{yahooBatterId}.json
 *
 * 使い方:
 *   npx tsx scripts/phase17_build_period_splits_from_canonical.ts --year 2026
 *
 * 入力は `loadCanonicalGamesMergedForDerivedPipeline`（Phase11 と同一: 一球マージ済み canonical）。
 * 集計は Phase11 と同じ `aggregateBattingForBatterInGameForProfiles`（出場成績スロット優先）を試合×打者で適用する。
 */

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"
import { parseGameDateYmdFromCanonical } from "../lib/yahooGame/gameDateFromCanonical"
import {
  aggregateBattingForBatterInGameForProfiles,
  emptyBattingSeasonAggYahoo,
  mergeBattingSeasonAggYahoo,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import {
  monthKeyFromYmd,
  tuesdayWeekKeyFromYmd,
  formatWeekRangeTueToSunFromTuesdayYmd,
} from "../lib/yahooGame/jstPeriodKeys"
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

function aggToRow(
  split_type: "calendar_month" | "calendar_week",
  split_value: string,
  split_label: string,
  agg: BattingSeasonAggYahoo
): SeasonStatsRow {
  const h1 = Math.max(0, agg.h - agg.h2 - agg.h3 - agg.hr)
  const slash = battingSlashRatesFromCounts(agg)
  const risp_avg = slashRate3FromCounts(agg.risp_h, agg.risp_ab)
  const sbPct = agg.sb + agg.cs > 0 ? agg.sb / (agg.sb + agg.cs) : null

  return enrichSeasonStatsRowSabermetrics({
    split_type,
    split_value,
    split_label,
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

function monthLabel(mk: string): string {
  const m = mk.match(/^(\d{4})-(\d{2})$/)
  if (!m) return mk
  return `${parseInt(m[2], 10)}月`
}

function main(): void {
  const { year } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  if (docs.length === 0) {
    console.error("[phase17] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

  const byBatterMonth = new Map<string, Map<string, BattingSeasonAggYahoo>>()
  const byBatterWeek = new Map<string, Map<string, BattingSeasonAggYahoo>>()

  function ensureMonthMap(bid: string): Map<string, BattingSeasonAggYahoo> {
    let m = byBatterMonth.get(bid)
    if (!m) {
      m = new Map()
      byBatterMonth.set(bid, m)
    }
    return m
  }
  function ensureWeekMap(bid: string): Map<string, BattingSeasonAggYahoo> {
    let m = byBatterWeek.get(bid)
    if (!m) {
      m = new Map()
      byBatterWeek.set(bid, m)
    }
    return m
  }

  for (const doc of docs) {
    const ymd = parseGameDateYmdFromCanonical(doc)
    if (!ymd) continue
    const mk = monthKeyFromYmd(ymd)
    const wk = tuesdayWeekKeyFromYmd(ymd)
    if (!wk) continue

    const batterIds = new Set<string>()
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = (line.yahooPlayerId ?? "").trim()
      if (bid) batterIds.add(bid)
    }
    for (const row of doc.game?.statsPlayerLinkedRows ?? []) {
      const bid = (row.yahooPlayerId ?? "").trim()
      if (bid) batterIds.add(bid)
    }
    for (const pa of doc.domain.plateAppearances ?? []) {
      const bid = (pa.yahooBatterId ?? "").trim()
      if (bid) batterIds.add(bid)
    }

    for (const bid of batterIds) {
      const gameAgg = aggregateBattingForBatterInGameForProfiles(doc, bid)
      if (!gameAgg) continue

      const mm = ensureMonthMap(bid)
      const ma = mm.get(mk) ?? emptyBattingSeasonAggYahoo()
      mergeBattingSeasonAggYahoo(ma, gameAgg)
      mm.set(mk, ma)

      const wm = ensureWeekMap(bid)
      const wa = wm.get(wk) ?? emptyBattingSeasonAggYahoo()
      mergeBattingSeasonAggYahoo(wa, gameAgg)
      wm.set(wk, wa)
    }
  }

  const outDir = join(projectRoot, "_data", "derived", "player_season_batting_period", year)
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

  const allIds = new Set<string>([...byBatterMonth.keys(), ...byBatterWeek.keys()])
  const batterIds = [...allIds].sort()

  for (const bid of batterIds) {
    const rows: SeasonStatsRow[] = []
    const mm = byBatterMonth.get(bid)
    if (mm) {
      const keys = [...mm.keys()].sort()
      for (const mk of keys) {
        const agg = mm.get(mk)
        if (agg && agg.pa > 0) rows.push(aggToRow("calendar_month", mk, monthLabel(mk), agg))
      }
    }
    const wm = byBatterWeek.get(bid)
    if (wm) {
      const keys = [...wm.keys()].sort()
      for (const wkey of keys) {
        const agg = wm.get(wkey)
        if (agg && agg.pa > 0)
          rows.push(
            aggToRow("calendar_week", wkey, formatWeekRangeTueToSunFromTuesdayYmd(wkey), agg)
          )
      }
    }

    const payload = {
      schemaVersion: "phase17-player-season-batting-period-v0",
      seasonYear: year,
      yahooBatterId: bid,
      generatedAt: new Date().toISOString(),
      meta: {
        gameDateSource: "game.meta.documentTitle / ogTitle（YYYY年M月D日）",
        weekRule: "火曜始まり・日曜終わり（jstPeriodKeys）",
        battingAgg: "aggregateBattingForBatterInGameForProfiles（Phase11/12 と同一）",
      },
      source: {
        canonicalGames: docs.map((d) => d.gameId).sort(),
      },
      rows,
    }
    writeFileSync(join(outDir, `yahoo_${bid}.json`), JSON.stringify(payload, null, 2), "utf8")
  }

  console.log(`[phase17] wrote ${batterIds.length} files → ${outDir}`)
}

main()
