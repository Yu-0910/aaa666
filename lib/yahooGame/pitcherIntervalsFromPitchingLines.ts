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
import { findRosterPlayerByPublicId } from "../npbRoster"

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
 *
 * 投手の所属チーム判定は次の優先順:
 *   1. `teamForYahooPlayerId` (startingLineup)
 *   2. `inferPitcherTeamForNf3Line` (plateAppearances の半回)
 *   3. roster.team が scoreboard の visitor/home のどちらかと厳密一致するなら採用
 *      （途中登板の中継ぎ投手は startingLineup に無いことが多いので必須）
 *
 * Sportsnavi の出場成績テーブルは「サマリ行（IP 空）」と「詳細行（IP あり）」の 2 段構造で
 * 取得できることがあり、最終回担当の投手の IP が詳細行に出ない試合がある（試合 2021038765
 * の松山晋也 [中日 9 回担当] など）。詳細行で thirds 区間を埋めた後、サマリ行に登場した
 * 投手で詳細に居ない ID を **末尾に未確定区間として追加**することで、9 回以降の打席にも
 * 利き腕解決ができるようにする。
 */
const FALLBACK_PITCHER_TAIL_THIRDS = 999

export function buildPitcherIntervalsByTeam(doc: CanonicalGameDocument): Map<string, PitcherInterval[]> {
  const out = new Map<string, PitcherInterval[]>()
  const lines: PitchingLine[] = doc.domain?.pitchingLines ?? []
  const board = doc.game?.scoreboard ?? []
  const visitor = board.length >= 2 ? String(board[0]?.teamName ?? "").trim() : ""
  const home = board.length >= 2 ? String(board[1]?.teamName ?? "").trim() : ""
  const teamFromRoster = (yid: string): string => {
    const r = findRosterPlayerByPublicId(yid)
    const t = String(r?.team ?? "").trim()
    if (!t) return ""
    if (t === visitor || t === home) return t
    return ""
  }
  const resolveTeam = (yid: string): string =>
    teamForYahooPlayerId(doc, yid) ||
    inferPitcherTeamForNf3Line(doc, yid) ||
    teamFromRoster(yid) ||
    ""
  // サマリ行（IP 空）に登場する yid をチーム別に収集（出現順を保つため Map<team, string[]>）
  const summaryIdsByTeam = new Map<string, string[]>()
  // 詳細行で push 済みの yid をチーム別に追跡
  const placedIdsByTeam = new Map<string, Set<string>>()
  for (const line of lines) {
    const yid = (line.yahooPlayerId ?? "").trim()
    if (!yid) continue
    const team = resolveTeam(yid)
    if (!team) continue
    const thirds = parseIpToThirds(line.ip)
    if (thirds <= 0) {
      const arr = summaryIdsByTeam.get(team) ?? []
      if (!arr.includes(yid)) arr.push(yid)
      summaryIdsByTeam.set(team, arr)
      continue
    }
    const list = out.get(team) ?? []
    const startThirds = list.length === 0 ? 0 : (list[list.length - 1]?.endThirds ?? 0)
    list.push({ yahooPitcherId: yid, startThirds, endThirds: startThirds + thirds })
    out.set(team, list)
    const placed = placedIdsByTeam.get(team) ?? new Set<string>()
    placed.add(yid)
    placedIdsByTeam.set(team, placed)
  }
  // 詳細行で取れていないがサマリ行には居る投手を、各チームの末尾に「未確定区間」として補完。
  // IP 不明なので endThirds は十分大きな値（FALLBACK_PITCHER_TAIL_THIRDS）を割り当て、
  // 残イニングを必ず覆うようにする。
  for (const [team, ids] of summaryIdsByTeam) {
    const list = out.get(team) ?? []
    const placed = placedIdsByTeam.get(team) ?? new Set<string>()
    let cursor = list.length === 0 ? 0 : (list[list.length - 1]?.endThirds ?? 0)
    for (const yid of ids) {
      if (placed.has(yid)) continue
      list.push({
        yahooPitcherId: yid,
        startThirds: cursor,
        endThirds: cursor + FALLBACK_PITCHER_TAIL_THIRDS,
      })
      cursor += FALLBACK_PITCHER_TAIL_THIRDS
      placed.add(yid)
    }
    placedIdsByTeam.set(team, placed)
    if (list.length > 0) out.set(team, list)
  }
  // 補完 (b): pitchingLines（詳細・サマリ両方）に出てこないが、`plateAppearances` には
  // pitcher_id として登場する投手を、相手チームの末尾に「未確定区間」として補完する。
  // 試合 2021038802 の西武 9 回裏のように、サヨナラなどで Sportsnavi の出場成績側に
  // 救援投手が記録されない試合に対応するため。
  const paLines = doc.domain?.plateAppearances ?? []
  const paPitchersByDefense = new Map<string, Set<string>>()
  for (const pa of paLines) {
    const pid = String((pa as { yahooPitcherId?: string }).yahooPitcherId ?? "").trim()
    if (!pid) continue
    const team = resolveTeam(pid)
    if (!team) continue
    const set = paPitchersByDefense.get(team) ?? new Set<string>()
    set.add(pid)
    paPitchersByDefense.set(team, set)
  }
  for (const [team, ids] of paPitchersByDefense) {
    const list = out.get(team) ?? []
    const placed = placedIdsByTeam.get(team) ?? new Set<string>()
    let cursor = list.length === 0 ? 0 : (list[list.length - 1]?.endThirds ?? 0)
    for (const yid of ids) {
      if (placed.has(yid)) continue
      list.push({
        yahooPitcherId: yid,
        startThirds: cursor,
        endThirds: cursor + FALLBACK_PITCHER_TAIL_THIRDS,
      })
      cursor += FALLBACK_PITCHER_TAIL_THIRDS
      placed.add(yid)
    }
    if (list.length > 0) out.set(team, list)
  }
  // 補完 (c): 各チームの最後の投手の `endThirds` を末尾まで延長する。
  // これは「Sportsnavi 側のデータ欠落で 9 回（または延長）に登板した救援投手が
  // 1 行も記録されないが、cells / plateAppearances には打席結果がある」場合に効く。
  // 「**何かしらの投手** が最終回も投げた」という事実だけは確実なので、その投手は
  // 直前の登板者の続きと仮定する（推測ではあるが、最後の投手以外の選択肢が無い）。
  for (const [team, list] of out) {
    if (list.length === 0) continue
    const last = list[list.length - 1]
    if (!last) continue
    if (last.endThirds < last.startThirds + FALLBACK_PITCHER_TAIL_THIRDS) {
      list[list.length - 1] = {
        ...last,
        endThirds: last.startThirds + FALLBACK_PITCHER_TAIL_THIRDS,
      }
      out.set(team, list)
    }
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
