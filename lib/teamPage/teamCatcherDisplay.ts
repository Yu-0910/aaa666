import { slashRate3FromCounts } from "@/lib/battingRateFormat"
import { formatEra, formatRankingStatDisplay } from "@/lib/formatStat"
import type { TeamCatcherSortKey } from "@/lib/teamPage/teamCatcherColumns"
import { outsToIpString } from "@/lib/teamPage/teamCatcherBasicStats"
import type { TeamCatcherStatsRow } from "@/lib/teamPage/teamCatcherRoster"

const NA = "—"

function fmtInt(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return NA
  return String(v)
}

function fmtPct1(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return NA
  return `${v.toFixed(1)}%`
}

function fmtDec2(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return NA
  return v.toFixed(2)
}

export function formatTeamCatcherCell(
  row: TeamCatcherStatsRow,
  key: TeamCatcherSortKey | "rank",
): string {
  if (key === "rank" || key === "player") return key === "player" ? row.nameJa : NA
  switch (key) {
    case "era":
      return row.era == null ? NA : formatEra(row.era)
    case "gamesAsCatcher":
      return row.gamesAsCatcher == null ? NA : fmtInt(row.gamesAsCatcher)
    case "starts":
      return fmtInt(row.starts)
    case "wins":
      return fmtInt(row.wins)
    case "losses":
      return fmtInt(row.losses)
    case "draws":
      return fmtInt(row.draws)
    case "avgAgainst":
      if (row.h != null && row.ab != null && row.ab > 0) {
        return slashRate3FromCounts(row.h, row.ab)
      }
      return row.avgAgainst == null ? NA : formatRankingStatDisplay("被打率", row.avgAgainst)
    case "qsCount":
      return fmtInt(row.qsCount)
    case "teamWinPct":
      return row.teamWinPct == null ? NA : formatRankingStatDisplay("勝率", row.teamWinPct)
    case "ipOuts":
      return row.ipOuts == null ? NA : outsToIpString(row.ipOuts)
    case "bf":
      return fmtInt(row.bf)
    case "pitches":
      return fmtInt(row.pitches)
    case "h":
      return fmtInt(row.h)
    case "kPct":
      return row.kPct == null ? NA : fmtPct1(row.kPct)
    case "whip":
      return row.whip == null ? NA : formatRankingStatDisplay("WHIP", row.whip)
    case "hr":
      return fmtInt(row.hr)
    case "so":
      return fmtInt(row.so)
    case "bb":
      return fmtInt(row.bb)
    case "ibb":
      return fmtInt(row.ibb)
    case "er":
      return fmtInt(row.er)
    case "hbp":
      return fmtInt(row.hbp)
    case "qsPct":
      return row.qsPct == null ? NA : fmtPct1(row.qsPct)
    case "hqsPct":
      return row.hqsPct == null ? NA : fmtPct1(row.hqsPct)
    case "babipAgainst":
      return row.babipAgainst == null
        ? NA
        : formatRankingStatDisplay("被BABIP", row.babipAgainst)
    case "obpAgainst":
      return row.obpAgainst == null
        ? NA
        : formatRankingStatDisplay("被出塁率", row.obpAgainst)
    case "slgAgainst":
      return row.slgAgainst == null
        ? NA
        : formatRankingStatDisplay("被長打率", row.slgAgainst)
    case "goAo":
      return fmtDec2(row.goAo)
    case "csPct":
      return row.csPct == null ? NA : fmtPct1(row.csPct)
    case "pbPer9":
      return fmtDec2(row.pbPer9)
    default:
      return NA
  }
}

export function teamCatcherSortValue(
  row: TeamCatcherStatsRow,
  key: TeamCatcherSortKey,
): number | string | null {
  if (key === "player") return row.nameJa
  const v = row[key]
  return v == null || (typeof v === "number" && Number.isNaN(v)) ? null : v
}
