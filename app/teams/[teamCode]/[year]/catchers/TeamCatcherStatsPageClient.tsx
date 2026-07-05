"use client"

import { useRouter } from "next/navigation"
import DerivedPipelineEmptyNotice from "@/app/components/DerivedPipelineEmptyNotice"
import TeamCatcherStatsTable from "@/app/components/teamPage/TeamCatcherStatsTable"
import { useTeamCatcherStatsRows } from "@/hooks/useTeamCatcherStatsRows"
import { teamPageHref } from "@/lib/teamPage/teamPageHref"
import type { TeamCatcherSortKey } from "@/lib/teamPage/teamCatcherColumns"
import type { TeamCatcherRosterSeed } from "@/lib/teamPage/teamCatcherRoster"
import { FullPageLoading } from "@/components/ui/spinner"

type Props = {
  seeds: TeamCatcherRosterSeed[]
  year: string
  teamCode: string
  teamDisplay: string
  league: "CL" | "PL"
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
  seeds,
  year,
  teamCode,
  teamDisplay,
  league,
}: Props) {
  const router = useRouter()
  const { sortKey, order, sortedRows, loading, loadError, hasAnyDerivedData, seedCount } =
    useTeamCatcherStatsRows({ seeds, year, teamCode, league })

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

  if (loadError) {
    return (
      <div className="bg-[#1a1a1a] border border-[#333] px-4 py-8 text-center text-sm text-gray-400">
        {loadError}
      </div>
    )
  }

  if (loading) {
    return <FullPageLoading />
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
          onSortChange={handleSortChange}
        />
      )}
    </>
  )
}
