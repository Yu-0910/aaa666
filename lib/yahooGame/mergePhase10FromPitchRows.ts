import { createHash } from "crypto"
import type {
  CanonicalGameDocument,
  PitchEvent,
  PlateAppearance,
} from "./types"
import { applyCarryForwardPitcherForIntentionalWalks } from "./carryForwardPitcherForIntentionalWalk"

/** Python `parse_pitch_details` 行（JSON 経由） */
export type Phase10PitchRow = {
  game_id?: string
  inning?: string
  top_bottom?: string
  bat_order?: string
  pitcher_id?: string
  batter_id?: string
  pitch_no?: string
  pitch_type?: string
  speed_kmh?: string
  result?: string
  zone_id?: string
  /** 例: intentional_walk（テキスト由来の合成行） */
  record_kind?: string
  text_summary?: string
  source?: string
}

function numOrNull(s: string | undefined): number | null {
  if (s == null || String(s).trim() === "") return null
  const n = parseInt(String(s), 10)
  return Number.isFinite(n) ? n : null
}

function sortKey(r: Phase10PitchRow): [number, string, number, number] {
  const inn = parseInt(String(r.inning ?? "0"), 10) || 0
  const tb = String(r.top_bottom ?? "")
  const bo = parseInt(String(r.bat_order ?? "0"), 10) || 0
  const pn = parseInt(String(r.pitch_no ?? "0"), 10) || 0
  return [inn, tb, bo, pn]
}

export function computeEventsFingerprint(rows: Phase10PitchRow[]): string {
  const stable = [...rows].sort((a, b) => {
    const ka = sortKey(a)
    const kb = sortKey(b)
    for (let i = 0; i < 4; i++) {
      if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1
    }
    return 0
  })
  return createHash("sha256").update(JSON.stringify(stable), "utf8").digest("hex")
}

function rowToPitchEvent(r: Phase10PitchRow): PitchEvent {
  const speed = numOrNull(r.speed_kmh)
  return {
    pitchIndex: numOrNull(r.pitch_no) ?? undefined,
    yahooPitcherId: r.pitcher_id?.trim() || undefined,
    yahooBatterId: r.batter_id?.trim() || undefined,
    speedKmh: speed,
    pitchTypeJa: r.pitch_type?.trim() || null,
    zoneId: numOrNull(r.zone_id),
    resultJa: r.result?.trim() || null,
  }
}

type PaKey = string

function paKey(r: Phase10PitchRow): PaKey {
  return `${r.inning ?? ""}|${r.top_bottom ?? ""}|${r.bat_order ?? ""}`
}

/**
 * Phase 10: 一球ログ行を canonical.domain に反映する（Normalized→Canonical の上にマージ）。
 */
export function mergePhase10IntoCanonical(
  doc: CanonicalGameDocument,
  rows: Phase10PitchRow[],
  phase10Missing: string[],
): CanonicalGameDocument {
  const fp = computeEventsFingerprint(rows)
  const byPa = new Map<PaKey, Phase10PitchRow[]>()
  for (const r of rows) {
    const k = paKey(r)
    const list = byPa.get(k) ?? []
    list.push(r)
    byPa.set(k, list)
  }

  const plateAppearances: PlateAppearance[] = []
  const keys = [...byPa.keys()].sort((a, b) => {
    const [ia, ta, ba] = a.split("|")
    const [ib, tb, bb] = b.split("|")
    const nia = parseInt(ia, 10) || 0
    const nib = parseInt(ib, 10) || 0
    if (nia !== nib) return nia - nib
    if (ta !== tb) return ta.localeCompare(tb)
    return (parseInt(ba, 10) || 0) - (parseInt(bb, 10) || 0)
  })

  for (const k of keys) {
    const list = byPa.get(k) ?? []
    const sorted = [...list].sort(
      (a, b) => (numOrNull(a.pitch_no) ?? 0) - (numOrNull(b.pitch_no) ?? 0),
    )
    const first = sorted[0]
    const inn = String(first?.inning ?? "")
    const tb = String(first?.top_bottom ?? "")
    const bo = String(first?.bat_order ?? "")
    const paId = `${doc.gameId}-${inn}-${tb}-${bo}`
    const inningHalf = inn && tb ? `${inn}回${tb}` : undefined
    const last = sorted[sorted.length - 1]
    const pevents: PitchEvent[] = sorted.map(rowToPitchEvent)
    plateAppearances.push({
      paId,
      inningHalf,
      yahooPitcherId: first?.pitcher_id?.trim() || undefined,
      yahooBatterId: first?.batter_id?.trim() || undefined,
      resultSummaryJa: last?.result?.trim() || undefined,
      pitchEvents: pevents,
    })
  }

  const plateAppearancesFilled = applyCarryForwardPitcherForIntentionalWalks(plateAppearances)
  const paHash = createHash("sha256").update(JSON.stringify(plateAppearancesFilled), "utf8").digest("hex")
  const eventsFingerprintMerged = createHash("sha256").update(`${fp}|ibb-carry-v1|${paHash}`, "utf8").digest("hex")

  const pitchEventsFlat: PitchEvent[] = plateAppearancesFilled.flatMap((p) => p.pitchEvents ?? [])

  const extraMissing = phase10Missing.map((m) => `phase10:${m}`)
  const mergedMissing = [...doc.game.missingOrPartial, ...extraMissing]

  return {
    ...doc,
    builtAt: new Date().toISOString(),
    eventsFingerprint: eventsFingerprintMerged,
    game: {
      ...doc.game,
      missingOrPartial: mergedMissing,
      pitchByPitchNote:
        rows.length > 0
          ? { status: "restored_phase10", note: `pitch rows=${rows.length}` }
          : doc.game.pitchByPitchNote,
    },
    domain: {
      ...doc.domain,
      plateAppearances: plateAppearancesFilled,
      pitchEvents: pitchEventsFlat,
    },
  }
}
