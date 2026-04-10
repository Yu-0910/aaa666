/**
 * canonical スタメン + 名簿で打者の利き手（日本語: 左/右/両）を解決。
 *
 * 打撃表などの「(左)」「(右)」は守備位置（左翼・右翼）のことが多く、利き手と一致しない。
 * 利き手はスタメン bats と名簿 bat_hand のみを用いる（canonical の batting cells は参照しない）。
 */

import { compactPlayerName } from "@/lib/playerNameNormalize"
import type { NpbRosterPlayer } from "@/lib/npbRoster"
import { getPlayerHandednessById } from "@/lib/npbRoster"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"
import type { CanonicalGameDocument } from "./types"

export function batsFromStartingLineup(
  doc: CanonicalGameDocument,
  yahooBatterId: string
): "L" | "R" | "B" | null {
  const id = yahooBatterId.trim()
  if (!id) return null
  for (const t of doc.game.teams) {
    for (const p of t.startingLineup) {
      if ((p.yahooPlayerId ?? "").trim() !== id) continue
      const b = (p.bats ?? "").trim()
      if (b === "左") return "L"
      if (b === "右") return "R"
      if (b === "両") return "B"
    }
  }
  return null
}

/**
 * 対右／対左の振り分け用。スタメン → yahooPlayersMentioned + 名簿の順で補完。
 */
export function resolveBatHandJaForBatter(
  doc: CanonicalGameDocument,
  yahooBatterId: string,
  roster: NpbRosterPlayer[]
): "左" | "右" | "両" | "" {
  const lineup = batsFromStartingLineup(doc, yahooBatterId)
  if (lineup === "L") return "左"
  if (lineup === "R") return "右"
  if (lineup === "B") return "両"

  // スタメン以外（途中出場含む）は startingLineup にいないことがあるため、ID 橋渡しで名簿へ直結する。
  // ※橋渡しが未整備の Yahoo ID は従来どおり名前照合へフォールバック。
  const npbId = resolveNpbPlayerIdFromPublicId(yahooBatterId)
  if (npbId && /^\d+$/.test(npbId)) {
    const byId = roster.find((r) => (r.npb_player_id ?? "").trim() === npbId)
    if (byId) {
      const b = (byId.bat_hand ?? "").toUpperCase()
      if (b === "L") return "左"
      if (b === "R") return "右"
      if (b === "B") return "両"
    }
  }

  const mentioned = doc.game.yahooPlayersMentioned?.[yahooBatterId] ?? ""
  if (!mentioned) return ""
  const c = compactPlayerName(mentioned)
  for (const row of roster) {
    if (compactPlayerName(row.name_ja) === c) {
      const b = row.bat_hand?.toUpperCase()
      if (b === "L") return "左"
      if (b === "R") return "右"
      if (b === "B") return "両"
    }
  }
  return ""
}

/**
 * 投手の「対右／対左」打席分け用バケツ（名簿の打ち方）。
 * 両打者はプラトーン有利側に寄せる: 左投の前では右打、右投の前では左打としてカウントする。
 * 投手の投球腕が名簿で取れないときは null（呼び出し側で vsUnknown 等へ）。
 */
export function effectiveVsHandBucketForPitcherSplit(
  batJa: "左" | "右" | "両" | "",
  pitcherThrow: "R" | "L" | ""
): "L" | "R" | null {
  if (batJa === "左") return "L"
  if (batJa === "右") return "R"
  if (batJa === "両") {
    if (pitcherThrow === "L") return "R"
    if (pitcherThrow === "R") return "L"
    return null
  }
  return null
}

/** Yahoo 投手 ID → 名簿の投球腕（R/L）。橋渡しで NPB を解決してから参照。 */
export function pitcherThrowHandRLFromYahooPitcherId(yahooPitcherId: string): "R" | "L" | "" {
  const npb = resolveNpbPlayerIdFromPublicId(yahooPitcherId.trim())
  if (!npb || !/^\d+$/.test(npb)) return ""
  const { throwHand } = getPlayerHandednessById(npb)
  return throwHand
}
