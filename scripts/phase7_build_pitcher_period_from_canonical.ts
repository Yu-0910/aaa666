/**
 * Phase 7（pitcher_personal_page_season_headings_plan）: 投手の暦月・火曜始まり週別の投球成績を canonical から生成する。
 * 週境界は野手の phase17（jstPeriodKeys）と同一。
 *
 * 出力:
 *   _data/derived/player_season_pitching_period/{year}/npb_{npbPlayerId}.json
 *
 * 使い方:
 *   npx tsx scripts/phase7_build_pitcher_period_from_canonical.ts --year 2026
 *
 * canonical 入力は `loadCanonicalGamesMergedForDerivedPipeline`（Phase11 と同一: 一球マージ済み）。
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
} from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument, PitchingLine } from "../lib/yahooGame/types"
import { yahooPitcherIdForVsHandFromPa } from "../lib/yahooGame/yahooPitcherIdForVsHandFromPa"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { parseGameDateYmdFromCanonical } from "../lib/yahooGame/gameDateFromCanonical"
import {
  monthKeyFromYmd,
  tuesdayWeekKeyFromYmd,
  formatWeekRangeTueToSunFromTuesdayYmd,
} from "../lib/yahooGame/jstPeriodKeys"
import {
  comparePlateAppearances,
  resolveNpbForPitcherLine,
} from "../lib/yahooGame/pitcherPocHelpers"
import { parseRosterCsv } from "../lib/yahooGame/rosterCsv"
import { addPitcherPaCount, fmtAvg, lastPitchResult } from "../lib/yahooGame/pitcherPaResultCommon"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; from: string | null; to: string | null; onlyNpbIds: string[] | null } {
  const args = process.argv.slice(2)
  let year = "2026"
  let from: string | null = null
  let to: string | null = null
  let onlyNpbIds: string[] | null = null
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
    } else if (args[i] === "--only-npb-ids" && args[i + 1]) {
      onlyNpbIds = String(args[i + 1])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    }
  }
  return { year, from, to, onlyNpbIds }
}

function ipToOuts(ip: string | undefined): number {
  if (!ip) return 0
  const t = ip.trim()
  if (!t) return 0
  if (t.includes(".")) {
    const [w, frac] = t.split(".")
    const whole = parseInt(w, 10) || 0
    const f = parseInt(frac ?? "0", 10) || 0
    return whole * 3 + Math.min(2, f)
  }
  const n = parseInt(t, 10)
  return Number.isFinite(n) ? n * 3 : 0
}

function outsToIpDisplay(outs: number): string {
  if (outs <= 0) return "0"
  const w = Math.floor(outs / 3)
  const f = outs % 3
  if (f === 0) return String(w)
  return `${w}.${f}`
}

type MergedPitching = {
  yahooPlayerId: string
  playerName: string
  wins: number
  losses: number
  outs: number
  bf: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  bk: number
  r: number
  er: number
  pitches: number
}

function mergePitchingLines(lines: PitchingLine[]): Map<string, MergedPitching> {
  const byYahoo = new Map<string, MergedPitching>()
  for (const pl of lines) {
    const yid = (pl.yahooPlayerId ?? "").trim()
    if (!yid) continue
    const bf = pl.bf
    const ip = pl.ip
    if (bf == null && !ip) continue

    let m = byYahoo.get(yid)
    if (!m) {
      m = {
        yahooPlayerId: yid,
        playerName: pl.playerName,
        wins: 0,
        losses: 0,
        outs: 0,
        bf: 0,
        h: 0,
        hr: 0,
        so: 0,
        bb: 0,
        hbp: 0,
        bk: 0,
        r: 0,
        er: 0,
        pitches: 0,
      }
      byYahoo.set(yid, m)
    }
    if (pl.decision === "win") m.wins += 1
    else if (pl.decision === "loss") m.losses += 1
    m.outs += ipToOuts(pl.ip)
    m.bf += pl.bf ?? 0
    m.h += pl.h ?? 0
    m.hr += pl.hr ?? 0
    m.so += pl.so ?? 0
    m.bb += pl.bb ?? 0
    m.hbp += pl.hbp ?? 0
    m.bk += pl.bk ?? 0
    m.r += pl.r ?? 0
    m.er += pl.er ?? 0
    m.pitches += pl.pitches ?? 0
  }
  return byYahoo
}

type LineAgg = {
  gameIds: Set<string>
  wins: number
  losses: number
  outs: number
  bf: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  bk: number
  r: number
  er: number
  pitches: number
}

function emptyLineAgg(): LineAgg {
  return {
    gameIds: new Set(),
    wins: 0,
    losses: 0,
    outs: 0,
    bf: 0,
    h: 0,
    hr: 0,
    so: 0,
    bb: 0,
    hbp: 0,
    bk: 0,
    r: 0,
    er: 0,
    pitches: 0,
  }
}

function addLineAgg(a: LineAgg, m: MergedPitching, gameId: string): void {
  a.gameIds.add(gameId)
  a.wins += m.wins
  a.losses += m.losses
  a.outs += m.outs
  a.bf += m.bf
  a.h += m.h
  a.hr += m.hr
  a.so += m.so
  a.bb += m.bb
  a.hbp += m.hbp
  a.bk += m.bk
  a.r += m.r
  a.er += m.er
  a.pitches += m.pitches
}

type PaAgg = {
  bf: number
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
}

function emptyPaAgg(): PaAgg {
  return { bf: 0, ab: 0, h: 0, hr: 0, so: 0, bb: 0, hbp: 0 }
}

function eraFrom(er: number, outs: number): number | null {
  if (outs <= 0) return null
  return Number(((er * 27) / outs).toFixed(2))
}

function whipFrom(h: number, bb: number, outs: number): number | null {
  if (outs <= 0) return null
  const ip = outs / 3
  return Number(((h + bb) / ip).toFixed(3))
}

function monthLabel(mk: string): string {
  const m = mk.match(/^(\d{4})-(\d{2})$/)
  if (!m) return mk
  return `${parseInt(m[2], 10)}月`
}

function isYmd(s: string | null): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function lineAggToRow(
  split_type: "calendar_month" | "calendar_week",
  split_value: string,
  split_label: string,
  line: LineAgg,
  pa: PaAgg | undefined
): Record<string, unknown> | null {
  if (line.outs <= 0 && line.bf <= 0) return null
  const era = eraFrom(line.er, line.outs)
  const whip = whipFrom(line.h, line.bb, line.outs)
  const abDenom = pa && pa.bf > 0 ? pa.ab : Math.max(0, line.bf - line.bb - line.hbp)
  const hNum = pa && pa.bf > 0 ? pa.h : line.h
  return {
    split_type,
    split_value,
    split_label,
    g: line.gameIds.size,
    wins: line.wins,
    losses: line.losses,
    ip: outsToIpDisplay(line.outs),
    ipOuts: line.outs,
    era,
    bf: line.bf,
    h: line.h,
    hr: line.hr,
    so: line.so,
    bb: line.bb,
    hbp: line.hbp,
    bk: line.bk,
    r: line.r,
    er: line.er,
    pitches: line.pitches,
    whip,
    avgAgainstApprox: fmtAvg(abDenom, hNum),
  }
}

function main(): void {
  const { year, from, to, onlyNpbIds } = parseArgs()
  if ((from && !isYmd(from)) || (to && !isYmd(to))) {
    console.error("[phase7] invalid --from/--to. expected YYYY-MM-DD")
    process.exit(1)
  }
  const rosterPath = join(projectRoot, "_data", `npb_roster_${year}.csv`)
  if (!existsSync(rosterPath)) {
    console.error("[phase7] missing roster:", rosterPath)
    process.exit(1)
  }
  const roster = parseRosterCsv(readFileSync(rosterPath, "utf8"))
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year })
  if (docs.length === 0) {
    console.error("[phase7] no canonical games under _data/scraped_games/canonical/")
    process.exit(1)
  }
  const targetNpbIds = onlyNpbIds ? [...onlyNpbIds] : null
  const targetNpbIdSet = targetNpbIds ? new Set(targetNpbIds) : null

  const byNpbMonthLine = new Map<string, Map<string, LineAgg>>()
  const byNpbWeekLine = new Map<string, Map<string, LineAgg>>()
  const byNpbMonthPa = new Map<string, Map<string, PaAgg>>()
  const byNpbWeekPa = new Map<string, Map<string, PaAgg>>()

  function ensureLineMap(
    root: Map<string, Map<string, LineAgg>>,
    npb: string
  ): Map<string, LineAgg> {
    let m = root.get(npb)
    if (!m) {
      m = new Map()
      root.set(npb, m)
    }
    return m
  }
  function ensurePaMap(root: Map<string, Map<string, PaAgg>>, npb: string): Map<string, PaAgg> {
    let m = root.get(npb)
    if (!m) {
      m = new Map()
      root.set(npb, m)
    }
    return m
  }

  function npbForYahooPitcher(doc: CanonicalGameDocument, yahooPitcherId: string): string | null {
    const fakeLine: PitchingLine = {
      yahooPlayerId: yahooPitcherId,
      playerName: "",
      inferredFrom: "placeholder",
    }
    for (const pl of doc.domain.pitchingLines ?? []) {
      if ((pl.yahooPlayerId ?? "").trim() !== yahooPitcherId) continue
      fakeLine.playerName = pl.playerName
      break
    }
    if (!fakeLine.playerName) return null
    const hit = resolveNpbForPitcherLine(roster, doc, fakeLine)
    return hit?.npbPlayerId ?? null
  }

  function gameHasTargetPitcher(doc: CanonicalGameDocument): boolean {
    if (!targetNpbIdSet) return true
    const mergedLines = mergePitchingLines(doc.domain.pitchingLines ?? [])
    for (const m of mergedLines.values()) {
      const lineLike: PitchingLine = {
        yahooPlayerId: m.yahooPlayerId,
        playerName: m.playerName,
        ip: outsToIpDisplay(m.outs),
        bf: m.bf,
        h: m.h,
        hr: m.hr,
        so: m.so,
        bb: m.bb,
        hbp: m.hbp,
        bk: m.bk,
        r: m.r,
        er: m.er,
        pitches: m.pitches,
        inferredFrom: "stats_row_v0",
      }
      const hit = resolveNpbForPitcherLine(roster, doc, lineLike)
      if (hit?.npbPlayerId && targetNpbIdSet.has(hit.npbPlayerId)) return true
    }
    for (const pa of doc.domain.plateAppearances ?? []) {
      const pid = yahooPitcherIdForVsHandFromPa(pa)
      if (!pid) continue
      const npb = npbForYahooPitcher(doc, pid)
      if (npb && targetNpbIdSet.has(npb)) return true
    }
    return false
  }

  for (const doc of docs) {
    if (!gameHasTargetPitcher(doc)) continue
    const ymd = parseGameDateYmdFromCanonical(doc)
    if (!ymd || ymd.slice(0, 4) !== year) continue
    if (from && ymd < from) continue
    if (to && ymd > to) continue
    const mk = monthKeyFromYmd(ymd)
    const wk = tuesdayWeekKeyFromYmd(ymd)
    if (!wk) continue

    const mergedLines = mergePitchingLines(doc.domain.pitchingLines ?? [])
    for (const m of mergedLines.values()) {
      const lineLike: PitchingLine = {
        yahooPlayerId: m.yahooPlayerId,
        playerName: m.playerName,
        ip: outsToIpDisplay(m.outs),
        bf: m.bf,
        h: m.h,
        hr: m.hr,
        so: m.so,
        bb: m.bb,
        hbp: m.hbp,
        bk: m.bk,
        r: m.r,
        er: m.er,
        pitches: m.pitches,
        inferredFrom: "stats_row_v0",
      }
      const hit = resolveNpbForPitcherLine(roster, doc, lineLike)
      if (!hit) continue
      const npb = hit.npbPlayerId
      if (targetNpbIdSet && !targetNpbIdSet.has(npb)) continue

      const mm = ensureLineMap(byNpbMonthLine, npb)
      const ma = mm.get(mk) ?? emptyLineAgg()
      addLineAgg(ma, m, doc.gameId)
      mm.set(mk, ma)

      const wm = ensureLineMap(byNpbWeekLine, npb)
      const wa = wm.get(wk) ?? emptyLineAgg()
      addLineAgg(wa, m, doc.gameId)
      wm.set(wk, wa)
    }

    const pas = [...(doc.domain.plateAppearances ?? [])].sort(comparePlateAppearances)
    for (const pa of pas) {
      const pid = yahooPitcherIdForVsHandFromPa(pa)
      if (!pid) continue
      const npb = npbForYahooPitcher(doc, pid)
      if (!npb) continue
      if (targetNpbIdSet && !targetNpbIdSet.has(npb)) continue

      const res = lastPitchResult(pa)
      const pMonth = ensurePaMap(byNpbMonthPa, npb)
      const aM = pMonth.get(mk) ?? emptyPaAgg()
      addPitcherPaCount(aM, res)
      pMonth.set(mk, aM)

      const pWeek = ensurePaMap(byNpbWeekPa, npb)
      const aW = pWeek.get(wk) ?? emptyPaAgg()
      addPitcherPaCount(aW, res)
      pWeek.set(wk, aW)
    }
  }

  const outDir = join(projectRoot, "_data", "derived", "player_season_pitching_period", year)
  mkdirSync(outDir, { recursive: true })
  for (const f of readdirSync(outDir)) {
    if (f.startsWith("npb_") && f.endsWith(".json")) {
      const npbId = f.replace(/^npb_/, "").replace(/\.json$/, "")
      if (targetNpbIds && !targetNpbIds.includes(npbId)) continue
      try {
        unlinkSync(join(outDir, f))
      } catch {
        // ignore
      }
    }
  }

  const npbIds = new Set<string>([...byNpbMonthLine.keys(), ...byNpbWeekLine.keys()])
  const sortedNpb = (targetNpbIds ?? [...npbIds]).slice().sort()

  let written = 0
  for (const npb of sortedNpb) {
    const rows: Record<string, unknown>[] = []
    const mm = byNpbMonthLine.get(npb)
    const pm = byNpbMonthPa.get(npb)
    if (mm) {
      for (const mk of [...mm.keys()].sort()) {
        const line = mm.get(mk)
        if (!line) continue
        const pa = pm?.get(mk)
        const r = lineAggToRow("calendar_month", mk, monthLabel(mk), line, pa)
        if (r) rows.push(r)
      }
    }
    const wm = byNpbWeekLine.get(npb)
    const pw = byNpbWeekPa.get(npb)
    if (wm) {
      for (const wkey of [...wm.keys()].sort()) {
        const line = wm.get(wkey)
        if (!line) continue
        const pa = pw?.get(wkey)
        const r = lineAggToRow(
          "calendar_week",
          wkey,
          formatWeekRangeTueToSunFromTuesdayYmd(wkey),
          line,
          pa
        )
        if (r) rows.push(r)
      }
    }

    if (rows.length === 0) continue

    const payload = {
      schemaVersion: "phase7-player-season-pitching-period-v0",
      seasonYear: year,
      npbPlayerId: npb,
      generatedAt: new Date().toISOString(),
      meta: {
        gameDateSource: "game.meta.documentTitle / ogTitle（YYYY年M月D日）",
        weekRule: "火曜始まり・日曜終わり（jstPeriodKeys、phase17 と同一）",
      },
      source: {
        canonicalGames: docs.map((d) => d.gameId).sort(),
      },
      rows,
    }
    writeJsonFileWithRetrySync(join(outDir, `npb_${npb}.json`), payload)
    written++
  }

  console.log(
    `[phase7] wrote ${written} files → ${outDir}${from || to ? ` (range=${from ?? "(start)"}..${to ?? "(end)"})` : ""}`,
  )
}

main()
