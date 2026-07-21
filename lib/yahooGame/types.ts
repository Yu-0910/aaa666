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

/** 走者イベント（実況由来の best-effort）。盗塁など打席外イベントを集計するための補助。 */
export type RunnerEvent = {
  /** 試合内一意を想定（best-effort） */
  eventId: string
  inningHalf?: string
  /** 例: "SB" | "CS" */
  kind: "SB" | "CS"
  yahooRunnerId: string
  runnerNameJa?: string
  /** 元行（デバッグ用） */
  sourceLine?: string
  /**
   * マージ優先度のメタ（高いほど信頼）。未設定は従来どおり。
   * - score … `score?index=` スナップショットの記録寄りテキスト
   * - yahooTextDom … `/text` の bb-liveText 構造
   * - textPbp … canonical の textPlayByPlay 行パース
   * - rawTextSteal … raw text HTML の盗塁ヒューリスティック
   */
  sourceTier?: "score" | "yahooTextDom" | "textPbp" | "rawTextSteal"
}

/** 打者イベント（実況DOM由来の best-effort）。併殺打など、PA結果が欠けるケースの補完に使う。 */
export type BatterEvent = {
  /** 試合内一意を想定（best-effort） */
  eventId: string
  inningHalf?: string
  kind: "GIDP"
  yahooBatterId: string
  batterNameJa?: string
  /** 元行（デバッグ用） */
  sourceLine?: string
  sourceTier?: "yahooTextDom"
}

/** 打席（将来: 一球ログから構築） */
export type PlateAppearance = {
  /**
   * `{gameId}-{inning}-{表|裏}-{paSeqInHalf}`。
   * 末尾は **半回内の打席通し番号**（Yahoo score index / 実況「N：」）であり **打順（1〜9番）ではない**。
   * @see `lib/yahooGame/paIdFormat.ts`
   */
  paId: string
  inningHalf?: string
  /**
   * その打席の投手 Yahoo ID（出場成績・投手ログの先頭行由来。打席途中交代時は先発側のままのことがある）。
   * 対左右の分類は `yahooPitcherIdForVsHandFromPa` が `pitchEvents` を優先する。
   */
  yahooPitcherId?: string
  yahooBatterId?: string
  /**
   * 打席開始時点の塁上走者（Yahoo player id）。
   * - 取得元が無い/不明な場合は undefined（または各塁 null）。
   * - 将来、Yahoo 一球速報の追加ソースから復元する想定。
   */
  baseBefore?: {
    r1?: string | null
    r2?: string | null
    r3?: string | null
  }
  resultSummaryJa?: string
  pitchEvents?: PitchEvent[]
}

/** 出場成績由来の打撃行（best-effort。公式記録は Phase 4 で精緻化） */
export type BattingLine = {
  yahooPlayerId: string
  playerName: string
  teamName?: string
  yahooTeamId?: string | null
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
  /** 出場成績テーブルの打席結果列（cells[14]〜）から推定。未取得時は省略 */
  h2?: number
  h3?: number
  inferredFrom: "stats_row_v0"
  /**
   * Phase 1: 出場成績テーブル `cells[14..]` を trim した列（打席結果スロット。空は未使用列）。
   * 計画書 `plan_batting_derived_appearance_stats_primary_phases.md` §6 の N 検算に使用。
   */
  appearancePaSlotsJa?: string[]
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
  inferredFrom: "stats_row_v0" | "score_table_v0" | "placeholder"
  /**
   * Phase 1: 投手行の出場成績テーブル `cells[14..]`（対戦打者の結果が並ぶ列。空は未使用列）。
   * 対左右フォールバック（投手成績「打者」欄）の材料。
   */
  appearanceVsBfSlotsJa?: string[]
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
  /**
   * 各 `lines[i]` に対応。テキスト速報の各プレー（`li.bb-liveText__item`）について、
   * 一球速報でプレー上部に出る動画見出し（`p.bb-liveText__itemTitle`）。無いプレーは null。
   */
  playHeadlineJa?: (string | null)[]
}

/**
 * テキストの「けん制球を捕球ミス」と、一球速報（score）の記録文を突き合わせた調査結果。
 * raw_sportsnavi_score が無い試合では status が no_score_raw になり得る。
 */
export type PickoffCatchMissInvestigation = {
  /** テキスト速報の該当行（けん制＋捕球ミス） */
  textLine: string
  inningHalf?: string
  /** 同一打席の score スナップショットから結合した記録文 */
  scoreNarrativeJa?: string
  /** 記録文から判読した「盗塁失敗・挟殺等」の CS 対象走者（Yahoo ID）。空＝その文脈では CS 走者なし */
  inferredCsRunnerIds: string[]
  /** 記録文から判読した SB 対象（参考） */
  inferredSbRunnerIds?: string[]
  /** resolved … 突合完了 / no_score_raw … score HTML 未取得 / no_score_narrative … 該当打席の記録文を結合できず */
  status: "resolved" | "no_score_raw" | "no_score_narrative"
}

export type StatsPlayerRowV0 = {
  yahooPlayerId: string | null
  playerName: string
  teamName?: string
  yahooTeamId?: string | null
  cells: string[]
}

/** Phase 3 永続化用 canonical（1試合・1ファイル） */
export type CanonicalGameDocument = {
  schemaVersion: "yahoo-game-canonical-v1"
  gameId: string
  builtAt: string
  sourceSchema: "yahoo-game-normalized-v0" | "sportsnavi-stats-text-v1"
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
    /** @deprecated 試合全体要約。使用しない。既存 JSON に残る場合あり。 */
    scorePageTopLeadJa?: string
    /** @deprecated */
    scorePageTopLeadFetchedAt?: string
    /**
     * けん制時の捕球ミス行をトリガーに、一球速報（score）の記録文で盗塁失敗／挟殺等を照会した結果。
     */
    pickoffCatchMissInvestigations?: PickoffCatchMissInvestigation[]
  }
  domain: {
    plateAppearances: PlateAppearance[]
    pitchEvents: PitchEvent[]
    runnerEvents?: RunnerEvent[]
    batterEvents?: BatterEvent[]
    battingLines: BattingLine[]
    pitchingLines: PitchingLine[]
  }
}
