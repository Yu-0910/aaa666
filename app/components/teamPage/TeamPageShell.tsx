"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { useClientPathname, useClientSearchString } from "@/hooks/useIsDesktop"
import { SITE_TOP_HREF } from "@/lib/siteNavigation"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"
import { weekLabelForKey } from "@/lib/ranking/weeklyRankingsWeekKeys"
import { TEAM_PAGE_SUB_TABS, TEAM_PAGE_V1_YEARS } from "@/lib/teamPage/teamPageConstants"
import { teamPageHref, teamPageWeeklyHubHref } from "@/lib/teamPage/teamPageHref"
import { teamPagePeerNavByLeague } from "@/lib/teamPage/teamPageNavLinks"
import {
  parseTeamPageSortFromSearch,
  teamEnglishOfficialName,
  teamPageShellTitle,
} from "@/lib/teamPage/teamPageShellHeading"
import {
  activeTeamPageSubTabFromPathname,
  isTeamPageRankingSubTab,
  isTeamPageWeeklyPath,
  teamPageSubTabLabel,
  teamPageWeeklyWeekKeyFromPathname,
} from "@/lib/teamPage/teamPagePath"
import type { TeamPageV1Year } from "@/lib/teamPage/teamPageConstants"
import SiteFooter from "@/app/components/common/SiteFooter"

export type TeamPageShellProps = {
  teamCode: string
  year: TeamPageV1Year
  teamDisplay: string
  children: React.ReactNode
}

export default function TeamPageShell({
  teamCode,
  year,
  teamDisplay,
  children,
}: TeamPageShellProps) {
  const pathname = useClientPathname()
  const router = useRouter()
  const clientSearch = useClientSearchString()
  const activeSubTab = activeTeamPageSubTabFromPathname(pathname)
  const isWeekly = isTeamPageWeeklyPath(pathname)
  const weekKey = teamPageWeeklyWeekKeyFromPathname(pathname)
  const weekLabel = weekKey ? weekLabelForKey(weekKey) : null
  const showPeriodToggle = isTeamPageRankingSubTab(activeSubTab)
  const stripeColor = rankingTeamStripeColor(teamCode)
  const activeTabLabel = teamPageSubTabLabel(activeSubTab)
  const sortKey = parseTeamPageSortFromSearch(clientSearch, activeSubTab)
  const shellTitle = teamPageShellTitle(teamDisplay, year, activeSubTab, sortKey, {
    isWeekly,
    weekLabel,
  })
  const shellSubtitle = teamEnglishOfficialName(teamCode)
  const peerTeamsByLeague = teamPagePeerNavByLeague(teamCode)
  const searchParams = new URLSearchParams(clientSearch.replace(/^\?/, ""))
  const sortParam = searchParams.get("sort") ?? undefined
  const orderParam = (searchParams.get("order") as "asc" | "desc" | null) ?? undefined

  const peerHrefOptions = useMemo(
    () => ({
      year,
      subTab: activeSubTab,
      weekKey: isWeekly && weekKey && isTeamPageRankingSubTab(activeSubTab) ? weekKey : undefined,
      sort: sortParam,
      order: orderParam,
    }),
    [year, activeSubTab, isWeekly, weekKey, sortParam, orderParam],
  )

  const handleYearChange = (newYear: string) => {
    router.push(
      teamPageHref({
        teamCode,
        year: newYear,
        subTab: activeSubTab,
        weekKey: isWeekly && weekKey && isTeamPageRankingSubTab(activeSubTab) ? weekKey : undefined,
        sort: sortParam,
        order: orderParam,
      }),
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div
        className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-[#333]"
        style={{ zIndex: 300 }}
      >
        <div className="container mx-auto px-4 py-1 border-b border-[#333] flex items-center justify-between">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="flex items-center gap-1 p-1 hover:opacity-80 transition-opacity text-[#ffff44]"
            aria-label="戻る"
          >
            <span className="text-sm">←</span>
          </button>

          <Link href={SITE_TOP_HREF} className="absolute left-1/2 transform -translate-x-1/2">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-7 h-7 cursor-pointer hover:opacity-80 transition-opacity"
            />
          </Link>

          <select
            value={year}
            onChange={(e) => handleYearChange(e.target.value)}
            className="bg-[#1a1a1a] text-[#ffff44] border border-[#555] rounded px-2 py-0.5 text-sm bebas cursor-pointer hover:bg-[#2a2a2a] transition-colors"
            aria-label="年度を選択"
          >
            {TEAM_PAGE_V1_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-2 py-3">
        <nav className="text-[11px] text-gray-500 mb-2" aria-label="パンくず">
          <Link href={SITE_TOP_HREF} className="hover:text-gray-300">
            トップ
          </Link>
          <span className="mx-1">›</span>
          <span className="text-gray-400">{teamDisplay}</span>
          <span className="mx-1">›</span>
          <span className="text-gray-300">{activeTabLabel}</span>
        </nav>

        <nav className="text-[11px] mb-2 flex flex-col gap-1.5" aria-label="他球団のチームページ">
          {(["CL", "PL"] as const).map((leagueKey) => (
            <div key={leagueKey} className="flex flex-wrap gap-1.5">
              {peerTeamsByLeague[leagueKey].map(({ teamCode: peerCode, label }) => (
                <Link
                  key={peerCode}
                  href={teamPageHref({
                    teamCode: peerCode,
                    ...peerHrefOptions,
                  })}
                  className="inline-flex items-center rounded border border-[#444] bg-[#141414] px-2 py-0.5 text-[11px] text-gray-400 hover:border-[#666] hover:text-[#ffff44] transition-colors"
                >
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2 mb-1">
          <div className="w-1 h-8 shrink-0" style={{ backgroundColor: stripeColor }} aria-hidden />
          <div>
            <h1 className="text-base font-bold text-white leading-tight">{shellTitle}</h1>
            <p className="text-xs text-gray-400 latin">{shellSubtitle}</p>
          </div>
        </div>

        <div
          className="relative isolate box-border mb-4 flex min-h-10 w-full shrink-0 items-stretch overflow-hidden"
          style={{ border: "1px solid #555", backgroundColor: "#1a1a1a" }}
        >
          {TEAM_PAGE_SUB_TABS.map((tab) => {
            const active = tab.id === activeSubTab
            const tabWeekly =
              isWeekly && weekKey && (tab.id === "batting" || tab.id === "pitching") ? weekKey : undefined
            return (
              <Link
                key={tab.id}
                href={teamPageHref({ teamCode, year, subTab: tab.id, weekKey: tabWeekly })}
                className="relative z-[1] flex flex-1 items-center justify-center px-2 py-2 text-center text-[12px] font-bold leading-tight transition-colors"
                style={{
                  backgroundColor: active ? "#FFFF44" : "transparent",
                  color: active ? "#000000" : "#9ca3af",
                }}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>

        {showPeriodToggle ? (
          <TeamPagePeriodToggle
            teamCode={teamCode}
            year={year}
            subTab={activeSubTab}
            isWeekly={isWeekly}
            sort={sortParam}
            order={orderParam}
          />
        ) : null}

        {children}
      </main>
      <SiteFooter className="mt-12" />
    </div>
  )
}

function TeamPagePeriodToggle({
  teamCode,
  year,
  subTab,
  isWeekly,
  sort,
  order,
}: {
  teamCode: string
  year: TeamPageV1Year
  subTab: "batting" | "pitching"
  isWeekly: boolean
  sort?: string
  order?: "asc" | "desc"
}) {
  const seasonHref = teamPageHref({ teamCode, year, subTab, sort, order })
  const weeklyHref = teamPageWeeklyHubHref(teamCode, subTab, year, sort, order)

  const tabClass = (active: boolean) =>
    `flex flex-1 items-center justify-center px-2 py-1.5 text-center text-[11px] font-bold leading-tight transition-colors ${
      active ? "bg-[#FFFF44] text-black" : "bg-transparent text-gray-400 hover:text-[#ffff44]"
    }`

  return (
    <div
      className="relative isolate box-border mb-3 flex min-h-8 w-full max-w-xs shrink-0 items-stretch overflow-hidden"
      style={{ border: "1px solid #555", backgroundColor: "#1a1a1a" }}
      aria-label="通算と今週の切替"
    >
      <Link href={seasonHref} className={tabClass(!isWeekly)}>
        通算
      </Link>
      <Link href={weeklyHref} className={tabClass(isWeekly)}>
        今週
      </Link>
    </div>
  )
}
