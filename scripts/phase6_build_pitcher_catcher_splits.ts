/**
 * Phase 6: 実守備捕手（守備交代追跡）で打席を振り分け、player_season_pitching_poc JSON に splits.byCatcher を付与する。
 *
 * 前提: `npm run phase:pitcher-poc1` 済み（npb_*.json が存在すること）
 * 捕手帰属: activeCatcherFromCanonical（実況の守備交代・(捕) 表記）。
 * 回数・自責点・防御率は試合ごとの pitchingLines を「BF 最大の実守備捕手」に帰属して合算（按分しない）。
 *
 * npx tsx scripts/phase6_build_pitcher_catcher_splits.ts --year 2026
 *
 * canonical 入力は `loadCanonicalGamesMergedForDerivedPipeline`（Phase11 と同一: 一球マージ済み）。
 * scoreboard が空の canonical 向けに Phase13 と同様 `injectTeamsFromTextPbpIfMissing` で先攻/後攻を補完する。
 */

import { existsSync, readFileSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { PlateAppearance } from "../lib/yahooGame/types"
import { yahooPitcherIdForVsHandFromPa } from "../lib/yahooGame/yahooPitcherIdForVsHandFromPa"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { parseGameDateYmdFromCanonical } from "../lib/yahooGame/gameDateFromCanonical"
import { injectTeamsFromTextPbpIfMissing } from "../lib/yahooGame/inferTeamsFromTextPbp"
import { isIntentionalWalkResultText } from "../lib/baseballWalkResult"
import { addPitcherPaCount, fmtAvg, lastPitchResult } from "../lib/yahooGame/pitcherPaResultCommon"
import { comparePlateAppearances, teamForYahooPlayerId } from "../lib/yahooGame/pitcherPocHelpers"
import {
  buildCatcherYahooIdByPaTimeline,
  resolveActiveCatcherYahooIdForPlateAppearance,
} from "../lib/yahooGame/activeCatcherFromCanonical"
import { fieldingTeamNameFromInningHalf, teamsRoughlyMatch } from "../lib/yahooGame/startingCatcherFromCanonical"
import type { PitcherSeasonPocPayload } from "../lib/pitcherSeasonPocTypes"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"
import { isRegularSeasonCanonicalGame } from "../lib/npbRegularSeason"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; onlyNpbIds: string[] | null } {
  const args = process.argv.slice(2)
  let year = "2026"
  let onlyNpbIds: string[] | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    } else if (args[i] === "--only-npb-ids" && args[i + 1]) {
      onlyNpbIds = String(args[i + 1])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    }
  }
  return { year, onlyNpbIds }
}

type PaAgg = {
  bf: number
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  ibb: number
}

const emptyPaAgg = (): PaAgg => ({
  bf: 0,
  ab: 0,
  h: 0,
  hr: 0,
  so: 0,
  bb: 0,
  hbp: 0,
  ibb: 0,
})

function ipToOuts(ip: string | undefined): number {
  if (!ip) return 0
  const t = String(ip).trim()
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

/** Phase 1 が書いた npb_*.json の yahooPitcherIds と同一の対応（pitchingLines 名簿照合に依存しない） */
function loadYahooPitcherIdToNpbMap(
  outDir: string,
  files: string[]
): Map<string, string> {
  const m = new Map<string, string>()
  for (const f of files) {
    const p = join(outDir, f)
    try {
      const raw = readFileSync(p, "utf8")
      const j = JSON.parse(raw) as PitcherSeasonPocPayload
      if (j.schemaVersion !== "phase-pitcher-poc-season-v1" || !j.npbPlayerId) continue
      for (const yid of j.yahooPitcherIds ?? []) {
        const id = String(yid).trim()
        if (id) m.set(id, j.npbPlayerId)
      }
    } catch {
      // ignore
    }
  }
  return m
}

function main(): void {
  const { year, onlyNpbIds } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year }).filter((doc) => {
    const ymd = parseGameDateYmdFromCanonical(doc)
    return Boolean(ymd && isRegularSeasonCanonicalGame(year, ymd, doc.game?.meta?.documentTitle))
  })
  if (docs.length === 0) {
    console.error("[phase6] no canonical games under _data/scraped_games/canonical/")
    process.exit(1)
  }

  const outDir = join(projectRoot, "_data", "derived", "player_season_pitching_poc", year)
  if (!existsSync(outDir)) {
    console.error("[phase6] run phase:pitcher-poc1 first; missing:", outDir)
    process.exit(1)
  }

  const targetNpbIds = onlyNpbIds ? [...onlyNpbIds] : null
  const targetNpbIdSet = targetNpbIds ? new Set(targetNpbIds) : null
  const files = readdirSync(outDir).filter((f) => {
    if (!f.startsWith("npb_") || !f.endsWith(".json")) return false
    const npb = f.replace(/^npb_/, "").replace(/\.json$/, "")
    return !targetNpbIdSet || targetNpbIdSet.has(npb)
  })
  if (files.length === 0) {
    console.error("[phase6] no npb_*.json in", outDir)
    process.exit(1)
  }

  const yahooPitcherToNpb = loadYahooPitcherIdToNpbMap(outDir, files)

  /** Phase13 と同型: scoreboard 空でも試合前情報から先攻/後攻を補完した doc */
  const docByGameId = new Map<string, ReturnType<typeof injectTeamsFromTextPbpIfMissing>>()
  function enrichedDoc(baseDoc: (typeof docs)[number]) {
    const gid = String(baseDoc.gameId ?? "").trim()
    const cached = docByGameId.get(gid)
    if (cached) return cached
    const doc = injectTeamsFromTextPbpIfMissing(baseDoc)
    if (gid) docByGameId.set(gid, doc)
    return doc
  }

  /** npbPlayerId -> Map<catcherYahooId, PaAgg> */
  const byNpbCatcher = new Map<string, Map<string, PaAgg>>()

  /** 試合単位: gameId -> yahooPitcherId -> catcherYahooId -> bf */
  const bfByGamePitcherCatcher = new Map<string, Map<string, Map<string, number>>>()
  const bumpBf = (gameId: string, pid: string, cyid: string) => {
    let m1 = bfByGamePitcherCatcher.get(gameId)
    if (!m1) {
      m1 = new Map()
      bfByGamePitcherCatcher.set(gameId, m1)
    }
    let m2 = m1.get(pid)
    if (!m2) {
      m2 = new Map()
      m1.set(pid, m2)
    }
    m2.set(cyid, (m2.get(cyid) ?? 0) + 1)
  }

  for (const baseDoc of docs) {
    if (
      targetNpbIdSet &&
      !(baseDoc.domain?.plateAppearances ?? []).some((pa) => {
        const pid = yahooPitcherIdForVsHandFromPa(pa)
        return Boolean(pid && yahooPitcherToNpb.has(pid))
      })
    ) {
      continue
    }
    const doc = enrichedDoc(baseDoc)
    const catcherTimeline = buildCatcherYahooIdByPaTimeline(doc)
    const pas = [...(doc.domain?.plateAppearances ?? [])].sort(comparePlateAppearances)
    for (const pa of pas) {
      const pid = yahooPitcherIdForVsHandFromPa(pa)
      if (!pid) continue
      const npb = yahooPitcherToNpb.get(pid)
      if (!npb) continue

      /** 表裏とスコアボードで守備側チーム。スタメンに投手がいない救援もここで特定可能 */
      const fieldingTeam = fieldingTeamNameFromInningHalf(doc, (pa.inningHalf ?? "").trim())
      if (!fieldingTeam) continue
      const pitcherFromLineup = teamForYahooPlayerId(doc, pid)
      if (pitcherFromLineup && !teamsRoughlyMatch(pitcherFromLineup, fieldingTeam)) continue

      const catcherYid = resolveActiveCatcherYahooIdForPlateAppearance(
        doc,
        pa as PlateAppearance,
        catcherTimeline,
      )
      if (!catcherYid) continue

      const res = lastPitchResult(pa as PlateAppearance)
      let m = byNpbCatcher.get(npb)
      if (!m) {
        m = new Map()
        byNpbCatcher.set(npb, m)
      }
      const agg = m.get(catcherYid) ?? emptyPaAgg()
      addPitcherPaCount(agg, res)
      if (isIntentionalWalkResultText(res)) agg.ibb += 1
      m.set(catcherYid, agg)

      bumpBf(baseDoc.gameId, pid, catcherYid)
    }
  }

  /**
   * 捕手別の試合帰属（1試合=1捕手: BF 最大。同点は catcherId 昇順）。
   * pitchingLines の ip/er/decision/QS も同一捕手に合算する。
   */
  type CatcherGameAgg = {
    games: number
    wins: number
    losses: number
    qsCount: number
    ipOuts: number
    er: number
  }
  const catcherGameAggByNpb = new Map<string, Map<string, CatcherGameAgg>>()
  const ensureCatcherGameAgg = (npb: string, cyid: string): CatcherGameAgg => {
    let m = catcherGameAggByNpb.get(npb)
    if (!m) {
      m = new Map()
      catcherGameAggByNpb.set(npb, m)
    }
    let a = m.get(cyid)
    if (!a) {
      a = { games: 0, wins: 0, losses: 0, qsCount: 0, ipOuts: 0, er: 0 }
      m.set(cyid, a)
    }
    return a
  }

  for (const baseDoc of docs) {
    if (
      targetNpbIdSet &&
      !(baseDoc.domain?.pitchingLines ?? []).some((pl) => {
        const pid = String(pl.yahooPlayerId ?? "").trim()
        return Boolean(pid && yahooPitcherToNpb.has(pid))
      })
    ) {
      continue
    }
    const gameId = baseDoc.gameId
    const perPitcher = bfByGamePitcherCatcher.get(gameId) ?? new Map()
    for (const [pid, perCatcher] of perPitcher.entries()) {
      const npb = yahooPitcherToNpb.get(pid)
      if (!npb) continue

      // その試合の pitchingLines から投手の 1 行を取る（無ければスキップ）
      const line = (baseDoc.domain?.pitchingLines ?? []).find((pl) => (pl.yahooPlayerId ?? "").trim() === pid)
      if (!line) continue

      // 帰属捕手（最大BF。tieは catcherId の昇順）
      const sorted = [...perCatcher.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      const cyid = sorted[0]?.[0]
      if (!cyid) continue

      const a = ensureCatcherGameAgg(npb, cyid)
      a.games += 1
      a.ipOuts += ipToOuts(line.ip)
      a.er += line.er ?? 0
      const decision = line.decision ?? null
      if (decision === "win") a.wins += 1
      if (decision === "loss") a.losses += 1
      const outs = ipToOuts(line.ip)
      const er = line.er ?? 0
      if (outs >= 18 && er <= 3) a.qsCount += 1
    }
  }

  let updated = 0
  for (const f of files) {
    const npb = f.replace(/^npb_|\.json$/g, "")
    const path = join(outDir, f)
    let payload: PitcherSeasonPocPayload
    try {
      payload = JSON.parse(readFileSync(path, "utf8")) as PitcherSeasonPocPayload
    } catch {
      console.warn("[phase6] skip unreadable:", path)
      continue
    }
    if (payload.schemaVersion !== "phase-pitcher-poc-season-v1" || payload.npbPlayerId !== npb) {
      console.warn("[phase6] skip invalid payload:", path)
      continue
    }

    const cmap = byNpbCatcher.get(npb)
    const gmap = catcherGameAggByNpb.get(npb) ?? new Map<string, CatcherGameAgg>()

    const rows: NonNullable<PitcherSeasonPocPayload["splits"]["byCatcher"]> = []
    if (cmap) {
      const sortedIds = [...cmap.keys()].sort()
      for (const cyid of sortedIds) {
        const a = cmap.get(cyid)!
        if (a.bf <= 0) continue
        const cg = gmap.get(cyid) ?? null
        const ipOutsC = cg?.ipOuts ?? 0
        const erC = cg?.er ?? 0
        const era = ipOutsC > 0 ? (erC * 27) / ipOutsC : null
        const ipNum = ipOutsC / 3
        const whip = ipNum > 0 ? (a.h + a.bb) / ipNum : null
        const wins = cg?.wins ?? 0
        const losses = cg?.losses ?? 0
        const games = cg?.games ?? 0
        const qsCount = cg?.qsCount ?? 0
        const wl = games > 0 ? `${wins}-${losses}` : "—"
        const qsPct = games > 0 ? Number(((qsCount / games) * 100).toFixed(1)) : null

        const mentioned =
          docs[0]?.game.yahooPlayersMentioned?.[cyid] ??
          docs.find((d) => d.game.yahooPlayersMentioned?.[cyid])?.game.yahooPlayersMentioned?.[cyid] ??
          ""

        rows.push({
          yahooCatcherId: cyid,
          label: mentioned.trim() || cyid,
          bf: a.bf,
          ab: a.ab,
          h: a.h,
          hr: a.hr,
          so: a.so,
          bb: a.bb,
          hbp: a.hbp,
          avg: fmtAvg(a.ab, a.h),
          era: era != null ? Number(era.toFixed(2)) : null,
          ip: outsToIpDisplay(ipOutsC),
          ipOuts: ipOutsC,
          wl,
          kPct:
            a.bf > 0 ? Number(((a.so / a.bf) * 100).toFixed(1)) : null,
          kBbPct:
            a.bf > 0 ? Number((((a.so - a.bb) / a.bf) * 100).toFixed(1)) : null,
          whip: whip != null ? Number(whip.toFixed(3)) : null,
          games,
          wins,
          losses,
          qsCount,
          qsPct,
          er: erC,
          ibb: a.ibb,
        })
      }
    }

    payload.splits.byCatcher = rows
    payload.source = {
      ...payload.source,
      catcherNote:
        "捕手は各打席時点の実守備捕手（textPlayByPlay の守備交代・(捕) 表記を追跡）。1試合内で複数捕手に打席が分かれる場合は BF 最大の捕手に pitchingLines（回数・自責点・勝敗・QS）を帰属。打者・安打等は打席単位で集計。",
    }

    writeJsonFileWithRetrySync(path, payload)
    updated++
  }

  console.log(`[phase6] updated ${updated} files with splits.byCatcher → ${outDir}`)
}

main()
