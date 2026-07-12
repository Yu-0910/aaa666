/**
 * Yahoo! 日程ページから予告先発を取得してキャッシュする。
 *
 * 既定は「翌日 JST」のみ。トップ予想投手タブでは、翌日分だけ
 * Yahoo! の予告先発を優先し、それ以外は Sporting News ローテーションを使う。
 *
 *   npx tsx scripts/fetch_yahoo_schedule_probables.ts --year 2026
 *   npx tsx scripts/fetch_yahoo_schedule_probables.ts --date 2026-07-12
 */

import { loadYahooScheduleProbablesSnapshot } from "@/lib/probables/yahooScheduleProbables"
import { addDaysYmd, todayJstYmd } from "@/lib/probables/loadScheduleSnapshots"

function parseArgs(argv: string[]) {
  const dateIdx = argv.indexOf("--date")
  const yearIdx = argv.indexOf("--year")
  const dateJst = dateIdx >= 0 ? (argv[dateIdx + 1] ?? "").trim() : ""
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : "2026"
  return {
    year,
    dateJst: dateJst || addDaysYmd(todayJstYmd(), 1),
  }
}

async function main() {
  const { year, dateJst } = parseArgs(process.argv.slice(2))
  const snap = await loadYahooScheduleProbablesSnapshot(dateJst, undefined, true)
  if (!snap) {
    console.warn(`[yahoo-schedule-probables] no rows year=${year} date=${dateJst}`)
    return
  }

  const named = snap.rows.reduce(
    (sum, row) => sum + (row.homePitcherNameJa ? 1 : 0) + (row.awayPitcherNameJa ? 1 : 0),
    0,
  )
  console.log(
    `[yahoo-schedule-probables] cached year=${year} date=${dateJst} games=${snap.rows.length} named=${named} url=${snap.sourceUrl}`,
  )
}

main().catch((e) => {
  console.error("[yahoo-schedule-probables] failed:", e?.message || e)
  process.exit(1)
})
