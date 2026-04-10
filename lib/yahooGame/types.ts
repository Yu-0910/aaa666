/**
 * Yahoo試合データ Phase 3 — サイト内ドメインモデル（canonical）
 * 入力: Phase 2 の yahoo-game-normalized-v0 JSON
 */

/** 一球（Phase 4 で XHR / score?index から補完） */
export type PitchEvent = {
  pitchIndex?: number
  yahooPitcherId?: string
  yahooBatterId?: string
  speedKmh?: number | null
  pitchTypeJa?: string | null
  zoneId?: number | null
  resultJa?: string | null
}

/** 打席（将来: 一球ログから構築） */
export type PlateAppearance = {
  paId: string
  inningHalf?: string
  yahooPitcherId?: string
  yahooBatterId?: string
  resultSummaryJa?: string
  pitchEvents?: PitchEvent[]
}

/** 出場成績由来の打撃行（best-effort。公式記録は Phase 4 で精緻化） */
export type BattingLine = {
  yahooPlayerId: string
  playerName: string
  positionCell?: string
  avg?: string
  ab?: number
  r?: number
  h?: number
  rbi?: number
  so?: number
  bb?: number
  hbp?: number
  sh?: number
  sb?: number
  e?: number
  hr?: number
  inferredFrom: "stats_row_v0"
}

/** 投球行（stats テーブルが複雑なため Phase 4 で拡張） */
export type PitchingLine = {
  yahooPlayerId: string
  playerName: string
  era?: string
  ip?: string
  pitches?: number
  bf?: number
  h?: number
  hr?: number
  so?: number
  bb?: number
  hbp?: number
  bk?: number
  r?: number
  er?: number
  decision?: "win" | "loss" | "hold" | "save" | null
  inferredFrom: "stats_row_v0" | "placeholder"
}

export type ScoreboardTeamLine = {
  teamName: string
  yahooTeamId: string | null
  innings: string[]
  runs?: string
  hits?: string
  errors?: string
}

export type LineupPlayer = {
  battingOrder: string
  fieldingPosition: string
  playerName: string
  yahooPlayerId: string | null
  bats?: string | null
  avgDisplay?: string | null
}

export type TeamBlock = {
  yahooTeamId: string | null
  teamName: string
  startingLineup: LineupPlayer[]
}

export type TextPlaySection = {
  sectionTitle: string
  lines: string[]
}

export type StatsPlayerRowV0 = {
  yahooPlayerId: string | null
  playerName: string
  cells: string[]
}

/** Phase 3 永続化用 canonical（1試合・1ファイル） */
export type CanonicalGameDocument = {
  schemaVersion: "yahoo-game-canonical-v1"
  gameId: string
  builtAt: string
  sourceSchema: "yahoo-game-normalized-v0"
  /** 各タブHTMLの sha256 を合成したフィンガープリント（冪等判定） */
  sourceCompositeFingerprint: string
  /**
   * Phase 10 で一球ログを復元した内容のフィンガープリント（無い場合は Phase 3 のみ）。
   * `sourceCompositeFingerprint` が同じでも events が変われば再書き込みする。
   */
  eventsFingerprint?: string
  normalizedFetchedAt: string
  game: {
    meta: { documentTitle: string; ogTitle: string }
    scoreboard: ScoreboardTeamLine[]
    teams: TeamBlock[]
    textPlayByPlay: TextPlaySection[]
    statsPlayerLinkedRows: StatsPlayerRowV0[]
    yahooPlayersMentioned: Record<string, string>
    missingOrPartial: string[]
    pitchByPitchNote: { status: string; note?: string }
  }
  domain: {
    plateAppearances: PlateAppearance[]
    pitchEvents: PitchEvent[]
    battingLines: BattingLine[]
    pitchingLines: PitchingLine[]
  }
}
