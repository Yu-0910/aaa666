"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import ArticlesListClient from "@/app/components/ArticlesListClient"
import { TopPageMobileDrawer } from "@/app/components/top/TopPageMobileDrawer"
import { SITE_TOP_HREF } from "@/lib/siteNavigation"
import { type TopPageLayoutMode } from "@/app/components/top/TopPagePanels"
import { mainTabs, dummyArticles } from "@/app/components/top/topPageConstants"
import { type TopPageTabId } from "@/app/components/top/topPageRouteConfig"
import { usesTopBattingModernLayout } from "@/lib/topPageBatting2025Grid"
import { TopPageSeasonTabContent } from "@/app/components/top/TopPageSeasonTabContent"
import { TopPageWeeklyTabContent } from "@/app/components/top/TopPageWeeklyTabContent"
import { TopPageStandingsTab } from "@/app/components/top/TopPageStandingsTab"
import { TopPageProbablesTab } from "@/app/components/top/TopPageProbablesTab"
import { TopPageInstallButton } from "@/app/components/top/TopPageInstallButton"
import SiteFooter from "@/app/components/common/SiteFooter"
import RankingBottomNav, {
  type TopSeasonStatView,
  type TopStandingsView,
  type TopWeeklyView,
} from "@/app/components/common/RankingBottomNav"
import type { SeasonTabPayload, WeeklyTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"

export type TopPageClientProps = {
  layout: TopPageLayoutMode
  initialYear: number
  articlesMode: "rss" | "dummy"
  activeMainTab: TopPageTabId
  /** 2026 など: サーバーで読んだ TOP タブ用データ */
  seasonInitial?: SeasonTabPayload | null
  /** 2026: サーバーで読んだ今週タブ用データ */
  weeklyInitial?: WeeklyTabPayload | null
}

export function TopPageClient({
  layout,
  initialYear,
  articlesMode,
  activeMainTab,
  seasonInitial = null,
  weeklyInitial = null,
}: TopPageClientProps) {
  const isMobile = layout === "mobile"
  const [selectedYear, setSelectedYear] = useState(initialYear)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [topSeasonView, setTopSeasonView] = useState<TopSeasonStatView>("cl-batting")
  const [topWeeklyView, setTopWeeklyView] = useState<TopWeeklyView>("cl-batting")
  const [standingsView, setStandingsView] = useState<TopStandingsView>("cl-season")
  const isWeeklyMainTab = activeMainTab === 1
  const isTopBattingModernPage = usesTopBattingModernLayout(selectedYear, isWeeklyMainTab)

  const router = useRouter()

  useEffect(() => {
    setSelectedYear(initialYear)
  }, [initialYear])

  useEffect(() => {
    if (selectedYear >= 2026) return
    if (!standingsView.endsWith("weekly")) return
    setStandingsView("cl-season")
  }, [selectedYear, standingsView])

  const routeHrefForYear = (tabId: TopPageTabId, year: number): string => {
    if (tabId === 0) return year === 2026 ? "/" : `/${year}`
    if (tabId === 4) return year === 2026 ? "/standings" : `/standings/${year}`
    return mainTabs.find((tab) => tab.tabId === tabId)?.href ?? "/"
  }

  const handleYearChange = (year: number) => {
    setSelectedYear(year)
    router.push(routeHrefForYear(activeMainTab, year))
  }

  const yearOptions = Array.from({ length: 77 }, (_, i) => 2026 - i)
  const rankingHref = `/ranking/${selectedYear}/PL`
  const pitchingRankingHref = `/ranking/pitching/2026/PL`
  const visibleMainTabs =
    selectedYear >= 2026
      ? mainTabs
      : mainTabs.filter((tab) => tab.tabId === 0 || tab.tabId === 4)

  const mainTabButtons = (
    <div
      className={
        isMobile
          ? `grid ${selectedYear >= 2026 ? "grid-cols-5" : "grid-cols-2"} gap-1 px-2 py-1 bg-[#111111]`
          : `max-w-6xl mx-auto grid ${selectedYear >= 2026 ? "grid-cols-5" : "grid-cols-2"} gap-2 px-4 py-2 bg-[#111111]`
      }
    >
      {visibleMainTabs.map((tab) => (
        <Link
          key={tab.tabId}
          href={routeHrefForYear(tab.tabId, selectedYear)}
          className={`relative overflow-hidden rounded group transition-all duration-200 flex items-center justify-center ${
            activeMainTab === tab.tabId ? "bg-[#ffff44] text-black" : "bg-[#242424] text-white hover:bg-[#303030]"
          } border border-[#555] ${isMobile ? "py-1.5 px-3 text-xs" : "py-2 px-3 text-sm"} font-semibold whitespace-nowrap`}
          aria-current={activeMainTab === tab.tabId ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )

  const prefetchSeasonTab = activeMainTab === 0 && selectedYear === 2026 && seasonInitial != null
  const prefetchWeeklyTab = activeMainTab === 1 && selectedYear === 2026 && weeklyInitial != null

  const tabContentInner = (
    <>
      {activeMainTab === 0 && (
        <div>
          <TopPageSeasonTabContent
            year={selectedYear}
            layout={layout}
            initialPayload={prefetchSeasonTab ? seasonInitial : undefined}
            activeView={topSeasonView}
          />
        </div>
      )}
      {activeMainTab === 1 && (
        <div>
          <TopPageWeeklyTabContent
            year={selectedYear}
            layout={layout}
            initialPayload={prefetchWeeklyTab ? weeklyInitial : undefined}
            activeView={topWeeklyView}
          />
        </div>
      )}
      {activeMainTab === 2 && <TopPageProbablesTab year={selectedYear} layout={layout} />}
      {activeMainTab === 3 &&
        (articlesMode === "rss" ? (
          <ArticlesListClient />
        ) : (
          <div className="space-y-2">
            {dummyArticles.map((article) => (
              <Link
                key={article.id}
                href={`/articles/${article.id}`}
                className="flex gap-2 bg-black border border-[#333] p-1.5 hover:bg-[#2a2a2a] transition-colors"
              >
                <img src={article.image || "/placeholder.svg"} alt={article.title} className="w-20 h-16 object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-white text-sm font-semibold line-clamp-2 mb-0.5">{article.title}</h3>
                  <div className="flex items-center gap-2 text-[10px] text-[#999]">
                    <span className="latin">{article.date}</span>
                    <span>|</span>
                    <span>{article.source}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ))}
      {activeMainTab === 4 && (
        <TopPageStandingsTab year={selectedYear} layout={layout} activeView={standingsView} />
      )}
    </>
  )

  return (
    <div className={`min-h-screen bg-black text-white ${activeMainTab === 0 || activeMainTab === 1 || activeMainTab === 4 ? "pb-24 md:pb-0" : ""} ${isTopBattingModernPage ? "top-2025-font latin font-light" : ""}`}>
      {isMobile ? (
        <header className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-[#333] py-1 px-3">
          <div className="flex items-center justify-between relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="p-1 hover:bg-[#2a2a2a] rounded transition-colors"
              aria-label="メニューを開く"
            >
              <div className="w-5 h-4 flex flex-col justify-between">
                <span className="block w-full h-0.5 bg-[#ffff44]" />
                <span className="block w-full h-0.5 bg-[#ffff44]" />
                <span className="block w-full h-0.5 bg-[#ffff44]" />
              </div>
            </button>
            <Link href={SITE_TOP_HREF} className="absolute left-1/2 -translate-x-1/2 hover:opacity-80 transition-opacity">
              <Image src="/logo.png" alt="Short-Stop" width={28} height={28} className="object-contain" />
            </Link>
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              className="bg-[#1a1a1a] text-[#ffff44] border border-[#555] rounded px-2 py-0.5 text-sm bebas cursor-pointer hover:bg-[#2a2a2a] transition-colors"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-[#333]">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
            <Link href={SITE_TOP_HREF} className="flex items-center gap-3 shrink-0 hover:opacity-90 transition-opacity">
              <Image src="/logo.png" alt="Short-Stop" width={36} height={36} className="object-contain" />
              <span className="text-[#ffff44] text-base font-bold tracking-tight">Short-Stop</span>
            </Link>
            <nav className="flex flex-1 flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm">
              <Link href="/" className="hover:text-[#ffff44] transition-colors">
                トップ
              </Link>
              <Link href={rankingHref} className="hover:text-[#ffff44] transition-colors">
                打撃ランキング
              </Link>
              <Link href={pitchingRankingHref} className="hover:text-[#ffff44] transition-colors">
                投手ランキング
              </Link>
              <span className="text-gray-500 cursor-not-allowed">
                ドラフト情報
              </span>
            </nav>
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              className="bg-[#1a1a1a] text-[#ffff44] border border-[#555] rounded px-3 py-1 text-sm bebas cursor-pointer hover:bg-[#2a2a2a] transition-colors shrink-0"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </header>
      )}

      {isMobile && <TopPageMobileDrawer open={isMenuOpen} onClose={() => setIsMenuOpen(false)} selectedYear={selectedYear} />}

      {activeMainTab === 0 && <TopPageInstallButton layout={layout} />}
      {mainTabButtons}

      <div className={isMobile ? "container mx-auto min-w-0 px-2 py-2" : "max-w-6xl mx-auto min-w-0 px-4 py-4"}>
        <div className="min-w-0">{tabContentInner}</div>
      </div>
      {activeMainTab === 0 && (
        <RankingBottomNav activeView={topSeasonView} onViewChange={setTopSeasonView} />
      )}
      {activeMainTab === 1 && (
        <RankingBottomNav mode="weekly" activeView={topWeeklyView} onViewChange={setTopWeeklyView} />
      )}
      {activeMainTab === 4 && (
        <RankingBottomNav mode="standings" year={selectedYear} activeView={standingsView} onViewChange={setStandingsView} />
      )}
      <SiteFooter className="mt-12" />
    </div>
  )
}
