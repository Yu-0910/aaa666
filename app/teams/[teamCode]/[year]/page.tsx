import { notFound, redirect } from "next/navigation"
import { teamPageHref } from "@/lib/teamPage/teamPageHref"
import { parseTeamPageParams } from "@/lib/teamPage/teamPageParams"

type Props = {
  params: Promise<{ teamCode: string; year: string }>
}

export default async function TeamPageHub({ params }: Props) {
  const { teamCode, year } = await params
  const parsed = parseTeamPageParams(teamCode, year)
  if (!parsed) notFound()

  redirect(
    teamPageHref({
      teamCode: parsed.teamCode,
      year: parsed.year,
      subTab: "batting",
    }),
  )
}
