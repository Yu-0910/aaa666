import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import RankingBottomNav from "../app/components/common/RankingBottomNav"

Object.assign(globalThis, { React })
const noop = () => {}
for (const activeView of ["cl-batting", "pl-batting"] as const) {
  const html = renderToStaticMarkup(React.createElement(RankingBottomNav, {
    mode: "weekly", activeView, onViewChange: noop,
  }))
  assert.equal((html.match(/<button/g) ?? []).length, 2)
  assert.ok(html.includes("grid-cols-2"))
  assert.ok(!html.includes("md:hidden"))
  assert.ok(!html.includes("投手"))
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1)
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 1)
  assert.equal((html.match(/aria-controls="weekly-ranking-content"/g) ?? []).length, 2)
  assert.ok(html.includes("focus-visible:outline-2"))
  assert.ok(html.includes("min-h-[58px]"))
}
for (const [props, count] of [
  [{ activeView: "cl-batting", onViewChange: noop }, 4],
  [{ mode: "standings", year: 2026, activeView: "cl-season", onViewChange: noop }, 4],
  [{ mode: "standings", year: 2025, activeView: "cl-season", onViewChange: noop }, 2],
] as const) {
  const html = renderToStaticMarkup(React.createElement(RankingBottomNav, props))
  assert.equal((html.match(/<button/g) ?? []).length, count)
  assert.ok(html.includes("md:hidden"))
  assert.ok(html.includes("grid-cols-4"))
  assert.ok(!html.includes("aria-pressed"))
}
const client = readFileSync("app/components/top/TopPageClient.tsx", "utf8")
assert.ok(!client.includes("TopPageWeeklyCategoryNav"))
assert.ok(client.includes('mode="weekly" activeView={topWeeklyView}'))
assert.ok(client.includes("pb-[calc(env(safe-area-inset-bottom)+120px)]"))
console.log("PASS: weekly bottom nav, accessibility markup, and existing navigation regression checks")
