"use client"

import Link from "next/link"
import type { WeeklyTabWeekMeta } from "@/lib/topPage/fetchTopWeeklyLeadersClient"

const rankingLinkClass =
  "inline-flex items-center rounded border border-[#444] bg-[#141414] px-[7.2px] py-[1.8px] text-[9.9px] text-gray-400 hover:border-[#666] hover:text-[#ffff44] transition-colors focus-visible:outline focus-visible:outline-[#ffff44]"

type League = "CL" | "PL"
type Category = "batting" | "pitching"

const rankingCategories: Category[] = ["batting", "pitching"]

export function RecentGamesWeeklyLinks({ currentLeague, weekMeta }: {
  currentLeague: League
  weekMeta: WeeklyTabWeekMeta | null
}) {
  return <nav aria-label="ランキングページ" className="mb-4 space-y-2.5">
    <div className="space-y-1.5">
      <p className="text-xs text-gray-400">2026ランキング</p>
      <div className="flex flex-wrap gap-1.5">
        {rankingCategories.map(category =>
          <Link key={`season-${currentLeague}-${category}`} prefetch={false}
            href={`/ranking/${category === "pitching" ? "pitching/" : ""}2026/${currentLeague}`}
            className={rankingLinkClass}>
            {currentLeague === "CL" ? "セ" : "パ"}{category === "batting" ? "野手" : "投手"}
          </Link>)}
      </div>
    </div>
    <div className="space-y-1.5">
      <p className="text-xs text-gray-400">今週ランキング{weekMeta ? `（${weekMeta.weekLabel}）${weekMeta.isFallbackWeek ? " / 今週のデータ未確定のため直近の掲載週" : ""}` : ""}</p>
      {weekMeta ? <div className="flex flex-wrap gap-1.5">
      {rankingCategories.map(category =>
        <Link key={`${currentLeague}-${category}`} prefetch={false}
          href={`/ranking/${category === "pitching" ? "pitching/" : ""}weekly/2026/${weekMeta.weekKey}/${currentLeague}`}
          className={rankingLinkClass}>
          {currentLeague === "CL" ? "セ" : "パ"}{category === "batting" ? "野手" : "投手"}
        </Link>)}
      </div> : null}
    </div>
  </nav>
}
