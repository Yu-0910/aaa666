import type { CanonicalGameDocument, RunnerEvent } from "./types"
import { buildNameKeyToYahooIdMap, normalizeJaNameKey } from "./runnerEventsFromTextPlayByPlay"

/**
 * Yahoo `score?index=` の7桁 index から表裏まで復元（サフィックスは無視）。
 */
export function inningHalfFromYahooScoreIndex(index: string): string | undefined {
  const s = String(index ?? "").trim()
  if (!/^\d{7}$/.test(s)) return undefined
  const inning = parseInt(s.slice(0, 2), 10)
  const b = s[2]
  if (b !== "1" && b !== "2") return undefined
  const tb = b === "1" ? "表" : "裏"
  if (!Number.isFinite(inning) || inning < 1 || inning > 99) return undefined
  return `${inning}回${tb}`
}

/** 同一打席の score スナップショットは先頭5桁（イニング・表裏・打順）が同じ */
export function plateAppearancePrefixFromScoreIndex(index: string): string | undefined {
  const s = String(index ?? "").trim()
  if (!/^\d{7}$/.test(s)) return undefined
  return s.slice(0, 5)
}

export function groupScoreSnapshotsByPlatePrefix(
  snapshots: Array<{ scoreIndex: string; html: string }>,
): Map<string, Array<{ scoreIndex: string; html: string }>> {
  const m = new Map<string, Array<{ scoreIndex: string; html: string }>>()
  for (const snap of snapshots) {
    const p = plateAppearancePrefixFromScoreIndex(snap.scoreIndex)
    if (!p) continue
    const arr = m.get(p) ?? []
    arr.push(snap)
    m.set(p, arr)
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => a.scoreIndex.localeCompare(b.scoreIndex))
  }
  return m
}

function stripScoreHtmlToPlain(html: string): string {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * 一球速報スコア HTML から、牽制・盗塁まわりの記録寄りナレーション1塊を抜き出す（best-effort）。
 * 表記はスポナビのリニューアルで変わり得る。
 */
export function extractPlayDescriptionPlainFromScoreHtml(html: string): string | null {
  const t = stripScoreHtmlToPlain(html)
  if (!t) return null

  const tryFrom = (start: number): string | null => {
    if (start < 0) return null
    let slice = t.slice(start, start + 420)
    const pitchWord = slice.search(
      /\s(カットボール|ストレート|ツーシーム|スライダー|フォーク|チェンジアップ|シュート|カーブ|Splitter|スプリット)/,
    )
    if (pitchWord > 30) slice = slice.slice(0, pitchWord)
    slice = slice.replace(/\s+/g, " ").trim()
    return slice.length >= 8 ? slice : null
  }

  const markers: RegExp[] = [
    /[一1]塁けん制\s+/,
    /[一1]塁牽制\s+/,
    /けん制飛び出し（/,
    /盗塁失敗（/,
    /盗塁成功（/,
    /盗塁死（/,
  ]
  let bestStart = -1
  for (const re of markers) {
    const m = t.match(re)
    if (m?.index !== undefined && (bestStart < 0 || m.index < bestStart)) bestStart = m.index
  }
  const fromMarker = tryFrom(bestStart)
  if (fromMarker) return fromMarker

  const fallback = t.match(
    /(盗塁(?:成功|失敗|死|刺)|[二三]盗死|けん制(?:死|アウト)|牽制(?:死|アウト)|挟殺|盗塁を試みるも(?:アウト|タッチアウト))（[^）]{1,16}）/,
  )
  if (fallback?.index !== undefined) return tryFrom(Math.max(0, fallback.index - 12))
  return null
}

/**
 * 打席ごとに複数 index の HTML から取り出した記録文を結合（盗塁失敗が別ページにある場合に必要）。
 */
export function mergedScoreNarrativesForPlateGroups(
  groups: Map<string, Array<{ scoreIndex: string; html: string }>>,
): Map<string, string> {
  const out = new Map<string, string>()
  for (const [prefix, arr] of groups.entries()) {
    const parts: string[] = []
    const seen = new Set<string>()
    for (const { html } of arr) {
      const d = extractPlayDescriptionPlainFromScoreHtml(html)
      if (d && !seen.has(d)) {
        seen.add(d)
        parts.push(d)
      }
    }
    const merged = parts.join(" ").replace(/\s+/g, " ").trim()
    if (merged.length >= 8) out.set(prefix, merged)
  }
  return out
}

type LabelRule = { kind: RunnerEvent["kind"]; re: RegExp }

const SCORE_RUNNER_LABELS: LabelRule[] = [
  { kind: "SB", re: /盗塁成功（([^）]{1,24})）/g },
  { kind: "CS", re: /盗塁失敗（([^）]{1,24})）/g },
  { kind: "CS", re: /盗塁死（([^）]{1,24})）/g },
  { kind: "CS", re: /盗塁刺（([^）]{1,24})）/g },
  { kind: "CS", re: /二盗死（([^）]{1,24})）/g },
  { kind: "CS", re: /三盗死（([^）]{1,24})）/g },
  { kind: "CS", re: /盗塁を試みるも(?:アウト|タッチアウト)（([^）]{1,24})）/g },
  { kind: "CS", re: /けん制死（([^）]{1,24})）/g },
  { kind: "CS", re: /牽制死（([^）]{1,24})）/g },
  { kind: "CS", re: /けん制アウト（([^）]{1,24})）/g },
  { kind: "CS", re: /牽制アウト（([^）]{1,24})）/g },
  { kind: "CS", re: /挟殺（([^）]{1,24})）/g },
]

function parseRunnerEventsFromDescriptionLine(args: {
  gameId: string
  inningHalf: string | undefined
  scoreIndex: string
  description: string
  nameToId: Map<string, string>
}): RunnerEvent[] {
  const { gameId, inningHalf, scoreIndex, description, nameToId } = args
  const line = String(description ?? "").replace(/\s+/g, " ").trim()
  if (!line) return []

  const found: RunnerEvent[] = []
  let localSeq = 0

  for (const { kind, re } of SCORE_RUNNER_LABELS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      const rawName = String(m[1] ?? "").trim()
      if (!rawName) continue
      const key = normalizeJaNameKey(rawName)
      const yid = nameToId.get(key)
      if (!yid) continue
      localSeq += 1
      found.push({
        eventId: `${gameId}-score-${scoreIndex}-${localSeq}`,
        inningHalf,
        kind,
        yahooRunnerId: yid,
        runnerNameJa: rawName || undefined,
        sourceLine: `[${scoreIndex}] ${line}`.slice(0, 500),
        sourceTier: "score",
      })
    }
  }

  const dedup = new Map<string, RunnerEvent>()
  for (const e of found) {
    const k = `${e.kind}|${e.inningHalf ?? ""}|${e.yahooRunnerId}`
    if (!dedup.has(k)) dedup.set(k, e)
  }
  return [...dedup.values()]
}

/**
 * 1試合分の score スナップショット HTML から RunnerEvent を集約する。
 * 同一打席の複数 index は記録文を結合してからパースする。
 */
export function runnerEventsFromSportsnaviScoreSnapshots(args: {
  gameId: string
  doc: CanonicalGameDocument
  snapshots: Array<{ scoreIndex: string; html: string }>
}): RunnerEvent[] {
  const { gameId, doc, snapshots } = args
  if (!Array.isArray(snapshots) || snapshots.length === 0) return []

  const nameToId = buildNameKeyToYahooIdMap(doc)
  const groups = groupScoreSnapshotsByPlatePrefix(snapshots)
  const narratives = mergedScoreNarrativesForPlateGroups(groups)
  const byKey = new Map<string, RunnerEvent>()
  let seq = 0

  for (const [prefix, mergedDesc] of narratives.entries()) {
    const sampleIndex = `${prefix}00`
    const inningHalf = inningHalfFromYahooScoreIndex(sampleIndex)
    const chunk = parseRunnerEventsFromDescriptionLine({
      gameId,
      inningHalf,
      scoreIndex: sampleIndex,
      description: mergedDesc,
      nameToId,
    })
    for (const e of chunk) {
      const k = `${e.kind}|${e.inningHalf ?? ""}|${e.yahooRunnerId}`
      if (byKey.has(k)) continue
      seq += 1
      byKey.set(k, { ...e, eventId: `${gameId}-score-${seq}` })
    }
  }

  return [...byKey.values()]
}
