/**
 * canonical の一球テキストから打席ごとの得点（自責点近似）を推定する。
 * scoreboard が空の現行 canonical 向けに、試合前情報 + injectTeamsFromTextPbpIfMissing を利用。
 */

import type { CanonicalGameDocument, PlateAppearance } from "./types"
import { injectTeamsFromTextPbpIfMissing } from "./inferTeamsFromTextPbp"
import { comparePlateAppearances } from "./pitcherPocHelpers"

/** 一球表記のチーム略称（神→阪神、巨→巨人 等） */
function teamScoreMarks(teamName: string): Set<string> {
  const marks = new Set<string>()
  const s = (teamName ?? "").trim()
  if (!s) return marks
  marks.add(s[0]!)
  if (/阪神|タイガース/.test(s)) {
    marks.add("神")
    marks.add("阪")
  }
  if (/巨人|読売/.test(s)) {
    marks.add("巨")
    marks.add("読")
  }
  if (/広島|カープ/.test(s)) {
    marks.add("広")
    marks.add("カ")
  }
  if (/ヤクルト|スワローズ/.test(s)) marks.add("ヤ")
  if (/DeNA|横浜|ベイスターズ/.test(s)) {
    marks.add("デ")
    marks.add("横")
  }
  if (/中日|ドラゴン/.test(s)) marks.add("中")
  if (/ソフトバンク|ホーク/.test(s)) {
    marks.add("ソ")
    marks.add("ホ")
  }
  if (/日本ハム|ファイター/.test(s)) {
    marks.add("日")
    marks.add("ハ")
  }
  if (/西武|ライオン/.test(s)) {
    marks.add("西")
    marks.add("獅")
  }
  if (/ロッテ|マリン/.test(s)) {
    marks.add("ロ")
    marks.add("マ")
  }
  if (/楽天|イーグル/.test(s)) marks.add("楽")
  if (/オリックス|バファロー/.test(s)) {
    marks.add("オ")
    marks.add("バ")
  }
  return marks
}

function halfKeyFromPaId(paId: string): string | null {
  const parts = (paId ?? "").split("-")
  if (parts.length < 4) return null
  const inning = parts[parts.length - 3]
  const halfStr = parts[parts.length - 2]
  if (halfStr !== "表" && halfStr !== "裏") return null
  return `${inning}-${halfStr}`
}

function isPaLikePlayByPlayLine(line: string): boolean {
  const s = (line ?? "").trim()
  if (!s) return false
  if (s.startsWith("－")) return false
  if (/けん制|コーチマウンド|タイム|守備交代|投手交代|代打|代走|盗塁|暴投|ボーク/.test(s)) return false
  return /アウト|ヒット|安打|二塁打|三塁打|本塁打|ホームラン|四球|敬遠|死球|三振|併殺|犠打|犠飛/.test(s)
}

function parseInningHalfFromSectionTitle(t: string): { inning: number; half: "表" | "裏" } | null {
  const s = (t ?? "").trim()
  const m = s.match(/^(\d+)回(表|裏)$/)
  if (!m) return null
  const inning = parseInt(m[1] ?? "", 10)
  const half = (m[2] ?? "") as "表" | "裏"
  if (!Number.isFinite(inning) || inning <= 0) return null
  return { inning, half }
}

function scoreBeforeHalf(
  scoreboard: Array<{ innings?: string[]; teamName?: string }>,
  battingIndex: 0 | 1,
  inning: number,
): number {
  const inn = scoreboard?.[battingIndex]?.innings ?? []
  const end = Math.max(0, Math.min(inn.length, inning - 1))
  let sum = 0
  for (let i = 0; i < end; i++) {
    const n = parseInt(String(inn[i] ?? "0").replace(/[^\d]/g, ""), 10)
    if (Number.isFinite(n)) sum += n
  }
  return sum
}

type ScoreParse = { visitorScore: number; homeScore: number }

/** 行内の "巨 1-0 神" 形式を末尾優先で解釈（文中の球数 "1-0から" 等を除外） */
function parseScoreboardLine(
  line: string,
  visitorMarks: Set<string>,
  homeMarks: Set<string>,
): ScoreParse | null {
  const re = /([^\s\d])\s*(\d+)-(\d+)\s*([^\s\d])/gu
  let best: ScoreParse | null = null
  for (const m of line.matchAll(re)) {
    const leftMark = (m[1] ?? "").trim()
    const rightMark = (m[4] ?? "").trim()
    const aScore = parseInt(m[2] ?? "0", 10) || 0
    const bScore = parseInt(m[3] ?? "0", 10) || 0
    if (leftMark === rightMark) continue
    if (visitorMarks.has(leftMark) && homeMarks.has(rightMark)) {
      best = { visitorScore: aScore, homeScore: bScore }
      continue
    }
    if (homeMarks.has(leftMark) && visitorMarks.has(rightMark)) {
      best = { visitorScore: bScore, homeScore: aScore }
      continue
    }
  }
  return best
}

/**
 * 打席 ID ごとの得点増分（自責点近似）。
 * エラー絡み・無得点の犠飛等は未補正。scoreboard イニング列がある場合は半の開始得点に利用。
 */
export function buildEstimatedErByPaId(doc: CanonicalGameDocument): Map<string, number> {
  const out = new Map<string, number>()
  const enriched = injectTeamsFromTextPbpIfMissing(doc)
  const scoreboard = enriched.game?.scoreboard ?? []
  if (scoreboard.length < 2) return out

  const visitorName = (scoreboard[0]?.teamName ?? "").trim()
  const homeName = (scoreboard[1]?.teamName ?? "").trim()
  if (!visitorName || !homeName) return out

  const visitorMarks = teamScoreMarks(visitorName)
  const homeMarks = teamScoreMarks(homeName)
  for (const t of enriched.game?.teams ?? []) {
    const name = (t.teamName ?? "").trim()
    if (!name) continue
    const marks = teamScoreMarks(name)
    if (teamsRoughlySame(name, visitorName)) marks.forEach((x) => visitorMarks.add(x))
    if (teamsRoughlySame(name, homeName)) marks.forEach((x) => homeMarks.add(x))
  }

  const pas = [...(enriched.domain?.plateAppearances ?? [])].sort(comparePlateAppearances)
  const pasByHalf = new Map<string, PlateAppearance[]>()
  for (const pa of pas) {
    const hk = halfKeyFromPaId(pa.paId)
    if (!hk) continue
    const list = pasByHalf.get(hk) ?? []
    list.push(pa)
    pasByHalf.set(hk, list)
  }

  const sections = enriched.game?.textPlayByPlay ?? []
  for (const sec of sections) {
    const parsed = parseInningHalfFromSectionTitle(sec.sectionTitle ?? "")
    if (!parsed) continue
    const hk = `${parsed.inning}-${parsed.half}`
    const paList = pasByHalf.get(hk) ?? []
    if (paList.length === 0) continue

    const battingIndex: 0 | 1 = parsed.half === "表" ? 0 : 1
    let prevBattingScore = scoreBeforeHalf(scoreboard, battingIndex, parsed.inning)

    let paIdx = 0
    for (const rawLine of sec.lines ?? []) {
      const line = (rawLine ?? "").trim()
      if (!line) continue

      let delta = 0
      const score = parseScoreboardLine(line, visitorMarks, homeMarks)
      if (score) {
        const battingScore = battingIndex === 0 ? score.visitorScore : score.homeScore
        delta = Math.max(0, battingScore - prevBattingScore)
        prevBattingScore = battingScore
      }

      if (!isPaLikePlayByPlayLine(line)) continue
      const pa = paList[paIdx]
      if (!pa) break
      if (delta > 0) out.set(pa.paId, (out.get(pa.paId) ?? 0) + delta)
      paIdx += 1
    }
  }

  return out
}

function teamsRoughlySame(a: string, b: string): boolean {
  const x = (a ?? "").replace(/\s+/g, "").trim()
  const y = (b ?? "").replace(/\s+/g, "").trim()
  if (!x || !y) return false
  if (x === y) return true
  return x.includes(y) || y.includes(x)
}
