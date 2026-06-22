/**
 * Phase 0 未来日程: JST 今日 .. 今日+14 を --merge で取得（三連戦検出用）。
 *
 *   npx tsx scripts/phase0_fetch_schedule_ahead.ts --year 2026
 *   npm run phase0:fetch:schedule-ahead
 */

import { execSync } from "child_process"
import { addDaysYmd, todayJstYmd } from "@/lib/probables/loadScheduleSnapshots"

function parseArgs(argv: string[]) {
  const yearIdx = argv.indexOf("--year")
  const daysIdx = argv.indexOf("--days")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : "2026"
  const days = daysIdx >= 0 ? Math.max(1, parseInt(argv[daysIdx + 1] ?? "14", 10) || 14) : 14
  return { year, days }
}

function main() {
  const { year, days } = parseArgs(process.argv.slice(2))
  const from = todayJstYmd()
  const to = addDaysYmd(from, days)
  const cmd = `npx tsx scripts/phase0_fetch_sportsnavi_schedule.ts --year ${year} --from ${from} --to ${to} --merge`
  console.log(`[phase0:schedule-ahead] ${from} .. ${to} (${days} days)`)
  execSync(cmd, { stdio: "inherit", shell: true })
}

main()
