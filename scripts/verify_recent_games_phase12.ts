import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { buildRecentV2Cards } from "../lib/topPage/recentGamesV2Cards"
import { parseRecentV2 } from "../lib/ranking/recentGamesV2"
import { loadMetricsFromRecord } from "../lib/ranking/record"

async function main() {
  const base = process.argv[2] ?? "http://localhost:3000"
  const metrics = loadMetricsFromRecord().map(({ key, label }) => ({ key, label }))
  const get = async (path: string) => {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(60000) })
    assert.equal(response.status, 200, path)
    return response
  }
  for (const league of ["CL", "PL"] as const) {
    const snapshot = parseRecentV2(JSON.parse(readFileSync(`public/data/rankings/recent-games-v2/2026/${league}/batting.json`, "utf8")), league, metrics)
    const actual = await (await get(`/api/recent-games-v2/${league}`)).json()
    assert.equal(actual.schemaVersion, "recent-10-cards-v2")
    assert.deepEqual(actual.cards.map((card: any) => ({ ...card, rows: card.rows.map(({ href, ...row }: any) => row) })), buildRecentV2Cards(snapshot))
    const player = actual.cards[0].rows.find((row: any) => row.href)?.href
    assert.ok(player)
    await get(player)
    for (const { key } of metrics) {
      const html = await (await get(`/ranking/recent-games/2026/${league}/batting?sort=${key}&order=desc`)).text()
      assert.ok(html.includes('title="OPS"') && html.includes('title="GPA"'), `${league} ${key} missing metric headers`)
      assert.ok(html.includes("<tbody>"), `${league} ${key} missing rows`)
      assert.ok(!html.includes('role="alert"'), `${league} ${key} error`)
    }
    await get(`/ranking/recent-games/2026/${league}/batting?sort=h`)
    console.log(`${league}: API matches all 12 cards; 36 detailed metric URLs, h alias and player page OK`)
  }
  for (const path of ["/", "/weekly-stats", "/standings"]) await get(path)
  console.log("PASS: TOP, weekly tab and standings HTTP checks")
}
main().catch(error => { console.error(error); process.exitCode = 1 })
