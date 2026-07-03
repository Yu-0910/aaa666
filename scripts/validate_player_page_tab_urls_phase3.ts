import assert from "node:assert/strict"
import { resolvePlayerRouteOrRedirect } from "@/app/players/[playerId]/playerRouteServer"

type RedirectLike = { digest?: string }

function assertRedirect(fn: () => unknown): void {
  let redirected = false
  try {
    fn()
  } catch (error) {
    const e = error as RedirectLike
    redirected = typeof e?.digest === "string" && e.digest.includes("NEXT_REDIRECT")
  }
  assert.equal(redirected, true)
}

const pitcherPitch = resolvePlayerRouteOrRedirect({
  playerId: "hiroto-takahashi",
  rest: ["pitch"],
})
assert.equal(pitcherPitch.entry.slug, "hiroto-takahashi")
assert.equal(pitcherPitch.pageSection, "pitch")

const fielderMatchup = resolvePlayerRouteOrRedirect({
  playerId: "teruaki-sato",
  rest: ["matchup"],
})
assert.equal(fielderMatchup.entry.slug, "teruaki-sato")
assert.equal(fielderMatchup.pageSection, "matchup")

const catcherTab = resolvePlayerRouteOrRedirect({
  playerId: "seiya-hashimoto",
  rest: ["catcher"],
})
assert.equal(catcherTab.entry.slug, "seiya-hashimoto")
assert.equal(catcherTab.pageSection, "catcher")

assertRedirect(() =>
  resolvePlayerRouteOrRedirect({
    playerId: "hiroto-takahashi",
    rest: ["vs-team"],
  }),
)

assertRedirect(() =>
  resolvePlayerRouteOrRedirect({
    playerId: "teruaki-sato",
    rest: ["catcher"],
  }),
)

assertRedirect(() =>
  resolvePlayerRouteOrRedirect({
    playerId: "teruaki-sato",
    rest: ["pitch-types"],
  }),
)

assertRedirect(() =>
  resolvePlayerRouteOrRedirect({
    playerId: "teruaki-sato",
    searchParams: { tab: "splits" },
  }),
)

console.log("validate_player_page_tab_urls_phase3: ok")
