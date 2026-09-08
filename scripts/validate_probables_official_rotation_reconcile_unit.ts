import assert from "node:assert/strict"
import { reconcileOfficialProbablesWithSportingNews } from "@/lib/probables/buildTopProbablesSnapshot"
import type { TopProbablesGame, TopProbablesPitcherSlot } from "@/lib/probables/types"

function slot(name: string, source: TopProbablesPitcherSlot["source"]): TopProbablesPitcherSlot {
  return {
    teamCode: "M",
    pitcherNameJa: name,
    pitcherNpbId: name,
    pitcherPublicId: name,
    source,
    topOpponentBatters: [],
  }
}

function game(dateJst: string, probable: TopProbablesPitcherSlot): TopProbablesGame {
  return {
    dateJst,
    gameId: dateJst,
    homeTeamCode: "M",
    awayTeamCode: "Bs",
    homeProbable: probable,
    awayProbable: null,
  }
}

const warnings: string[] = []
const tomorrowOfficial = [
  game("2026-09-04", slot("A", "sportingnews")),
  game("2026-09-05", slot("A", "yahoo-schedule")),
]
reconcileOfficialProbablesWithSportingNews(
  tomorrowOfficial,
  (_team, _opponent, date) => (date === "2026-09-05" ? slot("B", "sportingnews") : null),
  warnings,
)
assert.equal(tomorrowOfficial[0]!.homeProbable?.pitcherNameJa, "B")
assert.equal(tomorrowOfficial[1]!.homeProbable?.pitcherNameJa, "A")

const todayOfficial = [
  game("2026-09-04", slot("A", "yahoo-schedule")),
  game("2026-09-05", slot("A", "sportingnews")),
]
reconcileOfficialProbablesWithSportingNews(
  todayOfficial,
  (_team, _opponent, date) => (date === "2026-09-04" ? slot("B", "sportingnews") : null),
  warnings,
)
assert.equal(todayOfficial[0]!.homeProbable?.pitcherNameJa, "A")
assert.equal(todayOfficial[1]!.homeProbable?.pitcherNameJa, "B")
assert.equal(warnings.length, 2)

console.log("[validate:probables-official-rotation-reconcile] OK")
