import type { CanonicalGameDocument, PickoffCatchMissInvestigation, RunnerEvent } from "./types"
import {
  extractPlayDescriptionPlainFromScoreHtml,
  groupScoreSnapshotsByPlatePrefix,
  mergedScoreNarrativesForPlateGroups,
} from "./runnerEventsFromSportsnaviScore"
import { buildNameKeyToYahooIdMap, normalizeJaNameKey } from "./runnerEventsFromTextPlayByPlay"

const PICKOFF_MISS_TEXT_RE = /のけん制球を捕球ミス|けん制球を捕球ミス/

function textPlayByPlayHasPickoffCatchMiss(doc: CanonicalGameDocument): boolean {
  for (const sec of doc.game?.textPlayByPlay ?? []) {
    for (const line of sec.lines ?? []) {
      if (PICKOFF_MISS_TEXT_RE.test(String(line ?? ""))) return true
    }
  }
  return false
}

function narrativeMatchesFielderHint(narrative: string, hint: string): boolean {
  const h = hint.normalize("NFKC").trim()
  if (!h) return false
  if (narrative.includes(h)) return true
  const short = h.length <= 2 ? h : h.slice(0, Math.min(4, h.length))
  return short.length >= 2 && narrative.includes(short)
}

function inningHalfFromSectionTitle(sectionTitle: string): string | undefined {
  const s = String(sectionTitle ?? "").trim()
  const m = s.match(/^(\d+)回(表|裏)$/)
  if (!m) return undefined
  return `${m[1]}回${m[2]}`
}

/** テキスト行先頭の「◯◯幸 (一):」形式から守備者名のヒント */
function fielderNameHintFromTextLine(line: string): string | undefined {
  const s = String(line ?? "").trim()
  const m = s.match(/^([^\s(（]+)\s*[\(（]/)
  if (!m) return undefined
  const raw = String(m[1] ?? "").trim()
  return raw || undefined
}

function extractSbCsRunnerIdsFromNarrative(
  narrative: string,
  nameToId: Map<string, string>,
): { sb: string[]; cs: string[] } {
  const sb: string[] = []
  const cs: string[] = []
  const add = (kind: "SB" | "CS", rawName: string) => {
    const yid = nameToId.get(normalizeJaNameKey(rawName))
    if (!yid) return
    if (kind === "SB" && !sb.includes(yid)) sb.push(yid)
    if (kind === "CS" && !cs.includes(yid)) cs.push(yid)
  }
  const n = String(narrative ?? "")
  let m: RegExpExecArray | null
  const reSb = /盗塁成功（([^）]{1,24})）/g
  while ((m = reSb.exec(n)) !== null) add("SB", m[1]!.trim())
  const reCs =
    /(盗塁失敗|盗塁死|盗塁刺|二盗死|三盗死|盗塁を試みるも(?:アウト|タッチアウト)|けん制死|牽制死|けん制アウト|牽制アウト|挟殺)（([^）]{1,24})）/g
  while ((m = reCs.exec(n)) !== null) add("CS", m[2]!.trim())
  return { sb, cs }
}

/**
 * テキスト速報の「けん制＋捕球ミス」行と、同一イニングの score 記録文（打席単位で結合）を突き合わせる。
 */
export function buildPickoffCatchMissInvestigations(args: {
  doc: CanonicalGameDocument
  snapshots: Array<{ scoreIndex: string; html: string }>
}): PickoffCatchMissInvestigation[] {
  const { doc, snapshots } = args
  const out: PickoffCatchMissInvestigation[] = []
  if (!textPlayByPlayHasPickoffCatchMiss(doc)) {
    return out
  }

  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    for (const sec of doc.game?.textPlayByPlay ?? []) {
      const inningHalf = inningHalfFromSectionTitle(sec.sectionTitle)
      for (const line of sec.lines ?? []) {
        const s = String(line ?? "")
        if (!PICKOFF_MISS_TEXT_RE.test(s)) continue
        out.push({
          textLine: s.trim(),
          inningHalf,
          inferredCsRunnerIds: [],
          status: "no_score_raw",
        })
      }
    }
    return out
  }

  const nameToId = buildNameKeyToYahooIdMap(doc)
  const groups = groupScoreSnapshotsByPlatePrefix(snapshots)
  const narrativesByPrefix = mergedScoreNarrativesForPlateGroups(groups)
  const byInning = new Map<string, Array<{ prefix: string; narrative: string }>>()
  for (const [prefix, narrative] of narrativesByPrefix.entries()) {
    if (!narrative || !/捕球ミス/.test(narrative)) continue
    const sampleIndex = `${prefix}00`
    const ih =
      sampleIndex.length >= 3
        ? (() => {
            const inning = parseInt(sampleIndex.slice(0, 2), 10)
            const b = sampleIndex[2]
            const tb = b === "1" ? "表" : b === "2" ? "裏" : ""
            return Number.isFinite(inning) && tb ? `${inning}回${tb}` : undefined
          })()
        : undefined
    if (!ih) continue
    const arr = byInning.get(ih) ?? []
    arr.push({ prefix, narrative })
    byInning.set(ih, arr)
  }

  for (const sec of doc.game?.textPlayByPlay ?? []) {
    const inningHalf = inningHalfFromSectionTitle(sec.sectionTitle)
    for (const line of sec.lines ?? []) {
      const s = String(line ?? "")
      if (!PICKOFF_MISS_TEXT_RE.test(s)) continue

      const hint = fielderNameHintFromTextLine(s)
      const candidates = inningHalf ? (byInning.get(inningHalf) ?? []) : []

      let narrative: string | undefined
      if (candidates.length === 1) {
        narrative = candidates[0]!.narrative
      } else if (candidates.length > 1 && hint) {
        const scored = candidates.map((c) => ({
          c,
          score: narrativeMatchesFielderHint(c.narrative, hint) ? 2 : 0,
        }))
        scored.sort((a, b) => b.score - a.score)
        if (scored[0]!.score > 0) narrative = scored[0]!.c.narrative
        else narrative = candidates[0]!.narrative
      } else if (candidates.length > 1) {
        narrative = candidates[0]!.narrative
      }

      if (!narrative) {
        out.push({
          textLine: s.trim(),
          inningHalf,
          inferredCsRunnerIds: [],
          status: "no_score_narrative",
        })
        continue
      }

      const { sb, cs } = extractSbCsRunnerIdsFromNarrative(narrative, nameToId)
      out.push({
        textLine: s.trim(),
        inningHalf,
        scoreNarrativeJa: narrative,
        inferredCsRunnerIds: cs,
        inferredSbRunnerIds: sb.length > 0 ? sb : undefined,
        status: "resolved",
      })
    }
  }

  return out
}

/**
 * 調査結果の CS 走者が runnerEvents に含まれるか（デバッグ・検証用）。
 */
export function pickoffInvestigationCsCoveredByRunnerEvents(
  inv: PickoffCatchMissInvestigation,
  events: RunnerEvent[] | undefined,
): boolean {
  if (!inv.inferredCsRunnerIds.length) return true
  const csIds = new Set(
    (events ?? []).filter((e) => e.kind === "CS").map((e) => String(e.yahooRunnerId)),
  )
  return inv.inferredCsRunnerIds.every((id) => csIds.has(id))
}
