/**
 * 休養日（rowspan で翌日試合が scoped に含まれる）の gameId 誤抽出を防ぐ回帰テスト。
 * 修正A: 複数 rowspan / セ・パ別テーブルから和集合で拾う。
 */
import assert from "node:assert/strict"
import {
  extractGamesFromScheduleHtml,
  isNoGameScheduleDay,
  pickBestScheduleGamesForDate,
} from "@/lib/sportsnaviScheduleParse"

const offDayScoped = `
<tr><th class="bb-scheduleTable__head" scope="row" rowspan="3">5月11日</th>
<td colspan="2">試合はありません</td></tr>
<tr><td>神宮</td><td><a href="/npb/game/2021038846/index">試合</a></td></tr>
<tr><td>横浜</td><td><a href="/npb/game/2021038847/index">試合</a></td></tr>
`

assert.equal(isNoGameScheduleDay(offDayScoped, "5月11日"), true)

const gameDayScoped = `
<tr><th class="bb-scheduleTable__head" scope="row">5月12日</th>
<td>神宮</td><td><a href="/npb/game/2021038846/index">試合</a></td></tr>
`
assert.equal(isNoGameScheduleDay(gameDayScoped, "5月12日"), false)

/** 狭い rowspan=1 ブロックは1試合だけだが、rowspan=4 なら3試合 — 修正Aは和集合で3件 */
const threeGamesNarrowRowspanBug = `
<table><tbody>
<tr><th class="bb-scheduleTable__head" scope="row" rowspan="1">5月21日</th>
<td class="bb-scheduleTable__stadium">甲子園</td><td><a href="/npb/game/2021038890/index">試合</a></td></tr>
<tr><th class="bb-scheduleTable__head" scope="row" rowspan="4">5月21日</th>
<td class="bb-scheduleTable__stadium">神宮</td><td><a href="/npb/game/2021038889/index">試合</a></td></tr>
<tr><td class="bb-scheduleTable__stadium">甲子園</td><td><a href="/npb/game/2021038890/index">試合</a></td></tr>
<tr><td class="bb-scheduleTable__stadium">マツダ</td><td><a href="/npb/game/2021038891/index">試合</a></td></tr>
<tr><td></td><td></td></tr>
</tbody></table>
`
const may21 = pickBestScheduleGamesForDate(threeGamesNarrowRowspanBug, "2026-05-21")
assert.equal(may21.length, 3, `expected 3 games on 2026-05-21, got ${may21.length}`)
assert.deepEqual(
  may21.map((g) => g.gameId).sort(),
  ["2021038889", "2021038890", "2021038891"],
)

/** セ・パ別テーブル（5/22 型）— CL 1 + PL 4 = 5 */
const dualLeagueTables = `
<table><tbody>
<tr><th class="bb-scheduleTable__head" scope="row" rowspan="2">5月22日</th>
<td class="bb-scheduleTable__stadium">東京ドーム</td><td><a href="/npb/game/2021038892/index">試合</a></td></tr>
<tr><td></td><td></td></tr>
</tbody></table>
<table><tbody>
<tr><th class="bb-scheduleTable__head" scope="row" rowspan="5">5月22日</th>
<td class="bb-scheduleTable__stadium">バンテリンD</td><td><a href="/npb/game/2021038893/index">試合</a></td></tr>
<tr><td class="bb-scheduleTable__stadium">楽天モバイル</td><td><a href="/npb/game/2021038894/index">試合</a></td></tr>
<tr><td class="bb-scheduleTable__stadium">ベルーナD</td><td><a href="/npb/game/2021038895/index">試合</a></td></tr>
<tr><td class="bb-scheduleTable__stadium">みずほPayPay</td><td><a href="/npb/game/2021038896/index">試合</a></td></tr>
<tr><td></td><td></td></tr>
</tbody></table>
`
const may22 = extractGamesFromScheduleHtml(dualLeagueTables, "2026-05-22")
assert.equal(may22.length, 5, `expected 5 games on 2026-05-22, got ${may22.length}`)
assert.ok(may22.some((g) => g.gameId === "2021038892"), "missing CL game 2021038892")

const offDayHtml = `<table><tbody>${offDayScoped}</tbody></table>`
assert.equal(extractGamesFromScheduleHtml(offDayHtml, "2026-05-11").length, 0)

console.log("[validate_sportsnavi_schedule_parse_unit] OK")
