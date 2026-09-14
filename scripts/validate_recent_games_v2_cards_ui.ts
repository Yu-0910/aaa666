import assert from "node:assert/strict"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BattingTopFourMetricsGrid } from "../app/components/top/BattingTopFourMetricsGrid"
import { GET } from "../app/api/recent-games-v2/[league]/route"
import { battingSeasonGridMetrics } from "../lib/topPageBatting2025Grid"
import { recentV2Href } from "../lib/ranking/recentGamesV2Page"
import type { RecentV2CardsPayload } from "../lib/topPage/recentGamesV2Cards"

// tsx's standalone JSX transform does not use Next's automatic JSX runtime.
Object.assign(globalThis, { React })
async function main() {
  process.env.RANKINGS_PREFER_LOCAL = "1"
  for (const league of ["CL", "PL"] as const) {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ league }) })
    assert.equal(response.status, 200)
    const data = await response.json() as RecentV2CardsPayload
    assert.equal(data.schemaVersion, "recent-10-cards-v2")
    assert.deepEqual(data.cards.map(card => card.label), [...battingSeasonGridMetrics(2026)])
    assert.deepEqual(data.cards.map(card => card.limit), [5, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3])
    assert.equal(data.cards.reduce((n, card) => n + card.rows.length, 0), 42)
    assert.ok(data.cards.some(card => card.rows.some(row => row.romanName)))
    assert.ok(data.cards.every(card => card.rows.every(row => !row.href || row.href.startsWith("/players/"))))
    const props = { year: 2026, isWeeklyTab: false,
      leaders: Object.fromEntries(data.cards.map(card => [card.label, card.rows])),
      getRankingUrl: (label: string) => recentV2Href(league, data.cards.find(card => card.label === label)!.key),
      getStatsListUrl: (label: string) => recentV2Href(league, data.cards.find(card => card.label === label)!.key),
      renderLeaderRow: ({ index }: { index: number }) => React.createElement("span", { key: index }, "row"),
    }
    const normal = renderToStaticMarkup(React.createElement(BattingTopFourMetricsGrid, props))
    assert.equal((normal.match(/top-page-table-shell/g) ?? []).length, 12)
    const empty = renderToStaticMarkup(React.createElement(BattingTopFourMetricsGrid, { ...props, leaders: {}, emptyLabel: "対象者なし" }))
    assert.equal((empty.match(/対象者なし/g) ?? []).length, 12)
    assert.equal(renderToStaticMarkup(React.createElement(BattingTopFourMetricsGrid, { ...props, leaders: {} })), "")
  }
  assert.equal((await GET(new Request("http://localhost"), { params: Promise.resolve({ league: "invalid" }) })).status, 404)
  console.log("V2 cards UI: 12 metrics / 42 rows, API, roman names, links, empty cards and unchanged TOP empty behavior OK")
}
main().catch(error => { console.error(error); process.exitCode = 1 })
