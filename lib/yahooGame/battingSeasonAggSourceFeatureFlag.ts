/**
 * シーズン打撃集計（Phase11 / Phase12 / 個人ページ）のデータ源。
 *
 * - **未設定（既定）** / `appearance_slots` … 出場成績末尾列（`appearancePaSlotsJa` / cells[14..]）のみから積み上げ
 * - **`hybrid`** … ロールバック用: `aggregateBattingSeasonByYahooBatterHybridForProfiles`（出場行の数値列 H/AB 優先）
 *
 * 計画: `docs/plan_ranking_profile_appearance_slots_only_phases.md`（Phase 7: 本番既定を appearance_slots に固定）
 */
export type BattingSeasonAggSource = "hybrid" | "appearance_slots"

export function battingSeasonAggSource(): BattingSeasonAggSource {
  const raw = String(process.env.TOPPAGE_BATTING_SEASON_AGG ?? "").trim().toLowerCase()
  if (raw === "hybrid" || raw === "legacy" || raw === "line") {
    return "hybrid"
  }
  if (
    raw === "appearance_slots" ||
    raw === "appearance-slots" ||
    raw === "appearance_only_slots" ||
    raw === "slots" ||
    raw === ""
  ) {
    return "appearance_slots"
  }
  return "appearance_slots"
}

export function isBattingSeasonAggFromAppearanceSlots(): boolean {
  return battingSeasonAggSource() === "appearance_slots"
}
