/**
 * canonical の plateAppearances.pitchEvents から球種別集計
 * Strike% は 1 球単位。Whiff% = 空振り ÷ スイング数（スイング企図）。
 * 被打率 / 被OPS は決着球 split（SSOT: resultJaHitBases / paSettlementStatsFromResultJa）。
 */

import type { GamePitchTypeRow, GamePitchTypesResponse } from "./gamePitcherPilotFiles"
import { slashOps3FromCounts, slashRate3FromCounts } from "../battingRateFormat"
import { isWalkLikeResultText } from "../baseballWalkResult"
import { pickResultSummaryJaFromPitchEvents } from "./mergePhase10FromPitchRows"
import { isStrikeoutResultJa } from "./paOutcomeResultJa"
import { isHbpResultJa, isSfResultJa } from "./paSettlementStatsFromResultJa"
import {
  aggregatePitchTypeRateCounts,
  formatStrikePct,
  formatWhiffPct,
  strikeCountFromRateCounts,
  swingCountFromRateCounts,
} from "./pitchTypeRateStats"
import { hitBases, isAtBat } from "./resultJaHitBases"
import type { PlateAppearance, PitchEvent } from "./types"

type SettlementAcc = {
  ab: number
  h: number
  hr: number
  tb: number
  so: number
  bb: number
  hbp: number
  sf: number
}

function emptyAcc(): SettlementAcc {
  return { ab: 0, h: 0, hr: 0, tb: 0, so: 0, bb: 0, hbp: 0, sf: 0 }
}

function formatAvg(h: number, ab: number): string {
  if (!ab) return "—"
  return slashRate3FromCounts(h, ab)
}

function formatOps(acc: SettlementAcc): string {
  const { ab, h, tb, bb, hbp, sf } = acc
  const obpDenom = ab + bb + hbp + sf
  if (obpDenom <= 0 && ab <= 0) return "—"
  return slashOps3FromCounts({ h, ab, tb, bb, hbp, sf })
}

function sortEvents(ev: PitchEvent[]): PitchEvent[] {
  return [...ev].sort((a, b) => (a.pitchIndex ?? 0) - (b.pitchIndex ?? 0))
}

function settlementSummaryForPa(pa: PlateAppearance, events: PitchEvent[]): string {
  const explicit = (pa.resultSummaryJa ?? "").trim()
  if (explicit) return explicit
  const picked = pickResultSummaryJaFromPitchEvents(events)
  if (picked) return picked.trim()
  const last = events[events.length - 1]
  return (last?.resultJa ?? "").trim()
}

/**
 * 1 試合・1 投手分の球種別レスポンスを canonical から構築
 */
export function buildPitchTypesResponseFromCanonical(
  gameId: string,
  yahooPitcherId: string,
  plateAppearances: PlateAppearance[]
): GamePitchTypesResponse | null {
  const pid = yahooPitcherId.trim()
  if (!pid) return null

  const pas = plateAppearances.filter((p) => (p.pitchEvents?.length ?? 0) > 0)
  if (!pas.length) return null

  const pitchesByType: Record<string, PitchEvent[]> = {}
  const settlementByType: Record<string, SettlementAcc> = {}

  for (const pa of pas) {
    const events = sortEvents(pa.pitchEvents ?? [])
    if (!events.length) continue

    const eventsForPid = events.filter(
      (e) => (String(e.yahooPitcherId ?? "").trim() || (pa.yahooPitcherId ?? "").trim()) === pid,
    )
    if (!eventsForPid.length) continue

    for (const e of eventsForPid) {
      const pt = (e.pitchTypeJa ?? "").trim() || "不明"
      if (!pitchesByType[pt]) pitchesByType[pt] = []
      pitchesByType[pt].push(e)
    }

    const last = events[events.length - 1]!
    const lastPid = (String(last.yahooPitcherId ?? "").trim() || (pa.yahooPitcherId ?? "").trim())
    if (lastPid !== pid) continue

    const pt = (last.pitchTypeJa ?? "").trim() || "不明"
    const summary = settlementSummaryForPa(pa, events)
    if (!settlementByType[pt]) settlementByType[pt] = emptyAcc()
    const rec = settlementByType[pt]!

    if (isAtBat(summary)) {
      rec.ab += 1
      const tb = hitBases(summary)
      if (tb > 0) {
        rec.h += 1
        rec.tb += tb
        if (tb === 4) rec.hr += 1
      }
    }
    if (isStrikeoutResultJa(summary)) rec.so += 1
    if (isWalkLikeResultText(summary)) rec.bb += 1
    if (isHbpResultJa(summary)) rec.hbp += 1
    if (isSfResultJa(summary)) rec.sf += 1
  }

  const allPitches = Object.values(pitchesByType).flat()
  const totalPitches = allPitches.length
  if (!totalPitches) return null

  const types = Object.keys(pitchesByType).sort(
    (a, b) => pitchesByType[b]!.length - pitchesByType[a]!.length
  )

  const rows: GamePitchTypeRow[] = types.map((pitchType) => {
    const pitches = pitchesByType[pitchType]!
    const n = pitches.length
    const setRec = settlementByType[pitchType] ?? emptyAcc()
    const rateCounts = aggregatePitchTypeRateCounts(pitches.map((p) => p.resultJa))
    const strikes = strikeCountFromRateCounts(rateCounts)

    const speeds = pitches
      .map((p) => p.speedKmh)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    const avgSpeed = speeds.length ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10 : null

    return {
      pitch_type: pitchType,
      pitches: n,
      pct: Math.round((n / totalPitches) * 1000) / 10,
      avg_speed_kmh: avgSpeed,
      swing_miss: rateCounts.swingMiss,
      taken: rateCounts.taken,
      foul: rateCounts.foul,
      balls: rateCounts.balls,
      strike_pct: formatStrikePct(strikes, n),
      whiff_pct: formatWhiffPct(rateCounts.swingMiss, swingCountFromRateCounts(rateCounts)),
      avg: formatAvg(setRec.h, setRec.ab),
      ops: formatOps(setRec),
      ab: setRec.ab,
      h: setRec.h,
      hr: setRec.hr,
      so: setRec.so,
      bb: setRec.bb,
      hbp: setRec.hbp,
    }
  })

  const totalAcc = emptyAcc()
  for (const t of types) {
    const s = settlementByType[t] ?? emptyAcc()
    totalAcc.ab += s.ab
    totalAcc.h += s.h
    totalAcc.hr += s.hr
    totalAcc.tb += s.tb
    totalAcc.so += s.so
    totalAcc.bb += s.bb
    totalAcc.hbp += s.hbp
    totalAcc.sf += s.sf
  }

  const totalRateCounts = aggregatePitchTypeRateCounts(allPitches.map((p) => p.resultJa))
  const totalStrikes = strikeCountFromRateCounts(totalRateCounts)

  const totalRow: GamePitchTypeRow = {
    pitch_type: "合計",
    pitches: totalPitches,
    pct: 100.0,
    avg_speed_kmh: null,
    swing_miss: totalRateCounts.swingMiss,
    taken: totalRateCounts.taken,
    foul: totalRateCounts.foul,
    balls: totalRateCounts.balls,
    strike_pct: formatStrikePct(totalStrikes, totalPitches),
    whiff_pct: formatWhiffPct(
      totalRateCounts.swingMiss,
      swingCountFromRateCounts(totalRateCounts),
    ),
    avg: formatAvg(totalAcc.h, totalAcc.ab),
    ops: formatOps(totalAcc),
    ab: totalAcc.ab,
    h: totalAcc.h,
    hr: totalAcc.hr,
    so: totalAcc.so,
    bb: totalAcc.bb,
    hbp: totalAcc.hbp,
  }

  return {
    game_id: gameId,
    pitcher_id: pid,
    pitches_total: totalPitches,
    rows,
    total_row: totalRow,
  }
}

/**
 * canonical 内で投球イベントを持つ全 Yahoo 投手 ID
 */
export function yahooPitcherIdsWithPitchEvents(plateAppearances: PlateAppearance[]): string[] {
  const set = new Set<string>()
  for (const pa of plateAppearances) {
    if ((pa.pitchEvents?.length ?? 0) === 0) continue
    const paPid = (pa.yahooPitcherId ?? "").trim()
    if (paPid) set.add(paPid)
    for (const e of pa.pitchEvents ?? []) {
      const id = String(e.yahooPitcherId ?? "").trim()
      if (id) set.add(id)
    }
  }
  return [...set].sort()
}
