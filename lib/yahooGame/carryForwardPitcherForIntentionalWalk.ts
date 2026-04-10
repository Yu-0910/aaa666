/**
 * 敬遠（故意四球）で一球ログに投手 ID が無い場合の運用ルール:
 * 同一表・裏内で「投手交代」が無く、直前の打席まで対戦していた投手が敬遠する、とみなし、
 * 直前打席で確定した投手 Yahoo ID をこの打席に引き継ぐ。
 * （テキスト上の交代行で投手が更新されていれば、その後の打席から last が更新される。）
 */
import { isIntentionalWalkResultText } from "../baseballWalkResult"
import type { PitchEvent, PlateAppearance } from "./types"

function patchFirstEventPitcher(events: PitchEvent[] | undefined, pid: string): PitchEvent[] | undefined {
  if (!events?.length) return events
  const ev0 = events[0]
  if ((ev0.yahooPitcherId ?? "").trim()) return events
  return [{ ...ev0, yahooPitcherId: pid }, ...events.slice(1)]
}

export function applyCarryForwardPitcherForIntentionalWalks(pas: PlateAppearance[]): PlateAppearance[] {
  let currentHalfKey = ""
  let lastPitcherInHalf = ""
  const out: PlateAppearance[] = []

  for (const pa of pas) {
    const halfKey = (pa.inningHalf ?? "").trim()
    if (halfKey !== currentHalfKey) {
      currentHalfKey = halfKey
      lastPitcherInHalf = ""
    }

    const hadPid = (pa.yahooPitcherId ?? "").trim()
    let pid = hadPid
    if (!pid && isIntentionalWalkResultText(pa.resultSummaryJa ?? "") && lastPitcherInHalf) {
      pid = lastPitcherInHalf
    }

    if (hadPid) lastPitcherInHalf = hadPid
    else if (pid) lastPitcherInHalf = pid

    const pitchEvents =
      !hadPid && pid ? patchFirstEventPitcher(pa.pitchEvents, pid) : pa.pitchEvents

    out.push({
      ...pa,
      yahooPitcherId: pid || undefined,
      pitchEvents,
    })
  }

  return out
}
