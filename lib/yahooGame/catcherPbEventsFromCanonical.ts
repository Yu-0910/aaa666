/**
 * canonical 実況から捕手帰属用のパスボール・捕逸イベントを抽出する。
 * 暴投（投手責任）は含めない。
 */

import { compactPlayerName } from "@/lib/playerNameNormalize"
import { explicitCatcherNameFromPbpLine } from "@/lib/catcherAppearances"
import { buildNameKeyToYahooIdMap, normalizeJaNameKey } from "./runnerEventsFromTextPlayByPlay"
import type { CanonicalGameDocument } from "./types"

export type CatcherPbEvent = {
  inningHalf: string
  paSeqInHalf: number | null
  /** 実況に (捕): があればその選手名 */
  explicitCatcherName: string | null
}

function paSeqFromPlayLine(line: string): number | null {
  const m = String(line ?? "").match(/^(\d+)[：:]/)
  if (!m) return null
  const seq = Number(m[1])
  return Number.isFinite(seq) && seq > 0 ? seq : null
}

/** 捕手責任のパスボール・捕逸行か（暴投のみの行は false） */
export function isCatcherPbLine(line: string): boolean {
  const s = String(line ?? "").trim()
  if (!s) return false
  if (/パスボールによる振り逃げ/.test(s)) return true
  if (/\(捕\)\s*[:：]\s*(?:パスボール|捕逸)/.test(s)) return true
  if (/\(捕\)[^:：]*(?:パスボール|捕逸)/.test(s)) return true
  return false
}

export function catcherPbEventsFromCanonical(doc: CanonicalGameDocument): CatcherPbEvent[] {
  const events: CatcherPbEvent[] = []
  const seen = new Set<string>()

  for (const sec of doc.game?.textPlayByPlay ?? []) {
    const inningHalf = String(sec.sectionTitle ?? "").trim()
    if (!inningHalf) continue
    for (const raw of sec.lines ?? []) {
      const line = String(raw ?? "")
      if (!isCatcherPbLine(line)) continue
      const paSeqInHalf = paSeqFromPlayLine(line)
      const dedupe = `${inningHalf}\t${paSeqInHalf ?? 0}\t${line}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      events.push({
        inningHalf,
        paSeqInHalf,
        explicitCatcherName: explicitCatcherNameFromPbpLine(line),
      })
    }
  }

  return events
}

export function resolveCatcherYahooIdForPbEvent(
  doc: CanonicalGameDocument,
  ev: CatcherPbEvent,
  timeline: Map<string, string>,
  nameToId: Map<string, string>,
): string | null {
  const explicit = String(ev.explicitCatcherName ?? "").trim()
  if (explicit) {
    const key = normalizeJaNameKey(compactPlayerName(explicit))
    const fromName = key ? nameToId.get(key) ?? null : null
    if (fromName) return fromName
  }
  if (ev.paSeqInHalf != null && ev.paSeqInHalf > 0) {
    const fromTimeline = timeline.get(`${ev.inningHalf}\t${ev.paSeqInHalf}`)
    if (fromTimeline) return fromTimeline
  }
  return null
}

export function buildNameKeyToYahooIdMapForPb(doc: CanonicalGameDocument): Map<string, string> {
  return buildNameKeyToYahooIdMap(doc)
}
