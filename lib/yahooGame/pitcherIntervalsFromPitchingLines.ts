/**
 * Phase 28: 出場成績テーブルの `cells[14..]`（回ごとの打席結果列）から
 * 「不明 PA の発生回」を特定したあと、その回に登板していた投手 ID を
 * `pitchingLines` の登板順 + ip 累積から逆算する。
 *
 * - ip = "2.1" → 7/3 thirds（2回1/3 = 1/3 イニングが 7 個分）
 * - ip = "0.2" → 2 thirds
 * - ip = "1"   → 3 thirds
 *
 * 同じ回に複数の投手が登板しているケース（半回中に交代）は曖昧なので
 * `null` を返す。これは Phase 27 までの「R/L 按分禁止」原則と同じ温度感で、
 * 確証が無いものは `unknown` バケツに残す。
 */
import type { CanonicalGameDocument, PitchingLine } from "./types"
import { teamForYahooPlayerId, inferPitcherTeamForNf3Line } from "./pitcherPocHelpers"

export interface PitcherInterval {
  yahooPitcherId: string
  /** 登板開始時点での累積 thirds（防御チーム単位、初回先発投手で 0） */
  startThirds: number
  /** 登板終了時点での累積 thirds（excl）*/
  endThirds: number
}

/** ip 文字列（"2.1" 等）を thirds（1/3 イニング単位の整数）に変換。 */
export function parseIpToThirds(ip: string | undefined | null): number {
  const s = String(ip ?? "").trim()
  if (!s) return 0
  // "2", "2.0", "2.1", "2.2"
  const m = s.match(/^(\d+)(?:\.(\d))?$/)
  if (!m) return 0
  const whole = parseInt(m[1] ?? "0", 10)
  const frac = m[2] ? parseInt(m[2], 10) : 0
  if (!Number.isFinite(whole) || !Number.isFinite(frac)) return 0
  // Yahoo の表記は .0/.1/.2 のみ。それ以外は守備的に 0 扱い。
  if (frac < 0 || frac > 2) return whole * 3
  return whole * 3 + frac
}

/**
 * `pitchingLines` を防御チーム別にグループ化し、登板順に thirds の累積区間を割り当てる。
 * 同チームの並び順は `pitchingLines` の出現順（出場成績テーブルの上から下）と仮定。
 */
export function buildPitcherIntervalsByTeam(doc: CanonicalGameDocument): Map<string, PitcherInterval[]> {
  const out = new Map<string, PitcherInterval[]>()
  const lines: PitchingLine[] = doc.domain?.pitchingLines ?? []
  for (const line of lines) {
    const yid = (line.yahooPlayerId ?? "").trim()
    if (!yid) continue
    const team = teamForYahooPlayerId(doc, yid) || inferPitcherTeamForNf3Line(doc, yid) || ""
    if (!team) continue
    const thirds = parseIpToThirds(line.ip)
    if (thirds <= 0) continue
    const list = out.get(team) ?? []
    const startThirds = list.length === 0 ? 0 : (list[list.length - 1]?.endThirds ?? 0)
    list.push({ yahooPitcherId: yid, startThirds, endThirds: startThirds + thirds })
    out.set(team, list)
  }
  return out
}

/**
 * 打者所属チーム `batterTeam` の inning N（1〜）の打席で登板していた可能性のある投手 ID を返す。
 * - 半回内に 1 投手のみ → `{ kind: 'unique', pitcherId }`
 * - 半回内に複数投手 → `{ kind: 'ambiguous', candidates }`（呼び出し側で利き腕一致なら採用可）
 * - 防御チームが特定できない・登板情報が無い → `null`
 */
export function resolvePitchersForBatterInning(
  doc: CanonicalGameDocument,
  batterTeam: string,
  inning: number,
):
  | { kind: "unique"; pitcherId: string }
  | { kind: "ambiguous"; candidates: string[] }
  | null {
  if (!batterTeam || !Number.isFinite(inning) || inning < 1) return null
  const board = doc.game?.scoreboard ?? []
  if (board.length < 2) return null
  const visitor = (board[0]?.teamName ?? "").trim()
  const home = (board[1]?.teamName ?? "").trim()
  if (!visitor || !home) return null
  const defenseTeam = batterTeam === visitor ? home : batterTeam === home ? visitor : ""
  if (!defenseTeam) return null

  const intervals = buildPitcherIntervalsByTeam(doc).get(defenseTeam)
  if (!intervals || intervals.length === 0) return null

  // inning N の三分の一区間 [(N-1)*3, N*3)
  const inningStart = (inning - 1) * 3
  const inningEnd = inning * 3
  const overlapping = intervals.filter(
    (iv) => iv.startThirds < inningEnd && iv.endThirds > inningStart,
  )
  if (overlapping.length === 0) return null
  if (overlapping.length === 1) return { kind: "unique", pitcherId: overlapping[0]!.yahooPitcherId }
  return { kind: "ambiguous", candidates: overlapping.map((iv) => iv.yahooPitcherId) }
}

/** 後方互換: ユニーク特定のみを返す薄いラッパー */
export function resolvePitcherForBatterInning(
  doc: CanonicalGameDocument,
  batterTeam: string,
  inning: number,
): string | null {
  const r = resolvePitchersForBatterInning(doc, batterTeam, inning)
  return r && r.kind === "unique" ? r.pitcherId : null
}

/**
 * 該当回 N に登板していた投手とそれぞれの「inning 内 thirds カバー量」を返す。
 * 半回内に複数投手登板の場合、cover が大きい順にソート。
 */
export function listPitcherCoverageInBatterInning(
  doc: CanonicalGameDocument,
  batterTeam: string,
  inning: number,
): Array<{ pitcherId: string; coverThirds: number }> {
  if (!batterTeam || !Number.isFinite(inning) || inning < 1) return []
  const board = doc.game?.scoreboard ?? []
  if (board.length < 2) return []
  const visitor = (board[0]?.teamName ?? "").trim()
  const home = (board[1]?.teamName ?? "").trim()
  if (!visitor || !home) return []
  const defenseTeam = batterTeam === visitor ? home : batterTeam === home ? visitor : ""
  if (!defenseTeam) return []
  const intervals = buildPitcherIntervalsByTeam(doc).get(defenseTeam)
  if (!intervals || intervals.length === 0) return []
  const inningStart = (inning - 1) * 3
  const inningEnd = inning * 3
  const out: Array<{ pitcherId: string; coverThirds: number }> = []
  for (const iv of intervals) {
    const overlapStart = Math.max(iv.startThirds, inningStart)
    const overlapEnd = Math.min(iv.endThirds, inningEnd)
    const cover = Math.max(0, overlapEnd - overlapStart)
    if (cover > 0) out.push({ pitcherId: iv.yahooPitcherId, coverThirds: cover })
  }
  out.sort((a, b) => b.coverThirds - a.coverThirds)
  return out
}
