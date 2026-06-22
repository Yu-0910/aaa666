/**
 * Phase 5: 捕手タブ表示ロジックの単体検証（vitest 非依存）
 *
 *   npx tsx scripts/validate_roster_catcher_tab_unit.ts [--fail]
 */

import { isCatcherPositionCell } from "@/lib/catcherAppearances"
import { resolveShowCatcherSeasonTab } from "@/lib/playerCatcherSeasonTab"
import {
  isCatcherRegistrationPosition,
  isFielderRegistrationPosition,
  isPitcherRegistrationPosition,
} from "@/lib/rosterPitcher"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function main() {
  assert(isCatcherRegistrationPosition("捕手"), "捕手")
  assert(isCatcherRegistrationPosition("捕　手"), "捕　手")
  assert(!isCatcherRegistrationPosition("捕"), "捕 only")
  assert(!isCatcherRegistrationPosition("遊撃手"), "遊撃手")

  assert(
    resolveShowCatcherSeasonTab({
      rosterPosition: "捕手",
      isRosterPlayer: true,
      catcherAppearances: null,
    }),
    "roster catcher without data"
  )
  assert(
    resolveShowCatcherSeasonTab({
      rosterPosition: "遊撃手",
      isRosterPlayer: true,
      catcherAppearances: { gamesAsCatcher: 1, gameIds: ["x"] },
    }),
    "emergency catcher"
  )
  assert(
    !resolveShowCatcherSeasonTab({
      rosterPosition: "外野手",
      isRosterPlayer: true,
      catcherAppearances: null,
    }),
    "outfielder no tab"
  )

  assert(!isPitcherRegistrationPosition("捕手"), "catcher not pitcher UI")
  assert(isFielderRegistrationPosition("捕手"), "catcher is fielder UI")

  assert(isCatcherPositionCell("(捕)"), "(捕)")
  assert(isCatcherPositionCell("(一捕)"), "(一捕)")
  assert(!isCatcherPositionCell("(一)"), "(一)")
  assert(!isCatcherPositionCell("(中)"), "(中)")

  console.log("[validate_roster_catcher_tab_unit] ok")
}

try {
  main()
} catch (e) {
  console.error("[validate_roster_catcher_tab_unit] FAIL", e)
  if (process.argv.includes("--fail")) process.exit(1)
  throw e
}
