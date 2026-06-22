/**
 * Phase 0: チームページ仕様の単体検証（vitest 非依存）
 *
 *   npx tsx scripts/validate_team_page_phase0_unit.ts [--fail]
 */

import {
  TEAM_CATCHER_COLUMNS,
  TEAM_CATCHER_DEFAULT_SORT_KEY,
  TEAM_CATCHER_DEFAULT_SORT_ORDER,
} from "@/lib/teamPage/teamCatcherColumns"
import {
  ORDERED_TEAM_CODES,
  TEAM_PAGE_SUB_TABS,
  TEAM_PAGE_V1_YEARS,
} from "@/lib/teamPage/teamPageConstants"
import { aggregateCatcherPitcherSplits } from "@/lib/teamPage/teamCatcherMetrics"
import {
  filterAndRerankRankingRowsByTeam,
  rowMatchesTeamCode,
} from "@/lib/teamPage/filterRankingRowsByTeam"
import {
  leagueForTeamCode,
  parseTeamPageParams,
  teamPageStaticParams,
} from "@/lib/teamPage/teamPageParams"
import {
  teamPageBattingTitle,
  teamPageHref,
  teamPagePitchingTitle,
} from "@/lib/teamPage/teamPageHref"
import {
  TEAM_PAGE_DRAWER_NAV,
  teamPageNavEnabledForYear,
  teamPageNavHref,
} from "@/lib/teamPage/teamPageNavLinks"
import type { RankingRow } from "@/lib/ranking/types"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function row(team: string, playerId: string, rank: number): RankingRow {
  return { rank, playerId, name: playerId, team, valueText: "0" }
}

function main() {
  assert(ORDERED_TEAM_CODES.length === 12, "12 teams")
  assert(TEAM_PAGE_V1_YEARS[0] === "2026", "v1 year")
  assert(TEAM_PAGE_SUB_TABS.length === 3, "3 sub tabs")
  assert(TEAM_PAGE_SUB_TABS[0]?.id === "batting", "default sub tab")

  for (const code of ORDERED_TEAM_CODES) {
    const parsed = parseTeamPageParams(code, "2026")
    assert(parsed != null, `parse ${code}`)
    assert(leagueForTeamCode(code) === parsed!.league, `league ${code}`)
  }

  assert(parseTeamPageParams("hanshin", "2026") === null, "invalid slug")
  assert(parseTeamPageParams("H", "2025") === null, "invalid year")
  assert(parseTeamPageParams("Hs", "2026")?.league === "PL", "softbank PL")

  assert(teamPageStaticParams().length === 12, "static params count")

  assert(rowMatchesTeamCode(row("阪神", "a", 1), "H"), "short name filter")
  assert(rowMatchesTeamCode(row("DeNA", "a", 1), "DB"), "dena filter")
  const filtered = filterAndRerankRankingRowsByTeam(
    [row("H", "a", 1), row("G", "b", 2), row("阪神", "c", 5)],
    "H",
  )
  assert(filtered.length === 2 && filtered[0]!.rank === 1 && filtered[1]!.rank === 2, "rerank")

  assert(
    teamPageHref({ teamCode: "H", sort: "ops" }) === "/teams/H/2026/batting?sort=ops",
    "href",
  )
  assert(teamPageBattingTitle("阪神", 2026) === "2026年 阪神 打撃成績ランキング", "batting title")
  assert(teamPagePitchingTitle("横浜", 2026) === "2026年 横浜 投手成績ランキング", "pitching title")

  assert(TEAM_CATCHER_COLUMNS.length === 30, "catcher columns")
  assert(TEAM_CATCHER_DEFAULT_SORT_KEY === "gamesAsCatcher", "catcher default sort")
  assert(TEAM_CATCHER_DEFAULT_SORT_ORDER === "desc", "catcher default order")

  const agg = aggregateCatcherPitcherSplits([
    {
      pitcherNpbId: "1",
      pitcherName: "P",
      pitcherTeam: "H",
      bf: 100,
      ab: 80,
      h: 20,
      hr: 2,
      so: 30,
      bb: 10,
      hbp: 1,
      ipOuts: 27,
      era: 3.0,
      ip: "9",
      wl: "1-0",
      kPct: null,
      kBbPct: null,
      whip: null,
      qsPct: null,
    },
  ])
  assert(agg.bf === 100 && agg.whip != null && agg.kPct === 30, "catcher agg")

  assert(TEAM_PAGE_DRAWER_NAV.CL.length === 6, "drawer CL")
  assert(TEAM_PAGE_DRAWER_NAV.PL.length === 6, "drawer PL")
  assert(teamPageNavHref("H", 2026) === "/teams/H/2026", "nav href 2026")
  assert(teamPageNavHref("H", 2025) === "/teams/H/2026", "nav href fallback year")
  assert(teamPageNavEnabledForYear(2026), "nav enabled 2026")
  assert(!teamPageNavEnabledForYear(2025), "nav disabled 2025")

  console.log("validate_team_page_phase0_unit: OK")
}

try {
  main()
} catch (e) {
  console.error("validate_team_page_phase0_unit: FAIL", e)
  if (process.argv.includes("--fail")) process.exit(1)
  throw e
}
