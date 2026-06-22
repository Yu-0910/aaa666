/**
 * Phase 33 / Phase 0 SSOT: 野手×球団×カウント別配球 JSON 型と UI 定数。
 */

import type { PitcherSeasonPocPitchTypesSplitRow } from "../pitcherSeasonPocTypes"

export const BATTER_VS_TEAM_COUNT_PITCH_TYPES_SCHEMA_VERSION =
  "phase33-batter-vs-team-count-pitch-types-v1" as const

/** UI: 球団ブロック非表示の最小投球数（合算） */
export const BATTER_VS_TEAM_MIN_PITCHES_DISPLAY = 10

export type BatterVsTeamPitchTypesSplitRow = PitcherSeasonPocPitchTypesSplitRow

export type BatterVsTeamCountPitchTypesTeamBlock = {
  teamCode: string
  label: string
  pitches_total: number
  /** 対左右合算 */
  byCountPitchTypes: BatterVsTeamPitchTypesSplitRow[]
  byCountPitchTypesVsL?: BatterVsTeamPitchTypesSplitRow[]
  byCountPitchTypesVsR?: BatterVsTeamPitchTypesSplitRow[]
}

export type BatterVsTeamCountPitchTypesFile = {
  schemaVersion: typeof BATTER_VS_TEAM_COUNT_PITCH_TYPES_SCHEMA_VERSION
  seasonYear: string
  yahooBatterId: string
  playerName?: string
  generatedAt: string
  source: {
    canonicalGames: string[]
    note?: string
  }
  teams: BatterVsTeamCountPitchTypesTeamBlock[]
}

/** Phase 0 目視比較用参照選手（2026 canonical・pitchEvents 最多） */
export const PHASE33_REFERENCE_BATTER = {
  nameJa: "近藤 健介",
  yahooBatterId: "1100097",
  teamCode: "Hs",
  teamLabel: "ソフトバンク",
  /** 2026-06-14 canonical 389 試合中 pitchEvents 最多（1,135 球） */
  pitchesTotal2026: 1135,
} as const

/** 計画書初版候補。名簿 ID 71075138 は canonical に yahooBatterId として未登場（2026-06-14 時点） */
export const PHASE33_REFERENCE_BATTER_ALT = {
  nameJa: "近本 光司",
  rosterId: "71075138",
  teamCode: "H",
  teamLabel: "阪神",
} as const
