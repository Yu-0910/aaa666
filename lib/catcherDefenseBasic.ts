export type CatcherDefenseBasicDerived = {
  schemaVersion: "player-catcher-defense-basic-v1"
  seasonYear: string
  npbCatcherId: string
  sbAttempts: number
  sb: number
  cs: number
  csPct: number | null
  /** パスボール・捕逸の合計（暴投は含めない） */
  pb?: number
  /** 背後で受けた総投球数（pitchEvents 件数） */
  pitches?: number
  /** GO/AO 用ゴロアウト / フライアウト推定件数 */
  battedBallOuts?: { ground: number; air: number }
}

