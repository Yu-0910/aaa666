export type * from "./types"
export { normalizedGameV0Schema, type NormalizedGameV0 } from "./normalizedV0"
export {
  buildCanonicalFromNormalizedV0,
  inferBattingLineFromStatsRow,
  inferPitchingLineFromStatsRow,
} from "./buildCanonical"
export {
  STATS_ROW_APPEARANCE_START_INDEX,
  buildAppearanceZipResultOverrides,
  extractAppearanceStatSlotsFromCells,
  countNonEmptyAppearanceSlots,
  diagnoseBattingAppearanceSlotsVsPlateAppearances,
  type AppearancePaVsLogRow,
} from "./appearanceStatsTrailingCells"
export {
  plateAppearanceResolvedResultText,
} from "./canonicalBattingSeasonAgg"
export { isAppearancePrimaryZipEnabled } from "./appearancePrimaryFeatureFlag"
export { isPlateResultAppearanceOnly } from "./plateResultSourceFeatureFlag"
export {
  ingestCanonicalGame,
  loadManifest,
  saveManifest,
  type IngestManifest,
} from "./persistCanonical"
export { parseRosterCsv, findNpbIdForYahooBatting, type RosterRow } from "./rosterCsv"
export { buildPocRankingRowsFromCanonical, type PocRankingRow } from "./pocRankingFromCanonical"
export { findBattingLineForNpbPlayer, type MatchedGameBatting } from "./battingLineForNpbPlayer"
