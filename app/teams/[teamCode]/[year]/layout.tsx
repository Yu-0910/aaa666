import { Suspense, type ReactNode } from "react"
import { notFound } from "next/navigation"
import TeamPageShell from "@/app/components/teamPage/TeamPageShell"
import { FullPageLoading } from "@/components/ui/spinner"
import { parseTeamPageParams, teamPageStaticParams } from "@/lib/teamPage/teamPageParams"

type Props = {
  children: ReactNode
  params: Promise<{ teamCode: string; year: string }>
}

export function generateStaticParams() {
  return teamPageStaticParams()
}

export default async function TeamYearLayout({ children, params }: Props) {
  const { teamCode, year } = await params
  const parsed = parseTeamPageParams(teamCode, year)
  if (!parsed) notFound()

  return (
    <Suspense fallback={<FullPageLoading />}>
      <TeamPageShell
        teamCode={parsed.teamCode}
        year={parsed.year}
        teamDisplay={parsed.teamDisplay}
      >
        {children}
      </TeamPageShell>
    </Suspense>
  )
}
