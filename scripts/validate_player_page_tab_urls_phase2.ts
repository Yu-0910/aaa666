import assert from "node:assert/strict"
import {
  isPlayerPageTabUrlSegmentSupportedForAudience,
  playerPageTabUrlPath,
  resolveFielderSeasonDetailTabFromUrlSegment,
  resolvePitcherSeasonSubTabFromUrlSegment,
  resolvePlayerPageTabUrlSegment,
  resolvePlayerPageTabUrlSegmentFromLegacy,
} from "@/lib/playerPageTabUrlPhase2"

assert.equal(playerPageTabUrlPath("teruaki-sato"), "/players/teruaki-sato")
assert.equal(playerPageTabUrlPath("teruaki-sato", "pitch"), "/players/teruaki-sato/pitch")

assert.equal(resolvePlayerPageTabUrlSegment(undefined), "basic")
assert.equal(resolvePlayerPageTabUrlSegment(["pitch"]), "pitch")
assert.equal(resolvePlayerPageTabUrlSegment(["vs-team"]), "vs-team")
assert.equal(resolvePlayerPageTabUrlSegment(["unknown"]), "basic")

assert.equal(resolvePlayerPageTabUrlSegmentFromLegacy("pitch-types"), "pitch")
assert.equal(resolvePlayerPageTabUrlSegmentFromLegacy("splits"), "situation")
assert.equal(resolvePlayerPageTabUrlSegmentFromLegacy("advanced"), "basic")
assert.equal(resolvePlayerPageTabUrlSegmentFromLegacy("game_log"), "basic")
assert.equal(resolvePlayerPageTabUrlSegmentFromLegacy("vs_team"), "vs-team")

assert.equal(resolvePitcherSeasonSubTabFromUrlSegment("basic"), "basic")
assert.equal(resolvePitcherSeasonSubTabFromUrlSegment("pitch"), "pitch")
assert.equal(resolvePitcherSeasonSubTabFromUrlSegment("situation"), "situation")
assert.equal(resolvePitcherSeasonSubTabFromUrlSegment("matchup"), "matchup")
assert.equal(resolvePitcherSeasonSubTabFromUrlSegment("vs-team"), "basic")

assert.equal(resolveFielderSeasonDetailTabFromUrlSegment("basic", false), "basic")
assert.equal(resolveFielderSeasonDetailTabFromUrlSegment("pitch", false), "pitch")
assert.equal(resolveFielderSeasonDetailTabFromUrlSegment("situation", false), "situation")
assert.equal(resolveFielderSeasonDetailTabFromUrlSegment("matchup", false), "matchup")
assert.equal(resolveFielderSeasonDetailTabFromUrlSegment("vs-team", false), "vs_team_pitch")
assert.equal(resolveFielderSeasonDetailTabFromUrlSegment("catcher", false), "basic")
assert.equal(resolveFielderSeasonDetailTabFromUrlSegment("catcher", true), "catcher")

assert.equal(isPlayerPageTabUrlSegmentSupportedForAudience("pitcher", "matchup"), true)
assert.equal(isPlayerPageTabUrlSegmentSupportedForAudience("pitcher", "vs-team"), false)
assert.equal(isPlayerPageTabUrlSegmentSupportedForAudience("fielder", "vs-team"), true)
assert.equal(isPlayerPageTabUrlSegmentSupportedForAudience("fielder", "catcher"), false)
assert.equal(isPlayerPageTabUrlSegmentSupportedForAudience("catcher", "catcher"), true)

console.log("validate_player_page_tab_urls_phase2: ok")
