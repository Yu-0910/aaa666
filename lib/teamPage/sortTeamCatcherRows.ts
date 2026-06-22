import type { TeamCatcherSortKey } from "@/lib/teamPage/teamCatcherColumns"
import { teamCatcherSortValue } from "@/lib/teamPage/teamCatcherDisplay"
import type { TeamCatcherStatsRow } from "@/lib/teamPage/teamCatcherRoster"

export function sortTeamCatcherRows(
  rows: TeamCatcherStatsRow[],
  sortKey: TeamCatcherSortKey,
  order: "asc" | "desc",
): TeamCatcherStatsRow[] {
  const sorted = [...rows].sort((a, b) => {
    const av = teamCatcherSortValue(a, sortKey)
    const bv = teamCatcherSortValue(b, sortKey)
    if (av == null && bv == null) return a.nameJa.localeCompare(b.nameJa, "ja")
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === "string" && typeof bv === "string") {
      const c = av.localeCompare(bv, "ja")
      return order === "asc" ? c : -c
    }
    const an = Number(av)
    const bn = Number(bv)
    if (order === "asc") return an - bn
    return bn - an
  })
  return sorted.map((row, i) => ({ ...row, rank: i + 1 }))
}
