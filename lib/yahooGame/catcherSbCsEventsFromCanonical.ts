/**
 * canonical から捕手帰属用の盗塁成功/失敗イベントを抽出する。
 * - 正本: domain.runnerEvents（score 由来）
 * - 補完: textPlayByPlay（canonicalBattingSeasonAgg と同型パターン）
 */

import { buildNameKeyToYahooIdMap, normalizeJaNameKey } from "./runnerEventsFromTextPlayByPlay"
import type { CanonicalGameDocument } from "./types"

export type SbCsEvent = {
  inningHalf: string
  kind: "SB" | "CS"
  paSeqInHalf: number | null
  runnerYahooId?: string
}

function paSeqFromScoreSourceLine(sourceLine: string): number | null {
  const m = String(sourceLine ?? "").match(/\[(\d{7})\]/)
  if (!m) return null
  const seq = parseInt(m[1]!.slice(3, 5), 10)
  return Number.isFinite(seq) && seq > 0 ? seq : null
}

function paSeqFromPlayLine(line: string): number | null {
  const m = String(line ?? "").match(/^(\d+)[：:]/)
  if (!m) return null
  const seq = Number(m[1])
  return Number.isFinite(seq) && seq > 0 ? seq : null
}

/** けん制球に誘い出された走塁死は NPB の盗塁刺に含めない */
export function isPickoffInducedCsLine(line: string): boolean {
  return /けん制球に誘い出され盗塁失敗/.test(String(line ?? ""))
}

function sbCsDedupeKey(
  inningHalf: string,
  kind: "SB" | "CS",
  yid: string,
  paSeqInHalf: number | null,
): string {
  if (paSeqInHalf != null && paSeqInHalf > 0) {
    return `${inningHalf}\t${kind}\t${yid}\tpa${paSeqInHalf}`
  }
  return `${inningHalf}\t${kind}\t${yid}`
}

export function sbCsEventsFromCanonical(doc: CanonicalGameDocument): SbCsEvent[] {
  const events: SbCsEvent[] = []
  const seen = new Set<string>()

  for (const e of doc.domain?.runnerEvents ?? []) {
    const inningHalf = String(e.inningHalf ?? "").trim()
    const kind = e.kind
    const yid = String(e.yahooRunnerId ?? "").trim()
    if (!inningHalf || !yid || (kind !== "SB" && kind !== "CS")) continue
    if (kind === "CS" && isPickoffInducedCsLine(e.sourceLine ?? "")) continue
    const paSeqInHalf =
      paSeqFromScoreSourceLine(e.sourceLine ?? "") ?? paSeqFromPlayLine(e.sourceLine ?? "")
    const key = sbCsDedupeKey(inningHalf, kind, yid, paSeqInHalf)
    if (seen.has(key)) continue
    seen.add(key)
    events.push({ inningHalf, kind, paSeqInHalf, runnerYahooId: yid })
  }

  const nameToId = buildNameKeyToYahooIdMap(doc)
  const patterns: Array<{ kind: "SB" | "CS"; re: RegExp }> = [
    { kind: "SB", re: /走者\s*([^\s:：]+)\s*[:：]\s*盗塁成功/ },
    { kind: "CS", re: /走者\s*([^\s:：]+)\s*[:：]\s*(盗塁死|盗塁失敗)/ },
    { kind: "SB", re: /ランナー\s*([^\s:：]+)\s*[:：]\s*盗塁成功/ },
    { kind: "CS", re: /ランナー\s*([^\s:：]+)\s*[:：]\s*(盗塁死|盗塁失敗)/ },
    { kind: "SB", re: /[一二三]塁走者\s*([^\s:：]+)\s*[:：]\s*盗塁成功/ },
    { kind: "CS", re: /[一二三]塁走者\s*([^\s:：]+)\s*[:：]\s*(盗塁死|盗塁失敗)/ },
    { kind: "CS", re: /[一二三]塁走者\s*([^\s:：]+)\s*[:：]\s*盗塁(?:を)?試みるもアウト/ },
    { kind: "CS", re: /[一二三]塁走者\s*([^\s:：]+)\s*も\s*盗塁(?:死|失敗)/ },
    { kind: "CS", re: /[一二三]塁(?:けん制|牽制)\s*[:：]\s*ランナー\s*([^\s:：]+)\s*(?:アウト|タッチアウト|挟殺)(?!.*帰塁)(?!.*バッターアウト)/ },
  ]

  for (const sec of doc.game?.textPlayByPlay ?? []) {
    const inningHalf = String(sec.sectionTitle ?? "").trim()
    if (!inningHalf) continue
    for (const line of sec.lines ?? []) {
      const s = String(line ?? "")
      const paSeqInHalf = paSeqFromPlayLine(s)
      for (const { kind, re } of patterns) {
        if (kind === "CS" && isPickoffInducedCsLine(s)) continue
        const m = s.match(re)
        if (!m) continue
        const nameKey = normalizeJaNameKey(m[1] ?? "")
        const yid = nameToId.get(nameKey)
        if (!yid) continue
        const dedupeKey = sbCsDedupeKey(inningHalf, kind, yid, paSeqInHalf)
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        events.push({ inningHalf, kind, paSeqInHalf, runnerYahooId: yid })
      }
    }
  }

  return events
}
