import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { GET } from "../app/api/recent-games-v2/[league]/route"
import { fetchCurrentWeekMeta } from "../lib/topPage/fetchTopWeeklyLeadersClient"

async function main() {
  const fetchOriginal = globalThis.fetch
  const baseOriginal = process.env.RANKINGS_BASE_URL
  const localOriginal = process.env.RANKINGS_PREFER_LOCAL
  const request = new Request("http://localhost/api/recent-games-v2/CL")
  const context = { params: Promise.resolve({ league: "CL" }) }
  process.env.RANKINGS_BASE_URL = "https://fixture.invalid"
  delete process.env.RANKINGS_PREFER_LOCAL
  try {
    globalThis.fetch = async () => new Response("unavailable", { status: 503 })
    assert.equal((await GET(request, context)).status, 503)
    await assert.rejects(fetchCurrentWeekMeta(2026))
    globalThis.fetch = async () => { throw new Error("network unavailable") }
    assert.equal((await GET(request, context)).status, 503)
    const snapshot = JSON.parse(readFileSync("public/data/rankings/recent-games-v2/2026/CL/batting.json", "utf8"))
    globalThis.fetch = async () => Response.json({ ...snapshot, rows: [] })
    const empty = await (await GET(request, context)).json()
    assert.equal(empty.cards.length, 12)
    assert.ok(empty.cards.every((card: any) => card.rows.length === 0))
    globalThis.fetch = async () => Response.json(snapshot)
    assert.equal((await GET(request, context)).status, 200)
    globalThis.fetch = async () => Response.json({ weekKey: "2026-09-01", calendarWeekKey: "2026-09-08", isFallbackWeek: true })
    const meta = await fetchCurrentWeekMeta(2026)
    assert.equal(meta.weekKey, "2026-09-01")
    assert.equal(meta.isFallbackWeek, true)
    assert.equal((await GET(request, { params: Promise.resolve({ league: "invalid" }) })).status, 404)
    console.log("PASS: HTTP/network failure, recovery, empty 12 cards, weekly metadata failure/fallback, invalid league")
  } finally {
    globalThis.fetch = fetchOriginal
    if (baseOriginal === undefined) delete process.env.RANKINGS_BASE_URL
    else process.env.RANKINGS_BASE_URL = baseOriginal
    if (localOriginal === undefined) delete process.env.RANKINGS_PREFER_LOCAL
    else process.env.RANKINGS_PREFER_LOCAL = localOriginal
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
