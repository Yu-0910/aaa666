/**
 * 個人ページ「今季パイロット」で API に渡す選手識別子。
 * サーバ側 `getYahooIdForPilot` / CSV の player_id 列と整合させること。
 */
export const PILOT_KIKUCHI_YAHOO_BATTER_ID = "1100082" as const
export const PILOT_KIKUCHI_NPB_PLAYER_ID = "61565135" as const

/** ファビアン（橋渡し CSV・batting_stats の Yahoo 打者 ID と一致） */
export const PILOT_FABIAN_YAHOO_BATTER_ID = "2114882" as const
export const PILOT_FABIAN_NPB_PLAYER_ID = "43745150" as const
