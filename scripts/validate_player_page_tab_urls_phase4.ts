import assert from "node:assert/strict"
import {
  normalizePlayerPageSectionForTabSync,
  resolveFielderSeasonDetailTabFromUrlSegment,
  resolvePitcherSeasonSubTabFromUrlSegment,
} from "@/lib/playerPageTabUrlPhase2"

assert.equal(normalizePlayerPageSectionForTabSync("basic"), "basic")
assert.equal(normalizePlayerPageSectionForTabSync("pitch"), "pitch")
assert.equal(normalizePlayerPageSectionForTabSync("pitch-types"), "pitch")
assert.equal(normalizePlayerPageSectionForTabSync("situation"), "situation")
assert.equal(normalizePlayerPageSectionForTabSync("splits"), "situation")
assert.equal(normalizePlayerPageSectionForTabSync("matchup"), "matchup")
assert.equal(normalizePlayerPageSectionForTabSync("vs-team"), "vs-team")
assert.equal(normalizePlayerPageSectionForTabSync("catcher"), "catcher")
assert.equal(normalizePlayerPageSectionForTabSync("advanced"), "basic")
assert.equal(normalizePlayerPageSectionForTabSync("game-log"), "basic")

assert.equal(resolvePitcherSeasonSubTabFromUrlSegment("pitch"), "pitch")
assert.equal(resolvePitcherSeasonSubTabFromUrlSegment("situation"), "situation")
assert.equal(resolvePitcherSeasonSubTabFromUrlSegment("matchup"), "matchup")
assert.equal(resolvePitcherSeasonSubTabFromUrlSegment("vs-team"), "basic")

assert.equal(resolveFielderSeasonDetailTabFromUrlSegment("pitch", false), "pitch")
assert.equal(resolveFielderSeasonDetailTabFromUrlSegment("situation", false), "situation")
assert.equal(resolveFielderSeasonDetailTabFromUrlSegment("matchup", false), "matchup")
assert.equal(resolveFielderSeasonDetailTabFromUrlSegment("vs-team", false), "vs_team_pitch")
assert.equal(resolveFielderSeasonDetailTabFromUrlSegment("catcher", false), "basic")
assert.equal(resolveFielderSeasonDetailTabFromUrlSegment("catcher", true), "catcher")

console.log("validate_player_page_tab_urls_phase4: ok")
