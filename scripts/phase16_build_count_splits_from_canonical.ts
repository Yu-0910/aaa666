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

import { mkdirSync, readdirSync, unlinkSync } from "fs"
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
import { extractCanonicalGameYmd } from "../lib/yahooGame/loadCanonicalGames"
import { battingSlashRatesFromCounts, slashRate3FromCounts } from "../lib/battingRateFormat"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { isRegularSeasonCanonicalGame } from "../lib/npbRegularSeason"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

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

function collectBatterIdsInGame(doc: CanonicalGameDocument): Set<string> {
  const ids = new Set<string>()
  for (const pa of doc.domain.plateAppearances ?? []) {
    const bid = String(pa.yahooBatterId ?? "").trim()
    if (bid) ids.add(bid)
  }
  for (const line of doc.domain?.battingLines ?? []) {
    const bid = String(line.yahooPlayerId ?? "").trim()
    if (bid) ids.add(bid)
  }
  for (const row of doc.game?.statsPlayerLinkedRows ?? []) {
    const bid = String(row.yahooPlayerId ?? "").trim()
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
  const { year, from, to, onlyYahooIds } = parseArgs()
  if ((from && !isYmd(from)) || (to && !isYmd(to))) {
    console.error("[phase16] invalid --from/--to. expected YYYY-MM-DD")
    process.exit(1)
  }
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year }).filter((doc) => {
    const ymd = extractCanonicalGameYmd(doc)
    const title = doc.game?.meta?.documentTitle
    return Boolean(ymd && isRegularSeasonCanonicalGame(year, ymd, title))
  })
  if (docs.length === 0) {
    console.error("[phase16] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

  let targetYahooIds = onlyYahooIds ? [...onlyYahooIds] : null
  if (!targetYahooIds && (from || to)) {
    targetYahooIds = collectAffectedBatterIds(docs, from, to)
    if (targetYahooIds.length === 0) {
      console.log(
        `[phase16] no affected batters for range ${from ?? "(start)"}..${to ?? "(end)"} in year=${year}; nothing to write`,
      )
      return
    }
  }
  const targetYahooIdSet = targetYahooIds ? new Set(targetYahooIds) : null

  const byBatterCount = new Map<string, Map<string, BattingSeasonAggYahoo>>()

  function ensureCountMap(bid: string): Map<string, BattingSeasonAggYahoo> {
    let m = byBatterCount.get(bid)
    if (!m) {
      m = new Map()
      byBatterCount.set(bid, m)
    }
    return m
  }

  function applyGameRbiReconcileFromBattingLines(
    doc: CanonicalGameDocument,
    inferredRbiByBid: Map<string, number>,
    lastCountKeyInGameByBid: Map<string, string>,
  ): void {
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = String(line.yahooPlayerId ?? "").trim()
      if (!bid) continue
      if (targetYahooIdSet && !targetYahooIdSet.has(bid)) continue
      const lineRbi = line.rbi ?? 0
      const inferred = inferredRbiByBid.get(bid) ?? 0
      const delta = lineRbi - inferred
      if (delta === 0) continue

      const countKey = lastCountKeyInGameByBid.get(bid)
      if (!countKey) continue
      const countMap = byBatterCount.get(bid)
      if (!countMap) continue
      const agg = countMap.get(countKey) ?? emptyBattingSeasonAggYahoo()
      agg.rbi += delta
      countMap.set(countKey, agg)
      inferredRbiByBid.set(bid, lineRbi)
    }
  }

  for (const doc of docs) {
    if (!gameHasTargetBatter(doc, targetYahooIdSet)) continue
    const gameId = doc.gameId
    const pas = dedupePlateAppearancesByInningHalfOrder(
      doc.domain.plateAppearances ?? [],
      gameId,
    )
    const scoreCtxByPaId = buildScoreBasesContextByPaId(
      pas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(projectRoot, doc.gameId),
    )
    const inferredRbiInGame = new Map<string, number>()
    const lastCountKeyInGame = new Map<string, string>()
    for (const pa of pas) {
      const bid = (pa.yahooBatterId ?? "").trim()
      if (!bid) continue
      if (targetYahooIdSet && !targetYahooIdSet.has(bid)) continue
      const resolvedResultText = plateAppearanceResolvedResultText(doc, pa).trim()
      const fallbackResultText = plateAppearanceResultTextFromPitchOnly(pa).trim()
      const resultText = resolvedResultText || fallbackResultText
      if (!resultText) continue
      const ck = pitchCountKeyForPlateAppearance(pa.pitchEvents, resultText)
      if (!ck) continue
      const cm = ensureCountMap(bid)
      const agg = cm.get(ck) ?? emptyBattingSeasonAggYahoo()
      const rbiBefore = agg.rbi
      if (resolvedResultText) {
        updateBattingAggFromPa(agg, gameId, pa, doc)
      } else {
        agg.gameIds.add(gameId)
        agg.pa += 1
        updateBattingAggFromResultJa(agg, resultText)
      }
      const scoreCtx = scoreCtxByPaId.get(pa.paId)
      if (scoreCtx?.resultBallClass != null && scoreCtx.resultBallRbi != null) {
        agg.rbi += scoreCtx.resultBallRbi
      }
      cm.set(ck, agg)
      lastCountKeyInGame.set(bid, ck)
      inferredRbiInGame.set(bid, (inferredRbiInGame.get(bid) ?? 0) + (agg.rbi - rbiBefore))
    }
    applyGameRbiReconcileFromBattingLines(doc, inferredRbiInGame, lastCountKeyInGame)
  }

  const outDir = join(projectRoot, "_data", "derived", "player_season_batting_count", year)
  mkdirSync(outDir, { recursive: true })

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

  const batterIds = (targetYahooIds ?? [...byBatterCount.keys()]).slice().sort()
  for (const bid of batterIds) {
    const cm = byBatterCount.get(bid)
    if (!cm) continue
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
    writeJsonFileWithRetrySync(join(outDir, `yahoo_${bid}.json`), payload)
  }

  console.log(
    `[phase16] wrote ${batterIds.length} files → ${outDir}${from || to ? ` (range=${from ?? "(start)"}..${to ?? "(end)"})` : ""}`,
  )
}

main()
