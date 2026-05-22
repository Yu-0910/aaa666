import type { PitchEvent } from "./types"

/** 一球ログ配列を `pitchIndex`（欠損は後ろ）＋安定ソートで試合内投球順に並べる */
export function sortPitchEventsByPitchIndex(events: PitchEvent[]): PitchEvent[] {
  return [...events]
    .map((e, arrayIndex) => ({ e, arrayIndex }))
    .sort((a, b) => {
      const na = a.e.pitchIndex
      const nb = b.e.pitchIndex
      const aMissing = na == null ? 1 : 0
      const bMissing = nb == null ? 1 : 0
      if (aMissing !== bMissing) return aMissing - bMissing
      if (na != null && nb != null && na !== nb) return na - nb
      return a.arrayIndex - b.arrayIndex
    })
    .map(({ e }) => e)
}

export function firstNonEmptyPitcherIdFromPitchEvents(events: PitchEvent[] | undefined): string {
  if (!events?.length) return ""
  const sorted = sortPitchEventsByPitchIndex(events)
  for (let i = 0; i < sorted.length; i++) {
    const id = String(sorted[i]?.yahooPitcherId ?? "").trim()
    if (id) return id
  }
  return ""
}

export function lastNonEmptyPitcherIdFromPitchEvents(events: PitchEvent[] | undefined): string {
  if (!events?.length) return ""
  const sorted = sortPitchEventsByPitchIndex(events)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const id = String(sorted[i]?.yahooPitcherId ?? "").trim()
    if (id) return id
  }
  return ""
}
