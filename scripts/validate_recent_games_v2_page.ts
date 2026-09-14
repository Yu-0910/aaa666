import assert from "node:assert/strict"
import { loadMetricsFromRecord } from "../lib/ranking/record"
import { loadRecentGamesV2 } from "../lib/ranking/loadRecentGamesV2"
import { recentV2Query, recentV2Href, recentV2NextOrder } from "../lib/ranking/recentGamesV2Page"
import { rankRecentV2, parseRecentV2 } from "../lib/ranking/recentGamesV2"
import { formatRankingStatDisplay } from "../lib/formatStat"

async function main() {
  process.env.RANKINGS_PREFER_LOCAL = "1"
  const metrics = loadMetricsFromRecord().map(({ key, label }) => ({ key, label }))
  assert.equal(metrics.length, 36)
  assert.deepEqual(recentV2Query({}, metrics), { sort: "ops", order: "desc" })
  assert.deepEqual(recentV2Query({ sort: "h" }, metrics), { sort: "hits", order: "desc" })
  assert.deepEqual(recentV2Query({ sort: "kPct" }, metrics), { sort: "kPct", order: "asc" })
  assert.deepEqual(recentV2Query({ sort: ["avg", "ops"], order: "invalid" }, metrics), { sort: "ops", order: "desc" })
  assert.deepEqual(recentV2Query({ sort: "<script>" }, metrics), { sort: "ops", order: "desc" })
  for (const league of ["CL", "PL"] as const) {
    const data = await loadRecentGamesV2(league, metrics)
    assert.equal(parseRecentV2({ ...data, rows: [] }, league, metrics).rows.length, 0)
    assert.throws(() => parseRecentV2({ ...data, schemaVersion: "recent-10-games-batting-v1" }, league, metrics))
    for (const { key, label } of metrics) {
      assert.equal(recentV2Query({ sort: key }, metrics).sort, key)
      for (const order of ["asc", "desc"] as const) {
        const url = new URL(recentV2Href(league, key, order), "https://example.test")
        assert.equal(url.searchParams.get("sort"), key)
        assert.equal(url.searchParams.get("order"), order)
        assert.equal(recentV2NextOrder(key, key, order), order === "asc" ? "desc" : "asc")
        const rows = rankRecentV2(data.rows, key, order)
        assert.ok(rows.every((row, index) => !index || (order === "asc"
          ? Number(rows[index - 1].values[key]) <= Number(row.values[key])
          : Number(rows[index - 1].values[key]) >= Number(row.values[key]))))
        assert.ok(rows.every(row => !/NaN|Infinity/.test(formatRankingStatDisplay(label, row.values[key]))))
      }
      assert.equal(formatRankingStatDisplay(label, null), "—")
    }
    assert.deepEqual(rankRecentV2(data.rows, "h"), rankRecentV2(data.rows, "hits"))
  }
  assert.equal(recentV2NextOrder("kPct", "ops", "desc"), "asc")
  console.log("V2 page: CL/PL 36 metrics, both orders, h alias, K% default, empty/schema and formatting OK")
}
main().catch(error => { console.error(error); process.exitCode = 1 })
