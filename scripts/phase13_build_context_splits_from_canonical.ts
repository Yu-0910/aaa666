/**
 * Phase 13: canonical から試合コンテキスト別打撃スプリット（球場・チーム別・ホーム/ビジター）を生成する。
 * 対左右は Phase 15 に統一。
 *
 * **集計 SSOT**: Phase11 / Phase12 と同一（`aggregateBattingForBatterInGameForProfiles`）。
 * 試合×打者ごとに出場末尾列 / hybrid 行を正とし、その試合の対戦相手・ホーム/ビジターへ **1 回だけ** 加算する。
 * plateAppearances の打席単位ループは使わない（二重計上・一球ログ乖離を防ぐ）。
 *
 * 出力:
 *   _data/derived/player_season_batting_context/{year}/yahoo_{yahooBatterId}.json
 *
 * 球場名: Phase 0 日程（`stadiumByGameId`）。日程に無い canonical は対戦表記から補完（本拠地 / 地方球場）。
 * score ページの yahoo_game_meta は使わない（日程取得と同一 HTML で足りる）。
 *
 * 使い方:
 *   npx tsx scripts/phase13_build_context_splits_from_canonical.ts --year 2026
 */

import { normalizeStadiumSplitValue } from "@/lib/stadiumVenueNormalize"
import {
  resolveGameContextForBatter,
  type BatterGameContextSplit,
} from "@/lib/yahooGame/batterGameContextFromCanonical"
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import type { SeasonStatsRow } from "../lib/seasonStatsPilot"
import { enrichSeasonStatsRowSabermetrics } from "../lib/seasonStatsPilotShared"
import {
  aggregateBattingForBatterInGameForProfiles,
  emptyBattingSeasonAggYahoo,
  mergeBattingSeasonAggYahoo,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { battingSlashRatesFromCounts, slashRate3FromCounts } from "../lib/battingRateFormat"
import { battingSeasonAggSource } from "../lib/yahooGame/battingSeasonAggSourceFeatureFlag"
import { dedupePlateAppearancesByInningHalfOrder } from "../lib/yahooGame/dedupePlateAppearances"
import { invalidateYahooNpbBatterMapsCache } from "../lib/yahooNpbBatterIdMap"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { injectTeamsFromTextPbpIfMissing } from "../lib/yahooGame/inferTeamsFromTextPbp"
import { loadScheduleStadiumByGameId } from "../lib/loadScheduleStadiumByGameId"

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

function splitLabelForRow(splitType: string, splitValue: string): string {
  if (splitType === "stadium") return normalizeStadiumSplitValue(splitValue)
  if (splitType === "home_away") return splitValue === "home" ? "ホーム" : "ビジター"
  if (splitType === "vs_team") return splitValue.replace(/^vs_/, "")
  return splitValue
}

function toSeasonStatsRow(splitType: string, splitValue: string, agg: BattingSeasonAggYahoo): SeasonStatsRow {
  const h1 = Math.max(0, agg.h - agg.h2 - agg.h3 - agg.hr)
  const slash = battingSlashRatesFromCounts(agg)
  const risp_avg = slashRate3FromCounts(agg.risp_h, agg.risp_ab)
  const sbPct = agg.sb + agg.cs > 0 ? agg.sb / (agg.sb + agg.cs) : null

  return enrichSeasonStatsRowSabermetrics({
    split_type: splitType,
    split_value: splitValue,
    split_label: splitLabelForRow(splitType, splitValue),
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

function collectBatterIdsInGame(doc: CanonicalGameDocument): Set<string> {
  const ids = new Set<string>()
  for (const line of doc.domain?.battingLines ?? []) {
    const bid = String(line.yahooPlayerId ?? "").trim()
    if (bid) ids.add(bid)
  }
  for (const row of doc.game?.statsPlayerLinkedRows ?? []) {
    const bid = String(row.yahooPlayerId ?? "").trim()
    if (bid) ids.add(bid)
  }
  const pas = dedupePlateAppearancesByInningHalfOrder(
    doc.domain?.plateAppearances ?? [],
    doc.gameId,
  )
  for (const pa of pas) {
    const bid = String(pa.yahooBatterId ?? "").trim()
    if (bid) ids.add(bid)
  }
  return ids
}

function addGameAggToSplits(
  byBatter: Map<string, Map<string, BattingSeasonAggYahoo>>,
  bid: string,
  ctx: BatterGameContextSplit,
  gameAgg: BattingSeasonAggYahoo,
): void {
  const m = byBatter.get(bid) ?? new Map<string, BattingSeasonAggYahoo>()
  const dims: [string, string][] = [
    ["stadium", ctx.stadium],
    ["vs_team", ctx.vsTeamValue],
    ["home_away", ctx.homeAway],
  ]
  for (const [splitType, splitValue] of dims) {
    const key = `${splitType}\t${splitValue}`
    const agg = m.get(key) ?? emptyBattingSeasonAggYahoo()
    mergeBattingSeasonAggYahoo(agg, gameAgg)
    m.set(key, agg)
  }
  byBatter.set(bid, m)
}

function main(): void {
  const { year } = parseArgs()
  invalidateYahooNpbBatterMapsCache()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  if (docs.length === 0) {
    console.error("[phase13] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

  const aggSource = battingSeasonAggSource()
  console.log(`[phase13] battingSeasonAggSource=${aggSource} (Phase11 と同一)`)

  const stadiumByGameId = loadScheduleStadiumByGameId(year, projectRoot)
  const canonicalIds = new Set(docs.map((d) => String(d.gameId ?? "").trim()))
  let missingStadium = 0
  for (const gid of canonicalIds) {
    if (gid && !stadiumByGameId.has(gid)) missingStadium++
  }
  console.log(
    `[phase13] stadiumByGameId: ${stadiumByGameId.size} entries, canonical games missing stadium: ${missingStadium}/${canonicalIds.size}`,
  )
  if (missingStadium > 0) {
    console.warn(
      "[phase13] WARN: 球場未設定の試合があります。Phase0 日程の再取得、または canonical の対戦表記（タイトル）を確認してください。",
    )
  }

  /** batterId -> ( "splitType\tsplitValue" -> Agg ) */
  const byBatter = new Map<string, Map<string, BattingSeasonAggYahoo>>()

  for (const baseDoc of docs) {
    const doc = injectTeamsFromTextPbpIfMissing(baseDoc)
    const batterIds = collectBatterIdsInGame(doc)

    for (const bid of batterIds) {
      const gameAgg = aggregateBattingForBatterInGameForProfiles(doc, bid)
      if (!gameAgg) continue

      const ctx = resolveGameContextForBatter(doc, bid, stadiumByGameId)
      if (!ctx) continue

      addGameAggToSplits(byBatter, bid, ctx, gameAgg)
    }
  }

  const outDir = join(projectRoot, "_data", "derived", "player_season_batting_context", year)
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

  const batterIds = [...byBatter.keys()].sort()
  for (const bid of batterIds) {
    const m = byBatter.get(bid)!
    const rows: SeasonStatsRow[] = []
    const keys = [...m.keys()].sort((a, b) => {
      const [ta, va] = a.split("\t")
      const [tb, vb] = b.split("\t")
      if (ta !== tb) return ta.localeCompare(tb)
      return va.localeCompare(vb)
    })
    for (const k of keys) {
      const tab = k.indexOf("\t")
      const splitType = tab >= 0 ? k.slice(0, tab) : k
      const splitValue = tab >= 0 ? k.slice(tab + 1) : ""
      const agg = m.get(k)!
      rows.push(toSeasonStatsRow(splitType, splitValue, agg))
    }

    const payload = {
      schemaVersion: "phase13-player-context-batting-v1",
      seasonYear: year,
      yahooBatterId: bid,
      generatedAt: new Date().toISOString(),
      meta: {
        battingSeasonAggSource: aggSource,
        aggregationNote:
          "試合×打者を Phase11 と同じ aggregateBattingForBatterInGameForProfiles で集計し、対戦相手・球場・ホーム/ビジターに振り分ける。球場名は Phase0 日程表（stadiumByGameId）。PA 単位の二重加算はしない。",
        stadiumByGameIdSource: `_data/sportsnavi_schedule_index/season_${year}.json`,
      },
      source: {
        canonicalGames: docs.map((d) => d.gameId).sort(),
      },
      rows,
    }
    writeFileSync(join(outDir, `yahoo_${bid}.json`), JSON.stringify(payload, null, 2), "utf8")
  }

  console.log(`[phase13] wrote ${batterIds.length} files → ${outDir}`)
}

main()
