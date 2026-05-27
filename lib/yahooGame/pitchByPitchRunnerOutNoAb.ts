import { parsePaId } from "./paIdFormat"

/**
 * 一球速報に「詳しい投球内容」が無いが、実況上は
 * 二死走者あり → 走者アウトで3アウトチェンジ → 打者の打席結果なし、
 * というパターン（2026-05 調査の残欠損5打席はすべて該当。HR 等は別 paId に既に一球あり得る）。
 *
 * 打席結果の正は出場成績末尾列（appearance_only）。本関数は一球カバレッジ診断用。
 */

/** 実況1行または resultSummary 断片から「走者アウトでイニング終了・打者結果なし」か */
export function isRunnerOutEndsHalfNoAbFromPlayText(text: string): boolean {
  const s = String(text ?? "").replace(/\s+/g, "")
  if (!s) return false
  // 打者の打席結果がある行は対象外（例: 外崎 4回表6番 HR で投球表のみ欠損）
  if (/ホームラン|本塁打|ランホームラン|[23]ラン|安打|単打|二塁打|三塁打|三振|ゴロ|飛|凡打|犠打|犠飛|四球|死球|申告敬遠/.test(s)) {
    return false
  }
  if (!/3アウト|３アウト/.test(s)) return false
  if (!/二死|2死/.test(s)) return false
  if (
    /盗塁失敗/.test(s) ||
    /タッチアウト/.test(s) ||
    /盗塁を試みるもアウト/.test(s) ||
    /誘い出され盗塁失敗/.test(s) ||
    (/けん制/.test(s) && /盗塁/.test(s))
  ) {
    return true
  }
  return false
}

export const PHASE10_MISSING_RUNNER_OUT_NO_AB = "runner_out_ends_half_no_ab"

export function isPhase10RunnerOutNoAbFlag(flag: string): boolean {
  return String(flag).includes(PHASE10_MISSING_RUNNER_OUT_NO_AB)
}

function normalizePlayLine(s: string): string {
  return String(s ?? "").replace(/\s+/g, "")
}

function batterResultInPlayText(text: string): boolean {
  const s = normalizePlayLine(text)
  return /ホームラン|本塁打|ランホームラン|[23]ラン|安打|単打|二塁打|三塁打|三振|ゴロ|飛|凡打|犠打|犠飛|四球|死球|申告敬遠/.test(s)
}

/** 半回内で当該打席に紐づく実況行（複数ヒット可） */
export function playLinesForPaFromCanonical(
  doc: Parameters<typeof playTextForPaFromCanonical>[0],
  inning: string | number,
  topBottom: string,
  paSeqInHalf: string | number,
  yahooBatterId?: string,
): string[] {
  const heading = `${Number(inning)}回${topBottom}`
  const seq = Number(paSeqInHalf)
  const sections = doc.game?.textPlayByPlay ?? []
  const roster = doc.game?.yahooPlayersMentioned ?? {}
  const batterName = yahooBatterId ? normalizePlayLine(roster[yahooBatterId] ?? "") : ""
  const out: string[] = []
  const seen = new Set<string>()

  const push = (s: string) => {
    if (!s || seen.has(s)) return
    seen.add(s)
    out.push(s)
  }

  for (const sec of sections) {
    if (sec.sectionTitle !== heading) continue
    for (const line of sec.lines ?? []) {
      const s = String(line)
      const norm = normalizePlayLine(s)
      if (batterName && norm.includes(batterName)) push(s)
      const m = s.match(/^(\d+)[：:]/)
      if (m && Number(m[1]) === seq) push(s)
    }
  }
  return out
}

/** canonical `game.textPlayByPlay` から該当打席の実況1行（診断・修復用） */
export function playTextForPaFromCanonical(
  doc: {
    game?: {
      textPlayByPlay?: Array<{ sectionTitle?: string; lines?: string[] }>
      yahooPlayersMentioned?: Record<string, string>
    }
  },
  inning: string | number,
  topBottom: string,
  paSeqInHalf: string | number,
  yahooBatterId?: string,
): string {
  const heading = `${Number(inning)}回${topBottom}`
  const seq = Number(paSeqInHalf)
  const sections = doc.game?.textPlayByPlay ?? []
  const roster = doc.game?.yahooPlayersMentioned ?? {}
  const batterName = yahooBatterId ? normalizePlayLine(roster[yahooBatterId] ?? "") : ""

  let byPrefix = ""
  for (const sec of sections) {
    if (sec.sectionTitle !== heading) continue
    for (const line of sec.lines ?? []) {
      const s = String(line)
      if (batterName) {
        const norm = normalizePlayLine(s)
        if (norm.includes(batterName)) return s
      }
      const m = s.match(/^(\d+)[：:]/)
      if (m && Number(m[1]) === seq && !byPrefix) byPrefix = s
    }
  }
  return byPrefix
}

export function isExpectedNoPitchEventsPa(
  doc: Parameters<typeof playTextForPaFromCanonical>[0],
  pa: { paId?: string; resultSummaryJa?: string; yahooBatterId?: string },
  phase10Reason?: string,
): boolean {
  if (phase10Reason && isPhase10RunnerOutNoAbFlag(phase10Reason)) return true
  const parsed = parsePaId(String(pa.paId ?? ""))
  if (!parsed) return false
  const lines = playLinesForPaFromCanonical(
    doc,
    parsed.inning,
    parsed.half,
    parsed.paSeqInHalf,
    pa.yahooBatterId,
  )
  if (lines.some((l) => batterResultInPlayText(l))) return false
  if (lines.some((l) => isRunnerOutEndsHalfNoAbFromPlayText(l))) return true
  const summary = String(pa.resultSummaryJa ?? "")
  if (summary && batterResultInPlayText(summary)) return false
  return isRunnerOutEndsHalfNoAbFromPlayText(summary)
}
