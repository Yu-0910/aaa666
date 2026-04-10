/**
 * Phase 11 (batting, minimal): canonical (Phase 10) から打者別の通算行を一括生成する。
 *
 * 出力（SSOT は canonical。これは派生の計算済みJSON）:
 *   _data/derived/player_season_batting/{year}/yahoo_{yahooBatterId}.json
 *
 * 使い方:
 *   npx tsx scripts/phase11_build_season_stats_from_canonical.ts --year 2026
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
import { enrichSeasonStatsRowSabermetrics } from "../lib/seasonStatsPilotShared"
import type { CanonicalGameDocument, PlateAppearance, PitchEvent } from "../lib/yahooGame/types"
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
  // 「打撃妨害」などは将来拡張。現状は AB に含めない扱いに寄せる
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

function toSeasonStatsRow(agg: Agg): SeasonStatsRow {
  const h1 = Math.max(0, agg.h - agg.h2 - agg.h3 - agg.hr)
  const avg = agg.ab > 0 ? agg.h / agg.ab : null
  const obpDen = agg.ab + agg.bb + agg.hbp + agg.sf
  const obp = obpDen > 0 ? (agg.h + agg.bb + agg.hbp) / obpDen : null
  const slg = agg.ab > 0 ? agg.tb / agg.ab : null
  const ops = obp != null ? obp + (agg.ab > 0 ? agg.tb / agg.ab : 0) : null
  const rispAvg = agg.risp_ab > 0 ? agg.risp_h / agg.risp_ab : null
  const sbPct = agg.sb + agg.cs > 0 ? agg.sb / (agg.sb + agg.cs) : null

  // SeasonStatsPilot が期待する全フィールドを埋める（未計算は 0 / ".000"）
  return {
    split_type: "total",
    split_value: "total",
    split_label: "通算",
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
    slg: fmtSlash3(slg),
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

function main(): void {
  const { year } = parseArgs()
  const docs = loadCanonicalFiles()
  if (docs.length === 0) {
    console.error("[phase11] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

  const byBatter = new Map<string, Agg>()
  for (const doc of docs) {
    const gameId = doc.gameId
    for (const pa of doc.domain.plateAppearances ?? []) {
      const bid = (pa.yahooBatterId ?? "").trim()
      if (!bid) continue
      const agg = byBatter.get(bid) ?? emptyAgg()
      updateFromPa(agg, gameId, pa)
      byBatter.set(bid, agg)
    }
  }

  const outDir = join(projectRoot, "_data", "derived", "player_season_batting", year)
  mkdirSync(outDir, { recursive: true })

  // 生成物は「canonical から再計算可能な派生」なので、毎回クリーンに作り直す。
  // 以前の実行で誤った打者ID（例: 投手ID）が出力されていた場合、ここで削除しないと残骸が混ざる。
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
    const agg = byBatter.get(bid)!
    const row = enrichSeasonStatsRowSabermetrics(toSeasonStatsRow(agg))
    const payload = {
      schemaVersion: "phase11-player-season-batting-v0",
      seasonYear: year,
      yahooBatterId: bid,
      generatedAt: new Date().toISOString(),
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

