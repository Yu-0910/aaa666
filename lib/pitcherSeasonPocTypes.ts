/** Phase 1/2 投手 PoC: `player_season_pitching_poc` JSON と API 応答の型（クライアント可） */

export type PitcherSeasonPocPaAgg = {
  bf: number
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  avg?: string
  /**
   * Phase 2+（推定）: 打席結果テキストから計算したアウト数（= ipOuts）。
   * 自責点は split 単位で直接は取れないため、必要な表示は派生側で推定値を付与する。
   */
  ipOuts?: number
  ip?: string
  er?: number
  era?: number | null
  whip?: number | null
}

/** Phase 6: 捕手別（スタメン捕手固定） */
export type PitcherSeasonPocCatcherRow = {
  yahooCatcherId: string
  label: string
  bf: number
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  avg?: string
  era: number | null
  ip: string
  ipOuts: number
  wl: string
  kPct: number | null
  kBbPct: number | null
  whip: number | null
  /** Phase 6+: 捕手に帰属させた試合数（1試合=最大1） */
  games?: number
  wins?: number
  losses?: number
  qsCount?: number
  qsPct: number | null
  /** pitchingLines 帰属の自責点合算 */
  er?: number
  /** 敬遠・故意四球（打席結果テキスト） */
  ibb?: number
}

/** 巡目別・カウント別球種 split 行（Phase 32 / byPaRoundPitchTypes 共通） */
export type PitcherSeasonPocPitchTypesSplitRow = {
  key: string
  label: string
  pitches_total: number
  rows: Array<{ pitch_type: string; pitches: number; pct: number }>
}

export type PitcherSeasonPocPayload = {
  schemaVersion: string
  seasonYear: string
  npbPlayerId: string
  yahooPitcherIds: string[]
  playerName: string
  team: string
  generatedAt: string
  source: {
    canonicalGames: string[]
    note?: string
    /** Phase 6: 捕手別の解像度メモ */
    catcherNote?: string
  }
  basic: {
    ip: string
    ipOuts: number
    era: number | null
    bf: number
    h: number
    hr: number
    so: number
    bb: number
    hbp: number
    bk: number
    r: number
    er: number
    pitches: number
    decision: "win" | "loss" | "hold" | "save" | null
    whip: number | null
    avgAgainstApprox: string
    /** Phase 11: plateAppearances の要約テキストから推定したゴロアウト/フライアウト件数（公式と完全一致しない場合あり） */
    battedBallOuts?: { ground: number; air: number }
    /**
     * phase_pitcher_poc1: canonical 試合単位で集計（無い場合は旧 JSON）。
     * 先発判定は pitchingLines のチーム内先頭行。QS は先発のみ 6回以上・自責3以下。
     * 完投は先発・チーム内単独登板・9回以上（27 outs）を満たす場合の値。
     */
    gamesAppeared?: number
    gamesStarted?: number
    gamesInRelief?: number
    holds?: number
    completeGames?: number
    shutouts?: number
    intentionalWalks?: number
    qsCount?: number
    /** 先発試合ベースの QS 率（0〜1）。先発なしは null */
    qsRate?: number | null
    /** 先発試合ベースの HQS 回数（7回以上・自責2以下） */
    hqsCount?: number
    /** 先発試合ベースの SQS 回数（8回以上・自責1以下） */
    sqsCount?: number
    /** 先発試合ベースの HQS 率（0〜1）。先発なしは null */
    hqsRate?: number | null
    /** 先発試合ベースの SQS 率（0〜1）。先発なしは null */
    sqsRate?: number | null
    /**
     * phase_pitcher_poc1: 試合ごとの pitchingLines（マージ後）の勝敗記録の合計。
     * 無い場合は UI が `decision` のみで従来表示する。
     */
    winCount?: number
    lossCount?: number
    saveCount?: number
  }
  /**
   * `scripts/build_pitcher_nf3_metrics.ts` の aggregate を API でマージ（無い場合は投球指標はフォールバック）。
   */
  nf3Metrics?: {
    reliefAppearances: number
    nhbCount: number
    reliefIpOutsSum: number
    reliefRunsSum: number
    /** NHB% 表示用（例 "33.3%"） */
    nhbPct: string
    /** IPR 表示用（救援のみ合算） */
    ipr: string
    /**
     * 援護率（nf3 近似）: (援護点合計×9)÷先発投球回（イニング）。
     * `aggregate_by_npb.json` の先発行から集計した starterIpOutsSum 由来。
     */
    enGoRate?: string
  }
  opponentTeamName: string
  /**
   * 試合メタ（Phase 5 相当の入力）。PoC は primaryGameId の score 由来メタを 1 つだけ保持。
   * 定期取得した Yahoo 速報メタ（_data/yahoo_game_meta/{gameId}.json）から注入される。
   */
  gameMeta?: {
    /** scoreboard 表示順の役割（1行目=visitor, 2行目=home）に基づく投手所属側の立場 */
    homeAway?: "home" | "away" | null
    /** day/night 推定 */
    dayNight?: "day" | "night" | null
    stadiumName?: string | null
    startTimeLocal?: string | null
    gameDateYmd?: string | null
    sourceGameId?: string
    fetchedAt?: string
  }
  splits: {
    vsHand: {
      vsR: PitcherSeasonPocPaAgg
      vsL: PitcherSeasonPocPaAgg
      vsB: PitcherSeasonPocPaAgg
      vsUnknown: PitcherSeasonPocPaAgg
    } | null
    bySituation: Array<
      PitcherSeasonPocPaAgg & { key: string; label: string }
    >
    /**
     * カウント別（0-0〜3-2）: 最終球直前 B-S（phase16 と同じ pitchCountKeyForPlateAppearance）。
     * 未生成シーズンでは省略可。
     */
    byCount?: Array<PitcherSeasonPocPaAgg & { key: string; label: string }>
    /**
     * 巡目別（1〜5巡目以上）: 打者側「pa_round」に相当する区分で、投手の被打撃成績を合算。
     * 未実装/未生成のシーズンでは省略される（UI は「—」で表示）。
     */
    byPaRound?: Array<PitcherSeasonPocPaAgg & { key: string; label: string }>
    /**
     * 巡目別の球種一覧: 巡目（1〜5巡目以上）ごとの投球数（pitchEvents）を球種で集計。
     * pct は当該巡目の総投球数に対する割合（0〜100）。
     */
    byPaRoundPitchTypes?: Array<PitcherSeasonPocPitchTypesSplitRow>
    /** 巡目別球種（対左打者）。打者・投手腕は splits.vsHand と同じ換算。 */
    byPaRoundPitchTypesVsL?: Array<PitcherSeasonPocPitchTypesSplitRow>
    /** 巡目別球種（対右打者）。 */
    byPaRoundPitchTypesVsR?: Array<PitcherSeasonPocPitchTypesSplitRow>
    /**
     * カウント別（0-0〜3-2）の球種一覧: 各球を投球直前 B-S に帰した pitchEvents の球種集計。
     * pct は当該カウントの総投球数に対する割合（0〜100）。Phase 32。
     */
    byCountPitchTypes?: Array<PitcherSeasonPocPitchTypesSplitRow>
    /** カウント別球種（対左打者）。 */
    byCountPitchTypesVsL?: Array<PitcherSeasonPocPitchTypesSplitRow>
    /** カウント別球種（対右打者）。 */
    byCountPitchTypesVsR?: Array<PitcherSeasonPocPitchTypesSplitRow>
    byInning: Array<PitcherSeasonPocPaAgg & { inning: number }>
    /**
     * 球場別: 試合ごとの pitchingLines を球場（yahoo_game_meta.stadiumName）で合算。
     * Phase 6 の捕手別と同様、未設定メタは「未設定」。
     */
    byStadium?: PitcherSeasonPocStadiumRow[]
    /**
     * 対戦相手別: 試合ごとの pitchingLines を canonical scoreboard 由来の対戦チーム名で合算。
     * 行形状は球場別と同じ（QS は 6 回以上かつ自責 3 以下）。
     */
    byOpponentTeam?: PitcherSeasonPocStadiumRow[]
    /**
     * デー/ナイター別: 試合ごとの pitchingLines を開始時刻（yahoo_game_meta または raw_sportsnavi）で合算。
     * key は `day` | `night`（メタ欠落は集計から除外されないよう別バケット「未設定」に入るが、UI は day/night のみ表示）。
     */
    byDayNight?: PitcherSeasonPocStadiumRow[]
    /**
     * ホーム/ビジター別: 試合ごとの pitchingLines を canonical scoreboard（空なら試合前情報補完）の先攻/後攻で合算。
     * key は `home` | `away`。
     */
    byHomeAway?: PitcherSeasonPocStadiumRow[]
    /** Phase 6: 捕手別（先発捕手固定）。未実行時は省略可 */
    byCatcher?: PitcherSeasonPocCatcherRow[]
  }
}

/** 球場別投球（pitchingLines 合算。QS は 1 試合あたり 6 回以上・自責 3 以下） */
export type PitcherSeasonPocStadiumRow = {
  key: string
  label: string
  ipOuts: number
  ip: string
  bf: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  bk: number
  r: number
  er: number
  pitches: number
  era: number | null
  whip: number | null
  wins: number
  losses: number
  /** 当該球場で登板があった試合数（1 試合=最大 1） */
  games: number
  qsCount: number
}

export type PitcherSeasonPitchingApiResponse = {
  hasData: boolean
  year: string
  payload: PitcherSeasonPocPayload | null
}

/** Phase 7: `player_season_pitching_period` JSON（`phase7_build_pitcher_period_from_canonical`） */

export type PitcherSeasonPitchingPeriodRow = {
  split_type: "calendar_month" | "calendar_week"
  split_value: string
  split_label: string
  g: number
  wins?: number
  losses?: number
  ip: string
  ipOuts: number
  era: number | null
  bf: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  bk: number
  r: number
  er: number
  pitches: number
  whip: number | null
  avgAgainstApprox: string
}

export type PitcherSeasonPitchingPeriodPayload = {
  schemaVersion: string
  seasonYear: string
  npbPlayerId: string
  generatedAt: string
  meta: {
    gameDateSource: string
    weekRule: string
  }
  source: {
    canonicalGames: string[]
  }
  rows: PitcherSeasonPitchingPeriodRow[]
}

export type PitcherSeasonPitchingPeriodApiResponse = {
  hasData: boolean
  year: string
  payload: PitcherSeasonPitchingPeriodPayload | null
}
