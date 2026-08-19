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

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "fs"
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
import { extractCanonicalGameYmd } from "../lib/yahooGame/loadCanonicalGames"
import { battingSlashRatesFromCounts, slashRate3FromCounts } from "../lib/battingRateFormat"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

type Phase17Payload = {
  schemaVersion?: string
  seasonYear?: string
  yahooBatterId?: string
  generatedAt?: string
  source?: {
    canonicalGames?: string[]
  }
  rows?: SeasonStatsRow[]
}

function parseArgs(): { year: string; from: string | null; to: string | null; onlyYahooIds: string[] | null } {
  const args = process.argv.slice(2)
  let year = "2026"
  let from: string | null = null
  let to: string | null = null
  let onlyYahooIds: string[] | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    } else if (args[i] === "--from" && args[i + 1]) {
      from = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--to" && args[i + 1]) {
      to = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--only-yahoo-ids" && args[i + 1]) {
      onlyYahooIds = String(args[i + 1])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    }
  }
  return { year, from, to, onlyYahooIds }
}

function isYmd(s: string | null): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
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
  for (const pa of doc.domain.plateAppearances ?? []) {
    const bid = String(pa.yahooBatterId ?? "").trim()
    if (bid) ids.add(bid)
  }
  return ids
}

function collectAffectedBatterIds(
  docs: CanonicalGameDocument[],
  from: string | null,
  to: string | null,
): string[] {
  const ids = new Set<string>()
  for (const doc of docs) {
    const ymd = extractCanonicalGameYmd(doc)
    if (!ymd) continue
    if (from && ymd < from) continue
    if (to && ymd > to) continue
    for (const bid of collectBatterIdsInGame(doc)) ids.add(bid)
  }
  return [...ids].sort()
}

function gameHasTargetBatter(doc: CanonicalGameDocument, targetYahooIdSet: Set<string> | null): boolean {
  if (!targetYahooIdSet) return true
  for (const bid of collectBatterIdsInGame(doc)) {
    if (targetYahooIdSet.has(bid)) return true
  }
  return false
}

function monthLabel(mk: string): string {
  const m = mk.match(/^(\d{4})-(\d{2})$/)
  if (!m) return mk
  return `${parseInt(m[2], 10)}月`
}

function sortPeriodRows(rows: readonly SeasonStatsRow[]): SeasonStatsRow[] {
  return [...rows].sort((a, b) => {
    if (a.split_type !== b.split_type) {
      if (a.split_type === "calendar_month") return -1
      if (b.split_type === "calendar_month") return 1
    }
    return String(a.split_value ?? "").localeCompare(String(b.split_value ?? ""))
  })
}

function readExistingPhase17Rows(outDir: string, yahooId: string): SeasonStatsRow[] {
  const filePath = join(outDir, `yahoo_${yahooId}.json`)
  if (!existsSync(filePath)) return []
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as Phase17Payload
    return Array.isArray(raw.rows) ? raw.rows : []
  } catch {
    return []
  }
}

function readExistingPhase17MetaGames(outDir: string): string[] {
  const metaPath = join(outDir, "_meta.json")
  if (!existsSync(metaPath)) return []
  try {
    const raw = JSON.parse(readFileSync(metaPath, "utf8")) as Phase17Payload
    return Array.isArray(raw.source?.canonicalGames)
      ? raw.source.canonicalGames.map((v) => String(v).trim()).filter(Boolean)
      : []
  } catch {
    return []
  }
}

function main(): void {
  const { year, from, to, onlyYahooIds } = parseArgs()
  if ((from && !isYmd(from)) || (to && !isYmd(to))) {
    console.error("[phase17] invalid --from/--to. expected YYYY-MM-DD")
    process.exit(1)
  }
  const isIncrementalRange = Boolean(from || to)
  const docs = loadCanonicalGamesMergedForDerivedPipeline(
    projectRoot,
    isIncrementalRange ? { year, from: from ?? undefined, to: to ?? undefined } : { year }
  )
  if (docs.length === 0) {
    console.error("[phase17] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

  let targetYahooIds = onlyYahooIds ? [...onlyYahooIds] : null
  if (!targetYahooIds && (from || to)) {
    targetYahooIds = collectAffectedBatterIds(docs, from, to)
    if (targetYahooIds.length === 0) {
      console.log(
        `[phase17] no affected batters for range ${from ?? "(start)"}..${to ?? "(end)"} in year=${year}; nothing to write`,
      )
      return
    }
  }
  const targetYahooIdSet = targetYahooIds ? new Set(targetYahooIds) : null

  const generatedAt = new Date().toISOString()
  const canonicalGames = docs.map((d) => d.gameId).sort()
  const byBatterMonth = new Map<string, Map<string, BattingSeasonAggYahoo>>()
  const byBatterWeek = new Map<string, Map<string, BattingSeasonAggYahoo>>()
  const touchedMonthKeys = new Set<string>()
  const touchedWeekKeys = new Set<string>()

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
    if (!gameHasTargetBatter(doc, targetYahooIdSet)) continue
    const ymd = parseGameDateYmdFromCanonical(doc)
    if (!ymd) continue
    const mk = monthKeyFromYmd(ymd)
    const wk = tuesdayWeekKeyFromYmd(ymd)
    if (!wk) continue
    touchedMonthKeys.add(mk)
    touchedWeekKeys.add(wk)

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
      if (targetYahooIdSet && !targetYahooIdSet.has(bid)) continue
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
  const touchedMonthKeySet = new Set(touchedMonthKeys)
  const touchedWeekKeySet = new Set(touchedWeekKeys)

  if (!isIncrementalRange) {
    for (const f of readdirSync(outDir)) {
      if (f.startsWith("yahoo_") && f.endsWith(".json")) {
        const yid = f.replace(/^yahoo_/, "").replace(/\.json$/, "")
        if (targetYahooIds && !targetYahooIds.includes(yid)) continue
        try {
          unlinkSync(join(outDir, f))
        } catch {
          // ignore
        }
      }
    }
  }

  const allIds = new Set<string>([...byBatterMonth.keys(), ...byBatterWeek.keys()])
  const batterIds = (targetYahooIds ?? [...allIds]).slice().sort()

  for (const bid of batterIds) {
    const existingRows = isIncrementalRange ? readExistingPhase17Rows(outDir, bid) : []
    const rows: SeasonStatsRow[] = isIncrementalRange
      ? existingRows.filter((row) => {
          if (row.split_type === "calendar_month") {
            return !touchedMonthKeySet.has(String(row.split_value ?? ""))
          }
          if (row.split_type === "calendar_week") {
            return !touchedWeekKeySet.has(String(row.split_value ?? ""))
          }
          return true
        })
      : []
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
    const mergedRows = sortPeriodRows(rows)

    const payload = {
      schemaVersion: "phase17-player-season-batting-period-v0",
      seasonYear: year,
      yahooBatterId: bid,
      generatedAt,
      meta: {
        gameDateSource: "game.meta.documentTitle / ogTitle（YYYY年M月D日）",
        weekRule: "火曜始まり・日曜終わり（jstPeriodKeys）",
        battingAgg: "aggregateBattingForBatterInGameForProfiles（Phase11/12 と同一）",
      },
      source: {
        canonicalGames: isIncrementalRange
          ? [...new Set([...readExistingPhase17MetaGames(outDir), ...canonicalGames])].sort()
          : canonicalGames,
      },
      rows: mergedRows,
    }
    writeJsonFileWithRetrySync(join(outDir, `yahoo_${bid}.json`), payload)
  }

  const metaPayload = {
    schemaVersion: "phase17-player-season-batting-period-meta-v0",
    seasonYear: year,
    generatedAt,
    source: {
      canonicalGames: isIncrementalRange
        ? [...new Set([...readExistingPhase17MetaGames(outDir), ...canonicalGames])].sort()
        : canonicalGames,
    },
    writtenPlayerFiles: batterIds.length,
  }
  writeJsonFileWithRetrySync(join(outDir, "_meta.json"), metaPayload)

  console.log(
    `[phase17] wrote ${batterIds.length} files → ${outDir}${from || to ? ` (range=${from ?? "(start)"}..${to ?? "(end)"})` : ""}`,
  )
}

main()
