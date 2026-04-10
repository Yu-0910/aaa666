/**
 * 投手個人ページの「今季 PoC」で、`_data/derived/player_season_pitching_poc` に自 npb の JSON が無い場合のフォールバック。
 * （例: 青柳は PoC canonical に登場する別投手の派生を参照し、npb のみ差し替える）
 */

import { compactPlayerName } from "./playerNameNormalize"
import { getNpbRoster2026 } from "./npbRoster"
import type {
  PitcherSeasonPitchingPeriodPayload,
  PitcherSeasonPocPayload,
} from "./pitcherSeasonPocTypes"

/** 名簿に無い場合の表示名（2026 名簿に該当行が無い選手向け） */
const PILOT_DISPLAY_NAME_HARDCODED: Record<string, string> = {
  "71175132": "青柳 晃洋",
}

/** 派生 JSON が無いとき、統計のソースとする既存 npb（同一 PoC 試合の投手） */
export const PILOT_DERIVED_FALLBACK_NPB: Record<string, string> = {
  "71175132": "73375153",
}

export const PILOT_SEASON_PITCHING_DIRECT_NPB_IDS = Object.keys(PILOT_DERIVED_FALLBACK_NPB)

/** 名簿照合が外れる場合でも、URL セグメントから PoC 対象 npb を決める */
export function resolvePilotPitcherNpbFromUrlSegment(decoded: string): string | null {
  const raw = decoded.replace(/^player-/, "").trim()
  const onlyDigits = raw.replace(/[^\d]/g, "")
  if (onlyDigits && PILOT_DERIVED_FALLBACK_NPB[onlyDigits]) {
    return onlyDigits
  }
  const key = compactPlayerName(raw)
  if (key === compactPlayerName("青柳晃洋")) return "71175132"
  return null
}

export function pilotPitcherDisplayNameFromNpb(npb: string): string | null {
  const roster = getNpbRoster2026().find((r) => r.npb_player_id === npb)
  if (roster?.name_ja?.trim()) return roster.name_ja.trim()
  return PILOT_DISPLAY_NAME_HARDCODED[npb] ?? null
}

export function withPilotPitcherPocFallbackShell(
  base: PitcherSeasonPocPayload,
  targetNpb: string,
): PitcherSeasonPocPayload {
  const name = pilotPitcherDisplayNameFromNpb(targetNpb) ?? base.playerName
  const note =
    (base.source?.note ?? "").trim() +
    " 【個人ページ: 本 npb の派生 JSON が未生成のため、PoC 試合に登場する投手の統計を参照しています。】"
  return {
    ...base,
    npbPlayerId: targetNpb,
    playerName: name,
    source: {
      ...base.source,
      note: note.trim(),
    },
  }
}

export function withPilotPitcherPeriodFallbackShell(
  base: PitcherSeasonPitchingPeriodPayload,
  targetNpb: string,
): PitcherSeasonPitchingPeriodPayload {
  return {
    ...base,
    npbPlayerId: targetNpb,
  }
}
