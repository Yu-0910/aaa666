"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { BarChart3, Gauge, Table2 } from "lucide-react"
import { useClientPathname, useClientSearchString } from "@/hooks/useIsDesktop"
import { SITE_TOP_HREF } from "@/lib/siteNavigation"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"
import { weekLabelForKey } from "@/lib/ranking/weeklyRankingsWeekKeys"
import { TEAM_PAGE_V1_YEARS } from "@/lib/teamPage/teamPageConstants"
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

const TEAM_PAGE_BOTTOM_NAV_ITEMS = [
  { id: "season-batting", first: "通算", second: "打撃", subTab: "batting", period: "season", icon: BarChart3 },
  { id: "weekly-batting", first: "今週", second: "打撃", subTab: "batting", period: "weekly", icon: BarChart3 },
  { id: "season-pitching", first: "通算", second: "投球", subTab: "pitching", period: "season", icon: Gauge },
  { id: "weekly-pitching", first: "今週", second: "投球", subTab: "pitching", period: "weekly", icon: Gauge },
  { id: "catchers", first: "捕手", second: "成績", subTab: "catchers", period: "season", icon: Table2 },
] as const

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
    <div className="min-h-screen bg-black pb-28 text-white">
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

        {children}
      </main>
      <SiteFooter className="mt-12" />
      <TeamPageBottomNav
        teamCode={teamCode}
        year={year}
        activeSubTab={activeSubTab}
        isWeekly={isWeekly}
        weekKey={weekKey}
        sort={sortParam}
        order={orderParam}
      />
    </div>
  )
}

function TeamPageBottomNav({
  teamCode,
  year,
  activeSubTab,
  isWeekly,
  weekKey,
  sort,
  order,
}: {
  teamCode: string
  year: TeamPageV1Year
  activeSubTab: "batting" | "pitching" | "catchers"
  isWeekly: boolean
  weekKey: string | null
  sort?: string
  order?: "asc" | "desc"
}) {
  const hrefForItem = (item: (typeof TEAM_PAGE_BOTTOM_NAV_ITEMS)[number]) => {
    const preserveSort = item.subTab === activeSubTab ? sort : undefined
    const preserveOrder = item.subTab === activeSubTab ? order : undefined
    if (item.period === "weekly" && isTeamPageRankingSubTab(item.subTab)) {
      if (isWeekly && weekKey && item.subTab === activeSubTab) {
        return teamPageHref({
          teamCode,
          year,
          subTab: item.subTab,
          weekKey,
          sort: preserveSort,
          order: preserveOrder,
        })
      }
      return teamPageWeeklyHubHref(teamCode, item.subTab, year, preserveSort, preserveOrder)
    }
    return teamPageHref({
      teamCode,
      year,
      subTab: item.subTab,
      sort: preserveSort,
      order: preserveOrder,
    })
  }

  const isActive = (item: (typeof TEAM_PAGE_BOTTOM_NAV_ITEMS)[number]) => {
    if (item.subTab !== activeSubTab) return false
    if (item.subTab === "catchers") return true
    return item.period === "weekly" ? isWeekly : !isWeekly
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[320] px-3 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-2"
      aria-label="チームページ表示切替"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 rounded-full border border-white/35 bg-white/20 p-1 shadow-[0_4px_14px_rgba(0,0,0,0.08)] backdrop-blur-md">
        {TEAM_PAGE_BOTTOM_NAV_ITEMS.map((item) => {
          const active = isActive(item)
          const Icon = item.icon
          return (
            <Link
              key={item.id}
              href={hrefForItem(item)}
              className={`flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-full px-1 text-center text-[11px] font-bold leading-none transition-colors ${
                active
                  ? "bg-white/25 text-[#ffff44]"
                  : "bg-transparent text-white/90 hover:text-white"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="flex flex-col items-center whitespace-nowrap">
                <span>{item.first}</span>
                <span>{item.second}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
