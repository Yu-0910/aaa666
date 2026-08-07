import { mergePhase10RestoredIntoDocIfPresent } from "@/lib/seasonStatsPilot"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"
import { loadCanonicalGames, type LoadCanonicalGamesOptions } from "@/lib/yahooGame/loadCanonicalGames"
import { enrichPlateAppearancesWithResolvedPitcherIds } from "@/lib/yahooGame/resolvePitcherIdByPaId"
import { injectTeamsFromSportsnaviStatsIfMissing } from "@/lib/yahooGame/injectTeamsFromSportsnaviStats.mjs"

/**
 * Phase 11 および「canonical から派生 JSON を書く」スクリプトの共通入力。
 *
 * `_data/scraped_games/canonical` の各試合に `mergePhase10RestoredIntoDocIfPresent` を適用し、
 * 打席ごとの投手 Yahoo ID を実況タイムライン等で補完した配列。
 * ディスク上の canonical ファイルは変更しない（メモリ上のみマージ）。
 * carry-forward / BF 割当は使わない（`resolvePitcherIdByPaId.ts`）。
 *
 * 派生パイプラインで生 JSON のみを読むと、一球復元の plateAppearances が欠け Phase11 と
 * 打者集合・P0 がずれるため、必ずこの関数経由に統一する。
 */
export function loadCanonicalGamesMergedForDerivedPipeline(
  projectRoot: string,
  options?: LoadCanonicalGamesOptions,
): CanonicalGameDocument[] {
  return loadCanonicalGames(projectRoot, options).map((d) => {
    const merged = enrichPlateAppearancesWithResolvedPitcherIds(
      mergePhase10RestoredIntoDocIfPresent(d),
    )
    return injectTeamsFromSportsnaviStatsIfMissing(
      merged,
      projectRoot,
    ) as CanonicalGameDocument
  })
}
