/**
 * Phase 0: 対戦成績タブ仕様の単体検証（vitest 非依存）
 *
 *   npx tsx scripts/validate_player_matchup_phase0_unit.ts [--fail]
 */

import { PLAYER_MATCHUP_SCHEMA_VERSION } from "@/lib/playerMatchupTypes"
import { PLAYER_MATCHUP_TEAM_ORDER } from "@/lib/playerMatchupTeamOrder"
import {
  FIELDER_SEASON_TAB_MATCHUP_INDEX,
  PITCHER_SEASON_TAB_MATCHUP_INDEX,
  PLAYER_MATCHUP_DISPLAY_YEAR,
  PLAYER_MATCHUP_TABLE_COLUMNS,
  activeSeasonSubTabIndex,
  buildFielderSeasonSubTabs,
  buildPitcherSeasonSubTabs,
  sortMatchupTeamsByOpponentCountDesc,
  resolveShowMatchupSeasonSubTab,
  seasonSubTabSliderTransform,
  seasonSubTabSliderWidthPct,
} from "@/lib/playerMatchupSeasonTab"
import { matchupOpponentDisplayNameJa } from "@/lib/playerNameNormalize"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function main() {
  assert(PLAYER_MATCHUP_SCHEMA_VERSION === "phase30-player-matchup-v1", "schema version")
  assert(PLAYER_MATCHUP_DISPLAY_YEAR === "2026", "display year")
  assert(PLAYER_MATCHUP_TEAM_ORDER.length === 12, "12 teams")
  assert(
    PLAYER_MATCHUP_TABLE_COLUMNS.map((c) => c.label).join(",") ===
      "OPS,打率,打数,安打,本塁打,三振",
    "table columns",
  )
  assert(matchupOpponentDisplayNameJa("菅野智之") === "菅野智之", "matchup name ja")
  assert(matchupOpponentDisplayNameJa("Ｔ．ハーン") === "ハーン", "matchup name foreign")

  const sortedTeams = sortMatchupTeamsByOpponentCountDesc([
    { teamCode: "G", teamDisplay: "巨人", opponents: [{ opponentName: "a" } as never] },
    { teamCode: "H", teamDisplay: "阪神", opponents: [{ opponentName: "b" } as never, { opponentName: "c" } as never] },
  ])
  assert(sortedTeams[0]?.teamCode === "H", "teams by opponent count")
  assert(sortedTeams[1]?.teamCode === "G", "teams by opponent count 2nd")

  const fielderTabs = buildFielderSeasonSubTabs(false)
  assert(fielderTabs.length === 4, "fielder 4 tabs")
  assert(fielderTabs[FIELDER_SEASON_TAB_MATCHUP_INDEX]?.key === "matchup", "fielder matchup 4th")
  assert(fielderTabs[FIELDER_SEASON_TAB_MATCHUP_INDEX]?.label === "対戦成績", "fielder matchup label")

  const fielderWithCatcher = buildFielderSeasonSubTabs(true)
  assert(fielderWithCatcher.length === 5, "fielder 5 with catcher")
  assert(fielderWithCatcher[3]?.key === "matchup", "matchup still 4th with catcher")
  assert(fielderWithCatcher[4]?.key === "catcher", "catcher 5th")

  const pitcherTabs = buildPitcherSeasonSubTabs()
  assert(pitcherTabs.length === 4, "pitcher 4 tabs")
  assert(pitcherTabs[PITCHER_SEASON_TAB_MATCHUP_INDEX]?.key === "matchup", "pitcher matchup 4th")

  assert(seasonSubTabSliderWidthPct(4) === "25%", "slider 4 tabs")
  assert(seasonSubTabSliderWidthPct(5) === "20%", "slider 5 tabs")
  assert(seasonSubTabSliderTransform(3) === "translateX(300%)", "slider transform")
  assert(activeSeasonSubTabIndex(fielderTabs, "matchup") === 3, "active index matchup")
  assert(activeSeasonSubTabIndex(fielderTabs, "unknown") === 0, "active index fallback")

  assert(
    resolveShowMatchupSeasonSubTab({
      statsTab: "season",
      showFielderSeasonPilotUi: true,
      showPitcherSeasonSuganoUi: false,
    }),
    "fielder season",
  )
  assert(
    resolveShowMatchupSeasonSubTab({
      statsTab: "season",
      showFielderSeasonPilotUi: false,
      showPitcherSeasonSuganoUi: true,
    }),
    "pitcher season",
  )
  assert(
    !resolveShowMatchupSeasonSubTab({
      statsTab: "career",
      showFielderSeasonPilotUi: true,
      showPitcherSeasonSuganoUi: false,
    }),
    "not career",
  )
  assert(
    !resolveShowMatchupSeasonSubTab({
      statsTab: "season",
      showFielderSeasonPilotUi: false,
      showPitcherSeasonSuganoUi: false,
    }),
    "no pilot ui",
  )

  console.log("[validate_player_matchup_phase0_unit] ok")
}

try {
  main()
} catch (e) {
  console.error("[validate_player_matchup_phase0_unit] FAIL", e)
  if (process.argv.includes("--fail")) process.exit(1)
  throw e
}
