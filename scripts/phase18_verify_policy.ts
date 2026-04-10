/**
 * Phase 18: Next / Node 側の PoC API 無効化ポリシー（yahooPhase8Policy）の表示のみ。
 *
 * 実行: npx tsx scripts/phase18_verify_policy.ts
 */
import { isYahooPocRankingApiDisabled } from "../lib/yahooGame/yahooPhase8Policy"

console.log("[phase18] Node / lib/yahooGame/yahooPhase8Policy.ts")
console.log("  YAHOO_POC_RANKING_API_DISABLED:", process.env.YAHOO_POC_RANKING_API_DISABLED ?? "(unset)")
console.log("  isYahooPocRankingApiDisabled():", isYahooPocRankingApiDisabled())
console.log("[phase18] OK")
