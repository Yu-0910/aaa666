import { redirect, notFound } from "next/navigation"
import { readWeeklyCurrentWeekJsonAsync } from "@/lib/topPage/weeklyCurrentWeekMeta"
import { teamPageHref } from "@/lib/teamPage/teamPageHref"
import { parseTeamPageParams } from "@/lib/teamPage/teamPageParams"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ teamCode: string; year: string }>
  searchParams: Promise<{ sort?: string; order?: string }>
}

/** /teams/{code}/{year}/batting/weekly → 今週 weekKey へリダイレクト */
export default async function TeamBattingWeeklyRedirectPage({ params, searchParams }: Props) {
  const { teamCode, year } = await params
  const parsed = parseTeamPageParams(teamCode, year)
  if (!parsed) notFound()

  const sp = await searchParams
  const meta = await readWeeklyCurrentWeekJsonAsync(process.cwd(), parsed.year)
  const weekKey = meta?.weekKey
  if (!weekKey) notFound()

  redirect(
    teamPageHref({
      teamCode: parsed.teamCode,
      year: parsed.year,
      subTab: "batting",
      weekKey,
      sort: sp.sort,
      order: sp.order === "asc" || sp.order === "desc" ? sp.order : undefined,
    }),
  )
}
