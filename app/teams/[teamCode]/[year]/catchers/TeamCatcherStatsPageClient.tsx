"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import DerivedPipelineEmptyNotice from "@/app/components/DerivedPipelineEmptyNotice"
import TeamCatcherStatsTable from "@/app/components/teamPage/TeamCatcherStatsTable"
import { useClientSearchString } from "@/hooks/useIsDesktop"
import { teamPageHref } from "@/lib/teamPage/teamPageHref"
import {
  TEAM_CATCHER_DEFAULT_SORT_KEY,
  TEAM_CATCHER_DEFAULT_SORT_ORDER,
  TEAM_CATCHER_SORT_KEYS,
  type TeamCatcherSortKey,
} from "@/lib/teamPage/teamCatcherColumns"
import { sortTeamCatcherRows } from "@/lib/teamPage/sortTeamCatcherRows"
import type { TeamCatcherStatsRow } from "@/lib/teamPage/teamCatcherRoster"

type Props = {
  rows: TeamCatcherStatsRow[]
  year: string
  teamCode: string
  teamDisplay: string
  league: "CL" | "PL"
}

function parseCatcherSortFromSearch(search: string): {
  sortKey: TeamCatcherSortKey
  order: "asc" | "desc"
} {
  const sp = new URLSearchParams(search.replace(/^\?/, ""))
  const sortRaw = sp.get("sort") ?? TEAM_CATCHER_DEFAULT_SORT_KEY
  const orderRaw = sp.get("order")
  const sortKey = (TEAM_CATCHER_SORT_KEYS as readonly string[]).includes(sortRaw)
    ? (sortRaw as TeamCatcherSortKey)
    : TEAM_CATCHER_DEFAULT_SORT_KEY
  const order =
    orderRaw === "asc" || orderRaw === "desc" ? orderRaw : TEAM_CATCHER_DEFAULT_SORT_ORDER
  return { sortKey, order }
}

function defaultOrderForCatcherKey(key: TeamCatcherSortKey): "asc" | "desc" {
  if (key === "player") return "asc"
  if (
    key === "era" ||
    key === "whip" ||
    key === "avgAgainst" ||
    key === "obpAgainst" ||
    key === "slgAgainst" ||
    key === "babipAgainst"
  ) {
    return "asc"
  }
  return "desc"
}

export default function TeamCatcherStatsPageClient({
  rows,
  year,
  teamCode,
  teamDisplay,
  league,
}: Props) {
  const router = useRouter()
  const clientSearch = useClientSearchString()
  const { sortKey, order } = useMemo(
    () => parseCatcherSortFromSearch(clientSearch),
    [clientSearch],
  )
  const sortedRows = useMemo(() => sortTeamCatcherRows(rows, sortKey, order), [rows, sortKey, order])
  const hasAnyDerivedData = useMemo(
    () =>
      rows.some(
        (row) =>
          (row.gamesAsCatcher ?? 0) > 0 ||
          row.pitches != null ||
          row.bf != null ||
          row.starts != null,
      ),
    [rows],
  )
  const seedCount = rows.length

  const handleSortChange = (key: TeamCatcherSortKey) => {
    let newOrder: "asc" | "desc"
    if (sortKey === key) {
      newOrder = order === "asc" ? "desc" : "asc"
    } else {
      newOrder = defaultOrderForCatcherKey(key)
    }
    router.replace(
      teamPageHref({
        teamCode,
        year,
        subTab: "catchers",
        sort: key,
        order: newOrder,
      }),
    )
  }

  return (
    <>
      <DerivedPipelineEmptyNotice variant="catcher" show={seedCount > 0 && !hasAnyDerivedData} />

      {seedCount === 0 ? (
        <div className="bg-[#1a1a1a] border border-[#333] px-4 py-8 text-center text-sm text-gray-400">
          名簿に登録された捕手がいません。
        </div>
      ) : (
        <TeamCatcherStatsTable
          rows={sortedRows}
          sortKey={sortKey}
          year={year}
          teamCode={teamCode}
          onSortChange={handleSortChange}
        />
      )}
    </>
  )
}
