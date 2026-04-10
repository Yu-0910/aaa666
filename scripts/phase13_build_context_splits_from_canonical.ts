/**
 * Phase 13: canonical から試合コンテキスト別打撃スプリット（球場・対左右・チーム別・ホーム/ビジター）を生成する。
 *
 * 出力:
 *   _data/derived/player_season_batting_context/{year}/yahoo_{yahooBatterId}.json
 *
 * 使い方:
 *   npx tsx scripts/phase13_build_context_splits_from_canonical.ts --year 2026
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
import type { SeasonStatsRow } from "../lib/seasonStatsPilot"
import { findRosterPlayerByPublicId, getPlayerHandedness, getPlayerHandednessById } from "../lib/npbRoster"
import {
  invalidateYahooNpbBatterMapsCache,
  resolveNpbPlayerIdFromPublicId,
} from "../lib/yahooNpbBatterIdMap"
import { MANUAL_YAHOO_TO_NPB } from "../lib/yahooNpbBatterIdMap.manual"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

/** canonical に球場名が無い試合向け。必要に応じて追記する。 */
const GAME_STADIUM_SHORT_NAME: Record<string, string> = {
  "2021038624": "マツダ",
}

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

function splitLabelForRow(splitType: string, splitValue: string): string {
  if (splitType === "stadium") return splitValue
  if (splitType === "vs_hand") {
    if (splitValue === "R") return "対右投手"
    if (splitValue === "L") return "対左投手"
    return "対不明"
  }
  if (splitType === "home_away") return splitValue === "home" ? "ホーム" : "ビジター"
  if (splitType === "vs_team") return splitValue.replace(/^vs_/, "")
  return splitValue
}

function toSeasonStatsRow(splitType: string, splitValue: string, agg: Agg): SeasonStatsRow {
  const h1 = Math.max(0, agg.h - agg.h2 - agg.h3 - agg.hr)
  const avg = agg.ab > 0 ? agg.h / agg.ab : null
  const obpDen = agg.ab + agg.bb + agg.hbp + agg.sf
  const obp = obpDen > 0 ? (agg.h + agg.bb + agg.hbp) / obpDen : null
  const slg = agg.ab > 0 ? agg.tb / agg.ab : null
  const ops = obp != null ? obp + (agg.ab > 0 ? agg.tb / agg.ab : 0) : null
  const rispAvg = agg.risp_ab > 0 ? agg.risp_h / agg.risp_ab : null
  const sbPct = agg.sb + agg.cs > 0 ? agg.sb / (agg.sb + agg.cs) : null

  return {
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

function resolveStadiumName(gameId: string): string {
  return GAME_STADIUM_SHORT_NAME[gameId] ?? "未設定"
}

function resolvePitcherThrowHand(
  yahooPitcherId: string,
  yahooPlayersMentioned: Record<string, string>
): "R" | "L" | "unknown" {
  const pid = (yahooPitcherId ?? "").trim()
  if (!pid) return "unknown"

  const npbFromBridge = resolveNpbPlayerIdFromPublicId(pid)
  if (npbFromBridge && npbFromBridge !== pid) {
    const th = getPlayerHandednessById(npbFromBridge).throwHand
    if (th === "R" || th === "L") return th
  }

  const roster = findRosterPlayerByPublicId(pid)
  if (roster) {
    const th = getPlayerHandednessById(roster.npb_player_id).throwHand
    if (th === "R" || th === "L") return th
  }

  const name = yahooPlayersMentioned[pid]
  if (name) {
    const th = getPlayerHandedness(name.trim()).throwHand
    if (th === "R" || th === "L") return th
  }

  return "unknown"
}

type PaContext = {
  stadium: string
  vsHand: "R" | "L" | "unknown"
  vsTeamValue: string
  homeAway: "home" | "visitor"
}

function getPaContext(
  doc: CanonicalGameDocument,
  pa: PlateAppearance,
  yahooPlayersMentioned: Record<string, string>
): PaContext | null {
  const sb = doc.game.scoreboard
  if (sb.length < 2) return null
  const visitorName = (sb[0].teamName ?? "").trim()
  const homeName = (sb[1].teamName ?? "").trim()
  if (!visitorName || !homeName) return null

  const half = (pa.inningHalf ?? "").trim()
  const isTop = /表/.test(half)
  const isBottom = /裏/.test(half)
  if (!isTop && !isBottom) return null

  const opponent = isTop ? homeName : visitorName
  const stadium = resolveStadiumName(doc.gameId)
  const vsHand = resolvePitcherThrowHand((pa.yahooPitcherId ?? "").trim(), yahooPlayersMentioned)
  const homeAway: "home" | "visitor" = isTop ? "visitor" : "home"

  return {
    stadium,
    vsHand,
    vsTeamValue: `vs_${opponent}`,
    homeAway,
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
  invalidateYahooNpbBatterMapsCache()
  const docs = loadCanonicalFiles()
  if (docs.length === 0) {
    console.error("[phase13] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

  /** batterId -> ( "splitType\tsplitValue" -> Agg ) */
  const byBatter = new Map<string, Map<string, Agg>>()

  for (const doc of docs) {
    const gameId = doc.gameId
    const mentioned = doc.game.yahooPlayersMentioned ?? {}
    for (const pa of doc.domain.plateAppearances ?? []) {
      const bid = (pa.yahooBatterId ?? "").trim()
      if (!bid) continue
      const ctx = getPaContext(doc, pa, mentioned)
      if (!ctx) continue

      const m = byBatter.get(bid) ?? new Map<string, Agg>()
      const dims: [string, string][] = [
        ["stadium", ctx.stadium],
        ["vs_hand", ctx.vsHand === "unknown" ? "unknown" : ctx.vsHand],
        ["vs_team", ctx.vsTeamValue],
        ["home_away", ctx.homeAway],
      ]
      for (const [splitType, splitValue] of dims) {
        const key = `${splitType}\t${splitValue}`
        const agg = m.get(key) ?? emptyAgg()
        updateFromPa(agg, gameId, pa)
        m.set(key, agg)
      }
      byBatter.set(bid, m)
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
      schemaVersion: "phase13-player-context-batting-v0",
      seasonYear: year,
      yahooBatterId: bid,
      generatedAt: new Date().toISOString(),
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
