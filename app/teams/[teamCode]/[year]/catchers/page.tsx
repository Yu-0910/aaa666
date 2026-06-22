import { Suspense } from "react"
import { notFound } from "next/navigation"
import { FullPageLoading } from "@/components/ui/spinner"
import TeamCatcherStatsPageClient from "./TeamCatcherStatsPageClient"
import { buildTeamCatcherRosterSeeds } from "@/lib/teamPage/buildTeamCatcherRosterSeeds"
import { parseTeamPageParams } from "@/lib/teamPage/teamPageParams"

export const dynamic = "force-dynamic"
export const revalidate = 0

type Props = {
  params: Promise<{ teamCode: string; year: string }>
}

export default async function TeamCatchersPage({ params }: Props) {
  const { teamCode, year } = await params
  const parsed = parseTeamPageParams(teamCode, year)
  if (!parsed) notFound()

  const seeds = buildTeamCatcherRosterSeeds(parsed.teamCode, parsed.year)

  return (
    <Suspense fallback={<FullPageLoading />}>
      <TeamCatcherStatsPageClient
        seeds={seeds}
        year={parsed.year}
        teamCode={parsed.teamCode}
        teamDisplay={parsed.teamDisplay}
        league={parsed.league}
      />
    </Suspense>
  )
}
