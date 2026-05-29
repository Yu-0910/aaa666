/**
 * canonical の plateAppearances.pitchEvents から球種別集計（fetch_game_pitch_types.py と同趣旨）
 */

import type { GamePitchTypeRow, GamePitchTypesResponse } from "./gamePitcherPilotFiles"
import { slashOps3FromCounts, slashRate3FromCounts } from "../battingRateFormat"
import { bucketPitchResultForTypeRow } from "./pitchCountSim"
import { isStrikeoutResultJa } from "./paOutcomeResultJa"
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

function isWalkSummary(s: string): boolean {
  return /四球|敬遠|故意四球/.test(s)
}

function isHbpSummary(s: string): boolean {
  return /死球/.test(s)
}

function isSfSummary(s: string): boolean {
  return /犠飛|犠牲フライ|犠牲飛/.test(s)
}

function isSacHitSummary(s: string): boolean {
  return /犠打|投犠打|捕犠打|犠犠/.test(s)
}

function isHitSummary(s: string): boolean {
  return (
    /^[左右中]安/.test(s) ||
    /安打|ヒット/.test(s) ||
    /二塁打|三塁打|本塁打|ホームラン/.test(s) ||
    /^\s*ソロ/.test(s)
  )
}

function getTotalBasesSummary(s: string): number {
  if (/本塁打|ホームラン|^\s*ソロ|満塁(ホーム)?ラン/.test(s)) return 4
  if (/三塁打/.test(s)) return 3
  if (/二塁打/.test(s)) return 2
  if (isHitSummary(s)) return 1
  return 0
}

/** AB に数える終了打席（四死球・犠打・犠飛は除く） */
function countsAtBat(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (isWalkSummary(t) || isHbpSummary(t)) return false
  if (isSfSummary(t) || isSacHitSummary(t)) return false
  if (isStrikeoutResultJa(t)) return true
  if (/ゴロ|ライナー|併殺/.test(t)) return true
  if (/飛|フライ/.test(t)) return true
  if (isHitSummary(t)) return true
  return false
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
    const summary = (pa.resultSummaryJa ?? last.resultJa ?? "").trim()
    if (!settlementByType[pt]) settlementByType[pt] = emptyAcc()
    const rec = settlementByType[pt]!

    if (countsAtBat(summary)) {
      rec.ab += 1
      if (isHitSummary(summary)) {
        rec.h += 1
        const tb = getTotalBasesSummary(summary)
        rec.tb += tb
        if (tb === 4) rec.hr += 1
      }
    }
    if (isStrikeoutResultJa(summary)) rec.so += 1
    if (isWalkSummary(summary)) rec.bb += 1
    if (isHbpSummary(summary)) rec.hbp += 1
    if (isSfSummary(summary)) rec.sf += 1
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

    let balls = 0
    let swingMiss = 0
    let taken = 0
    let foul = 0
    for (const p of pitches) {
      const r = (p.resultJa ?? "").trim()
      switch (bucketPitchResultForTypeRow(r)) {
        case "balls":
          balls += 1
          break
        case "swing_miss":
          swingMiss += 1
          break
        case "taken":
          taken += 1
          break
        case "foul":
          foul += 1
          break
      }
    }

    const inPlay = setRec.ab - setRec.so
    const strikes = swingMiss + taken + foul + Math.max(0, inPlay)
    const strikePct = n ? `${((strikes / n) * 100).toFixed(1)}%` : "—"
    const swingTotal = swingMiss + foul + setRec.ab
    const whiffPct = swingTotal ? `${((swingMiss / swingTotal) * 100).toFixed(1)}%` : "—"

    const speeds = pitches
      .map((p) => p.speedKmh)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    const avgSpeed = speeds.length ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10 : null

    return {
      pitch_type: pitchType,
      pitches: n,
      pct: Math.round((n / totalPitches) * 1000) / 10,
      avg_speed_kmh: avgSpeed,
      swing_miss: swingMiss,
      taken,
      foul,
      balls,
      strike_pct: strikePct,
      whiff_pct: whiffPct,
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

  const totalSwingMiss = rows.reduce((s, r) => s + r.swing_miss, 0)
  const totalTaken = rows.reduce((s, r) => s + r.taken, 0)
  const totalFoul = rows.reduce((s, r) => s + r.foul, 0)
  const totalBalls = rows.reduce((s, r) => s + r.balls, 0)
  const totalStrikes =
    totalSwingMiss + totalTaken + totalFoul + Math.max(0, totalAcc.ab - totalAcc.so)

  const totalRow: GamePitchTypeRow = {
    pitch_type: "合計",
    pitches: totalPitches,
    pct: 100.0,
    avg_speed_kmh: null,
    swing_miss: totalSwingMiss,
    taken: totalTaken,
    foul: totalFoul,
    balls: totalBalls,
    strike_pct: totalPitches ? `${((totalStrikes / totalPitches) * 100).toFixed(1)}%` : "—",
    whiff_pct: (() => {
      const denom = totalSwingMiss + totalFoul + totalAcc.ab
      return denom ? `${((totalSwingMiss / denom) * 100).toFixed(1)}%` : "—"
    })(),
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
