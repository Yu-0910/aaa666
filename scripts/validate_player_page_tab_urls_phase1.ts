import assert from "node:assert/strict"
import {
  getPlayerPagePhase1RowsForAudience,
  resolvePlayerPageLegacyRestSection,
  resolvePlayerPageLegacyTabQuery,
} from "@/lib/playerPageTabUrlPhase1"
import {
  buildFielderSeasonSubTabs,
  buildPitcherSeasonSubTabs,
} from "@/lib/playerMatchupSeasonTab"

function labels(rows: { label: string }[]): string[] {
  return rows.map((row) => row.label)
}

const pitcherRows = getPlayerPagePhase1RowsForAudience("pitcher")
const fielderRows = getPlayerPagePhase1RowsForAudience("fielder")
const catcherRows = getPlayerPagePhase1RowsForAudience("catcher")

assert.deepEqual(labels(pitcherRows), labels(buildPitcherSeasonSubTabs()))
assert.deepEqual(labels(fielderRows), labels(buildFielderSeasonSubTabs(false)))
assert.deepEqual(labels(catcherRows), labels(buildFielderSeasonSubTabs(true)))

assert.equal(resolvePlayerPageLegacyTabQuery("pitch"), "pitch-types")
assert.equal(resolvePlayerPageLegacyTabQuery("situation"), "splits")
assert.equal(resolvePlayerPageLegacyTabQuery("game_log"), "game-log")
assert.equal(resolvePlayerPageLegacyTabQuery("unknown"), "basic")

assert.equal(resolvePlayerPageLegacyRestSection(["pitch-types"]), "pitch-types")
assert.equal(resolvePlayerPageLegacyRestSection(["splits"]), "splits")
assert.equal(resolvePlayerPageLegacyRestSection(["unknown"]), "basic")
assert.equal(resolvePlayerPageLegacyRestSection(undefined), "basic")

console.log("validate_player_page_tab_urls_phase1: ok")
