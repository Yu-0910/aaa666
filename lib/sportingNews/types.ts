export const SPORTINGNEWS_ROTATION_SCHEMA_VERSION = "sportingnews-rotation-v1" as const

export type SportingNewsRotationRow = {
  dateJst: string
  pitcherNameJa: string | null
  opponentTeamShort: string | null
  opponentTeamCode: string | null
}

export type SportingNewsRotationSnapshot = {
  schemaVersion: typeof SPORTINGNEWS_ROTATION_SCHEMA_VERSION
  seasonYear: string
  teamCode: string
  teamDisplay: string
  sourceUrl: string
  fetchedAt: string
  rows: SportingNewsRotationRow[]
  parseWarnings: string[]
}

export type SportingNewsRotationTeamConfig = {
  teamCode: string
  teamDisplay: string
  sourceUrl: string
}

export type SportingNewsRotationUrlsConfig = {
  schemaVersion: "sportingnews-rotation-urls-v1"
  seasonYear: string
  teams: SportingNewsRotationTeamConfig[]
}
