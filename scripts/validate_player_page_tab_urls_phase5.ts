import assert from "node:assert/strict"
import {
  resolveFielderSeasonDetailTabFromUrlSegment,
  resolvePitcherSeasonSubTabFromUrlSegment,
  resolveUrlSegmentFromFielderSeasonDetailTab,
  resolveUrlSegmentFromPitcherSeasonSubTab,
} from "@/lib/playerPageTabUrlPhase2"

assert.equal(
  resolveUrlSegmentFromPitcherSeasonSubTab(resolvePitcherSeasonSubTabFromUrlSegment("basic")),
  "basic",
)
assert.equal(
  resolveUrlSegmentFromPitcherSeasonSubTab(resolvePitcherSeasonSubTabFromUrlSegment("pitch")),
  "pitch",
)
assert.equal(
  resolveUrlSegmentFromPitcherSeasonSubTab(resolvePitcherSeasonSubTabFromUrlSegment("situation")),
  "situation",
)
assert.equal(
  resolveUrlSegmentFromPitcherSeasonSubTab(resolvePitcherSeasonSubTabFromUrlSegment("matchup")),
  "matchup",
)

assert.equal(
  resolveUrlSegmentFromFielderSeasonDetailTab(resolveFielderSeasonDetailTabFromUrlSegment("basic", false)),
  "basic",
)
assert.equal(
  resolveUrlSegmentFromFielderSeasonDetailTab(resolveFielderSeasonDetailTabFromUrlSegment("pitch", false)),
  "pitch",
)
assert.equal(
  resolveUrlSegmentFromFielderSeasonDetailTab(resolveFielderSeasonDetailTabFromUrlSegment("situation", false)),
  "situation",
)
assert.equal(
  resolveUrlSegmentFromFielderSeasonDetailTab(resolveFielderSeasonDetailTabFromUrlSegment("matchup", false)),
  "matchup",
)
assert.equal(
  resolveUrlSegmentFromFielderSeasonDetailTab(resolveFielderSeasonDetailTabFromUrlSegment("vs-team", false)),
  "vs-team",
)
assert.equal(
  resolveUrlSegmentFromFielderSeasonDetailTab(resolveFielderSeasonDetailTabFromUrlSegment("catcher", true)),
  "catcher",
)

console.log("validate_player_page_tab_urls_phase5: ok")
