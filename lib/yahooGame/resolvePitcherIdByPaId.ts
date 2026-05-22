/**
 * 打席ごとの投手 Yahoo ID 解決（vs_hand / 派生パイプライン共通）。
 *
 * carry-forward（直前投手引き継ぎ）と BF 割当は使わない。
 * 優先: 一球末尾 → PA 本体 → 実況タイムライン → 打席行の投手明示 → 先発（打席行のみ）
 */
import type { CanonicalGameDocument, PlateAppearance } from "./types"
import { yahooPitcherIdForVsHandFromPa } from "./yahooPitcherIdForVsHandFromPa"

function compactName(s: string): string {
  return String(s ?? "").replace(/\s/g, "").replace(/　/g, "").trim()
}

function pregameText(doc: CanonicalGameDocument): string {
  const secs = doc.game?.textPlayByPlay ?? []
  const pre = secs.find((x) => String(x?.sectionTitle ?? "").trim() === "試合前情報")
  const lines: string[] = Array.isArray(pre?.lines) ? pre!.lines : []
  return lines.join(" ")
}

function resolveTeamsFromPregame(preText: string): { visitorTeam: string; homeTeam: string } {
  const mVis = preText.match(/先攻[:：]\s*([^\sの]+?)のスターティングラインアップ/)
  const mHome = preText.match(/後攻[:：]\s*([^\sの]+?)のスターティングラインアップ/)
  return {
    visitorTeam: mVis?.[1] ? String(mVis[1]).trim() : "",
    homeTeam: mHome?.[1] ? String(mHome[1]).trim() : "",
  }
}

function resolveStartersFromPregame(
  preText: string,
  teams: { visitorTeam: string; homeTeam: string },
): { visitorStarter: string; homeStarter: string } {
  const mStart = preText.match(/先発ピッチャーは(.+?)(?:先攻[:：]|$)/)
  const startText = mStart?.[1] ? String(mStart[1]) : ""
  const pickNameForTeam = (team: string): string => {
    if (!team || !startText) return ""
    const r = new RegExp(`${team}が[^\\s]*\\s*([^、,\\s]+)`, "u")
    const mm = startText.match(r)
    return mm?.[1] ? String(mm[1]).trim() : ""
  }
  return {
    visitorStarter: pickNameForTeam(teams.visitorTeam),
    homeStarter: pickNameForTeam(teams.homeTeam),
  }
}

function paTextLine(doc: CanonicalGameDocument, paId?: string): string {
  const s = String(paId ?? "").trim()
  const m = s.match(/^\d+-(\d+)-(表|裏)-(\d+)$/)
  if (!m) return ""
  const secTitle = `${m[1]}回${m[2]}`
  const secs = doc.game?.textPlayByPlay ?? []
  const sec = secs.find((x) => String(x?.sectionTitle ?? "").trim() === secTitle)
  const lines: string[] = Array.isArray(sec?.lines) ? sec!.lines : []
  return lines.find((l) => new RegExp(`^\\s*${m[3]}\\s*[：:]`).test(String(l))) ?? ""
}

/**
 * 実況を時系列走査し、投手交代を反映した paId → yahooPitcherId マップ。
 */
export function buildPitcherIdByPaIdFromTextTimeline(
  doc: CanonicalGameDocument,
): Map<string, string> {
  const out = new Map<string, string>()
  const gameId = String(doc.gameId ?? "").trim()
  if (!gameId) return out

  const mentioned = doc.game?.yahooPlayersMentioned ?? {}
  const nameToId = new Map<string, string>()
  for (const [id, name] of Object.entries(mentioned)) {
    const k = compactName(String(name ?? "").trim())
    if (k && !nameToId.has(k)) nameToId.set(k, String(id).trim())
  }
  const resolveNameToId = (pname: string): string => {
    const key = compactName(pname)
    if (!key) return ""
    const direct = nameToId.get(key)
    if (direct) return direct
    for (const [k, id] of nameToId.entries()) {
      if (k && (k === key || k.includes(key) || key.includes(k))) return id
    }
    return ""
  }

  const pre = pregameText(doc)
  const teams = resolveTeamsFromPregame(pre)
  const starters = resolveStartersFromPregame(pre, teams)
  const homeStarterId = starters.homeStarter ? resolveNameToId(starters.homeStarter) : ""
  const visitorStarterId = starters.visitorStarter ? resolveNameToId(starters.visitorStarter) : ""

  let currentTop = homeStarterId
  let currentBottom = visitorStarterId

  const secs = doc.game?.textPlayByPlay ?? []
  for (const sec of secs) {
    const title = String(sec?.sectionTitle ?? "").trim()
    const m = title.match(/^(\d+)回(表|裏)$/)
    if (!m) continue
    const inning = m[1]
    const half = m[2]
    const lines: string[] = Array.isArray(sec?.lines) ? sec!.lines : []
    for (const line of lines) {
      const s = String(line ?? "")

      const ch =
        s.match(/投手交代\s*[:：]\s*[^→]+?→\s*([^\s、,]+)\b/u) ??
        s.match(/投手交代\s*[:：]\s*[^→]+?→\s*([^\s、,]+)\s*/u) ??
        s.match(/ピッチャー\s*([^\s]+?)\s*に代わって\s*([^\s、,]+)/u)
      if (ch) {
        const newName = ch[2] ? String(ch[2]).trim() : String(ch[1]).trim()
        const pid = resolveNameToId(newName)
        if (pid) {
          if (half === "表") currentTop = pid
          else currentBottom = pid
        }
      }

      const pm = s.match(/ピッチャー\s*([^\s]+?)(?:\s|に代わって|→|$)/u)
      if (pm?.[1] && !ch) {
        const pid = resolveNameToId(String(pm[1]).trim())
        if (pid) {
          if (half === "表") currentTop = pid
          else currentBottom = pid
        }
      }

      const om = s.match(/^\s*(\d+)\s*[：:]/u)
      if (om?.[1]) {
        const order = String(om[1])
        const paId = `${gameId}-${inning}-${half}-${order}`
        const pid = half === "表" ? currentTop : currentBottom
        if (pid) out.set(paId, pid)
      }
    }
  }
  return out
}

/** 打席行にピッチャー明示があるときのみ（先発フォールバックはタイムライン側に任せる）。 */
export function inferPitcherIdFromPaTextLine(
  doc: CanonicalGameDocument,
  paId?: string,
): string {
  const line = paTextLine(doc, paId)
  if (!line) return ""

  const mentioned = doc.game?.yahooPlayersMentioned ?? {}
  const nameToId = new Map<string, string>()
  for (const [id, name] of Object.entries(mentioned)) {
    const k = compactName(String(name ?? "").trim())
    if (k && !nameToId.has(k)) nameToId.set(k, String(id).trim())
  }

  const lm = String(line).match(/ピッチャー\s*([^\s]+?)(?:\s|に代わって|→|$)/)
  const pname = lm?.[1] ? String(lm[1]).trim() : ""
  if (!pname) return ""
  const key = compactName(pname)
  const direct = nameToId.get(key)
  if (direct) return direct
  for (const [k, id] of nameToId.entries()) {
    if (k && key && (k === key || k.includes(key))) return id
  }
  return ""
}

export type ResolvePitcherIdSource =
  | "pitch_events"
  | "pa_field"
  | "text_timeline"
  | "pa_line"
  | ""

/**
 * 1 打席の投手 Yahoo ID（無ければ空文字）。BF / carry-forward は使わない。
 */
export function resolvePitcherIdForPlateAppearance(
  doc: CanonicalGameDocument,
  pa: PlateAppearance,
  timeline?: Map<string, string>,
): { pitcherId: string; source: ResolvePitcherIdSource } {
  const fromPa = yahooPitcherIdForVsHandFromPa(pa)
  if (fromPa) {
    const pe = pa.pitchEvents ?? []
    const lastPeId =
      pe.length > 0 ? String(pe[pe.length - 1]?.yahooPitcherId ?? "").trim() : ""
    const paField = String(pa.yahooPitcherId ?? "").trim()
    if (lastPeId && lastPeId === fromPa) return { pitcherId: fromPa, source: "pitch_events" }
    if (paField && paField === fromPa) return { pitcherId: fromPa, source: "pa_field" }
    return { pitcherId: fromPa, source: "pitch_events" }
  }

  const paId = String(pa.paId ?? "").trim()
  const tl = timeline ?? buildPitcherIdByPaIdFromTextTimeline(doc)
  const fromTimeline = paId ? (tl.get(paId) ?? "") : ""
  if (fromTimeline) return { pitcherId: fromTimeline, source: "text_timeline" }

  const fromLine = inferPitcherIdFromPaTextLine(doc, paId)
  if (fromLine) return { pitcherId: fromLine, source: "pa_line" }

  return { pitcherId: "", source: "" }
}

function patchPitchEventsPitcherId(
  events: PlateAppearance["pitchEvents"],
  pid: string,
): PlateAppearance["pitchEvents"] {
  if (!events?.length) return events
  const ev0 = events[0]
  if ((ev0.yahooPitcherId ?? "").trim()) return events
  return [{ ...ev0, yahooPitcherId: pid }, ...events.slice(1)]
}

/**
 * canonical 内の全 plateAppearances に解決済み yahooPitcherId を書き込む（メモリ上）。
 * 既に ID がある打席は pitchEvents 末尾と矛盾する場合のみ上書きしない（末尾優先で既に取れているため）。
 */
export function enrichPlateAppearancesWithResolvedPitcherIds(
  doc: CanonicalGameDocument,
): CanonicalGameDocument {
  const pas = doc.domain?.plateAppearances ?? []
  if (pas.length === 0) return doc

  const timeline = buildPitcherIdByPaIdFromTextTimeline(doc)
  let changed = false
  const nextPas: PlateAppearance[] = pas.map((pa) => {
    const existing = yahooPitcherIdForVsHandFromPa(pa)
    if (existing) return pa

    const { pitcherId } = resolvePitcherIdForPlateAppearance(doc, pa, timeline)
    if (!pitcherId) return pa

    changed = true
    return {
      ...pa,
      yahooPitcherId: pitcherId,
      pitchEvents: patchPitchEventsPitcherId(pa.pitchEvents, pitcherId),
    }
  })

  if (!changed) return doc

  const pitchEventsFlat = nextPas.flatMap((p) => p.pitchEvents ?? [])
  return {
    ...doc,
    domain: {
      ...doc.domain,
      plateAppearances: nextPas,
      pitchEvents: pitchEventsFlat,
    },
  }
}
