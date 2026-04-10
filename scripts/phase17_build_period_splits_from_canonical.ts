/**
 * Phase 17: 試合開催日（canonical タイトルから）で暦月・火曜始まり週別の打撃スプリットを生成する。
 *
 * 出力:
 *   _data/derived/player_season_batting_period/{year}/yahoo_{yahooBatterId}.json
 *
 * 使い方:
 *   npx tsx scripts/phase17_build_period_splits_from_canonical.ts --year 2026
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { isWalkLikeResultText } from "../lib/baseballWalkResult"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"
import { parseGameDateYmdFromCanonical } from "../lib/yahooGame/gameDateFromCanonical"
import {
  monthKeyFromYmd,
  tuesdayWeekKeyFromYmd,
  formatWeekRangeTueToSunFromTuesdayYmd,
} from "../lib/yahooGame/jstPeriodKeys"
import type { SeasonStatsRow } from "../lib/seasonStatsPilot"

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

function fmtSlash3(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return ".000"
  const s = n.toFixed(3)
  return s.startsWith("0") ? s.slice(1) : s
}

function lastPitchResult(pa: PlateAppearance): string {
  const pe = pa.pitchEvents ?? []
  const last = pe.length > 0 ? pe[pe.length - 1] : null
  return (
    (pa.resultSummaryJa ?? "").trim() ||
    ((last?.resultJa ?? "") as string).trim() ||
    ""
  )
}

function isStrikeout(result: string): boolean {
  return /三振|空三振|見三振/.test(result) || /^(空振り|見逃し)/.test(result)
}
function isHbp(result: string): boolean {
  return /死球/.test(result)
}
function isSacBunt(result: string): boolean {
  return /犠打|送りバント/.test(result)
}
function isSacFly(result: string): boolean {
  return /犠飛/.test(result)
}
function isGidp(result: string): boolean {
  return /併殺/.test(result)
}

function hitBases(result: string): 0 | 1 | 2 | 3 | 4 {
  if (/本塁打|ホームラン|HR/.test(result)) return 4
  if (/三塁打/.test(result)) return 3
  if (/二塁打/.test(result)) return 2
  if (/安打|ヒット|左安|中安|右安/.test(result)) return 1
  return 0
}

function isAtBat(result: string): boolean {
  if (!result) return false
  if (isWalkLikeResultText(result) || isHbp(result) || isSacBunt(result) || isSacFly(result)) return false
  if (/妨害/.test(result)) return false
  return true
}

type Agg = {
  gameIds: Set<string>
  pa: number
  ab: number
  r: number
  h: number
  h2: number
  h3: number
  hr: number
  tb: number
  rbi: number
  so: number
  bb: number
  ibb: number
  hbp: number
  sh: number
  sf: number
  sb: number
  cs: number
  gidp: number
  risp_ab: number
  risp_h: number
}

function emptyAgg(): Agg {
  return {
    gameIds: new Set(),
    pa: 0,
    ab: 0,
    r: 0,
    h: 0,
    h2: 0,
    h3: 0,
    hr: 0,
    tb: 0,
    rbi: 0,
    so: 0,
    bb: 0,
    ibb: 0,
    hbp: 0,
    sh: 0,
    sf: 0,
    sb: 0,
    cs: 0,
    gidp: 0,
    risp_ab: 0,
    risp_h: 0,
  }
}

function updateFromPa(agg: Agg, gameId: string, pa: PlateAppearance): void {
  agg.gameIds.add(gameId)
  agg.pa += 1
  const result = lastPitchResult(pa)
  if (isWalkLikeResultText(result)) agg.bb += 1
  if (isHbp(result)) agg.hbp += 1
  if (isSacBunt(result)) agg.sh += 1
  if (isSacFly(result)) agg.sf += 1
  if (isStrikeout(result)) agg.so += 1
  if (isGidp(result)) agg.gidp += 1

  if (isAtBat(result)) {
    agg.ab += 1
    const bases = hitBases(result)
    if (bases > 0) agg.h += 1
    if (bases === 2) agg.h2 += 1
    if (bases === 3) agg.h3 += 1
    if (bases === 4) agg.hr += 1
    agg.tb += bases
  }
}

function aggToRow(
  split_type: "calendar_month" | "calendar_week",
  split_value: string,
  split_label: string,
  agg: Agg
): SeasonStatsRow {
  const h1 = Math.max(0, agg.h - agg.h2 - agg.h3 - agg.hr)
  const avg = agg.ab > 0 ? agg.h / agg.ab : null
  const obpDen = agg.ab + agg.bb + agg.hbp + agg.sf
  const obp = obpDen > 0 ? (agg.h + agg.bb + agg.hbp) / obpDen : null
  const ops = obp != null ? obp + (agg.ab > 0 ? agg.tb / agg.ab : 0) : null
  const rispAvg = agg.risp_ab > 0 ? agg.risp_h / agg.risp_ab : null
  const sbPct = agg.sb + agg.cs > 0 ? agg.sb / (agg.sb + agg.cs) : null

  return {
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
    gidp: agg.gidp,
    avg: fmtSlash3(avg),
    obp: fmtSlash3(obp),
    slg: fmtSlash3(agg.ab > 0 ? agg.tb / agg.ab : null),
    ops: fmtSlash3(ops),
    risp_avg: fmtSlash3(rispAvg),
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
  }
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
  const docs = loadCanonicalFiles()
  if (docs.length === 0) {
    console.error("[phase17] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

  const byBatterMonth = new Map<string, Map<string, Agg>>()
  const byBatterWeek = new Map<string, Map<string, Agg>>()

  function ensureMonthMap(bid: string): Map<string, Agg> {
    let m = byBatterMonth.get(bid)
    if (!m) {
      m = new Map()
      byBatterMonth.set(bid, m)
    }
    return m
  }
  function ensureWeekMap(bid: string): Map<string, Agg> {
    let m = byBatterWeek.get(bid)
    if (!m) {
      m = new Map()
      byBatterWeek.set(bid, m)
    }
    return m
  }

  for (const doc of docs) {
    const gameId = doc.gameId
    const ymd = parseGameDateYmdFromCanonical(doc)
    if (!ymd) continue
    const mk = monthKeyFromYmd(ymd)
    const wk = tuesdayWeekKeyFromYmd(ymd)
    if (!wk) continue

    for (const pa of doc.domain.plateAppearances ?? []) {
      const bid = (pa.yahooBatterId ?? "").trim()
      if (!bid) continue
      const mm = ensureMonthMap(bid)
      const wm = ensureWeekMap(bid)
      const ma = mm.get(mk) ?? emptyAgg()
      updateFromPa(ma, gameId, pa)
      mm.set(mk, ma)
      const wa = wm.get(wk) ?? emptyAgg()
      updateFromPa(wa, gameId, pa)
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
