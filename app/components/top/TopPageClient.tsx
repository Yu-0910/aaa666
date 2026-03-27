"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import TopPageLeadersClient from "@/app/components/TopPageLeadersClient"
import ArticlesListClient from "@/app/components/ArticlesListClient"
import { TopPageMobileDrawer } from "@/app/components/top/TopPageMobileDrawer"
import { LeadersPanel, StandingsPanel, type TopPageLayoutMode } from "@/app/components/top/TopPagePanels"
import {
  mainTabs,
  subTabs,
  getDataForPanel,
  dummyArticles,
} from "@/app/components/top/topPageConstants"

export type TopPageClientProps = {
  layout: TopPageLayoutMode
  initialYear: number
  articlesMode: "rss" | "dummy"
}

export function TopPageClient({ layout, initialYear, articlesMode }: TopPageClientProps) {
  const isMobile = layout === "mobile"
  const isTop2025 = initialYear === 2025
  const [activeMainTab, setActiveMainTab] = useState(0)
  const [activeSubTab, setActiveSubTab] = useState(0)
  const [selectedYear, setSelectedYear] = useState(initialYear)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const router = useRouter()

  useEffect(() => {
    setSelectedYear(initialYear)
  }, [initialYear])

  const handleYearChange = (year: number) => {
    setSelectedYear(year)
    if (year === 2025) {
      router.push("/")
    } else {
      router.push(`/${year}`)
    }
  }

  const yearOptions = Array.from({ length: 77 }, (_, i) => 2026 - i)
  const rankingHref = `/ranking/${selectedYear}/PL`

  const mainTabButtons = (
    <div className={isMobile ? "grid grid-cols-5 gap-1 px-2 py-1 bg-black" : "max-w-6xl mx-auto grid grid-cols-5 gap-2 px-4 py-2 bg-black"}>
      {mainTabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => {
            setActiveMainTab(tab.id)
            if (tab.id === 0) setActiveSubTab(0)
          }}
          className={`relative overflow-hidden group transition-all duration-200 flex items-center justify-center ${
            activeMainTab === tab.id ? "bg-[#ffff44] text-black" : "bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]"
          } border border-[#555] ${isMobile ? "py-1.5 px-3 text-xs" : "py-2 px-3 text-sm"} font-semibold whitespace-nowrap`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )

  const subTabBar = (
    <div className={isMobile ? "grid grid-cols-4 gap-0" : "max-w-6xl mx-auto grid grid-cols-4 gap-1 px-4"}>
      {subTabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveSubTab(tab.id)}
          className={`${isMobile ? "py-3 text-xs" : "py-2.5 text-sm"} border border-[#555] transition-all duration-200 ease-in-out text-center flex items-center justify-center ${
            activeSubTab === tab.id
              ? "bg-[#ffff44] text-black font-semibold shadow-lg"
              : "bg-[#1a1a1a] text-white hover:bg-[#2a2a2a] hover:text-[#ffff44] " + (isMobile ? "hover:scale-105" : "")
          }`}
        >
          <span className="latin">{tab.label}</span>
        </button>
      ))}
    </div>
  )

  const tabContentInner = (
    <>
      {activeMainTab === 0 && (
        <div>
          {subTabs[activeSubTab].type === "combined" && (
            <div className="space-y-4">
              <TopPageLeadersClient
                year={selectedYear}
                league={subTabs[activeSubTab].league || "CL"}
                layout={layout}
              />
              <div>
                <LeadersPanel
                  title={`${subTabs[activeSubTab].league === "CL" ? "セ・リーグ" : "パ・リーグ"} 投球成績`}
                  leagueName={subTabs[activeSubTab].league === "CL" ? "Central League" : "Pacific League"}
                  leagueColor={subTabs[activeSubTab].league === "CL" ? "#039850" : "#10b8ce"}
                  data={getDataForPanel(subTabs[activeSubTab].league || "CL", "pitching")}
                  year={selectedYear}
                  league={subTabs[activeSubTab].league || "CL"}
                  layout={layout}
                />
              </div>
            </div>
          )}
          {subTabs[activeSubTab].type === "standings" && (
            <StandingsPanel
              league={subTabs[activeSubTab].league || "CL"}
              leagueColor={subTabs[activeSubTab].league === "CL" ? "#039850" : "#10b8ce"}
            />
          )}
        </div>
      )}
      {activeMainTab === 1 && <div className="text-white text-center py-8">今週の成績（準備中）</div>}
      {activeMainTab === 2 && <div className="text-white text-center py-8">予想投手（準備中）</div>}
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
      {activeMainTab === 4 && <div className="text-white text-center py-8">Quiz（準備中）</div>}
    </>
  )

  const contentPadding = activeMainTab === 0 && isMobile ? "pb-16" : ""

  return (
    <div className={`min-h-screen bg-black text-white ${isTop2025 ? "top-2025-font latin font-light" : ""}`}>
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
            <Link href="/" className="absolute left-1/2 -translate-x-1/2 hover:opacity-80 transition-opacity">
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
            <Link href="/" className="flex items-center gap-3 shrink-0 hover:opacity-90 transition-opacity">
              <Image src="/logo.png" alt="Short-Stop" width={36} height={36} className="object-contain" />
              <span className="text-[#ffff44] text-base font-bold tracking-tight">Short-Stop</span>
            </Link>
            <nav className="flex flex-1 flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm">
              <Link href="/" className="hover:text-[#ffff44] transition-colors">
                トップ
              </Link>
              <Link href={rankingHref} className="hover:text-[#ffff44] transition-colors">
                成績一覧
              </Link>
              <span className="text-gray-500 cursor-not-allowed">ドラフト情報</span>
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

      {mainTabButtons}

      {!isMobile && activeMainTab === 0 && (
        <div className="border-b border-[#555] bg-black/90">
          {subTabBar}
        </div>
      )}

      {isMobile && activeMainTab === 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-black border-t border-[#555] animate-in slide-in-from-bottom duration-300 backdrop-blur-sm bg-opacity-95">
          {subTabBar}
        </div>
      )}

      <div className={`${isMobile ? "container mx-auto px-2 py-2" : "max-w-6xl mx-auto px-4 py-4"} ${contentPadding}`}>
        <div className="animate-in fade-in duration-300">{tabContentInner}</div>
      </div>
    </div>
  )
}
