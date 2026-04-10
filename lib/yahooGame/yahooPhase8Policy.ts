/**
 * Phase 8（計画書）: 本番・検証用エンドポイントの明示的な無効化。
 * スクレイピング本体は Python 側 `scripts/yahoo_scrape_guard.py` を参照。
 */

/** `YAHOO_POC_RANKING_API_DISABLED=1` のとき PoC ランキング API を 503 で閉じる */
export function isYahooPocRankingApiDisabled(): boolean {
  return process.env.YAHOO_POC_RANKING_API_DISABLED === '1'
}
