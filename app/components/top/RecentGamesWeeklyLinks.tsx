"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { fetchCurrentWeekMeta, type WeeklyTabWeekMeta } from "@/lib/topPage/fetchTopWeeklyLeadersClient"

const rankingLinkClass =
  "inline-flex items-center rounded border border-[#444] bg-[#141414] px-[7.2px] py-[1.8px] text-[9.9px] text-gray-400 hover:border-[#666] hover:text-[#ffff44] transition-colors focus-visible:outline focus-visible:outline-[#ffff44]"

type League = "CL" | "PL"
type Category = "batting" | "pitching"

const rankingLeagues: League[] = ["CL", "PL"]
const rankingCategories: Category[] = ["batting", "pitching"]

export function RecentGamesWeeklyLinks() {
  const [meta, setMeta] = useState<WeeklyTabWeekMeta | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetchCurrentWeekMeta(2026).then(value => {
      if (!/^2026-\d{2}-\d{2}$/.test(value.weekKey) || !Number.isFinite(Date.parse(value.weekKey))) throw new Error("Invalid week")
      if (!cancelled) setMeta(value)
    }).catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [])
  return <nav aria-label="ランキングページ" className="mb-4 space-y-2.5">
    <div className="space-y-1.5">
      <p className="text-xs text-gray-400">2026ランキング</p>
      <div className="flex flex-wrap gap-1.5">
        {rankingLeagues.flatMap(league => rankingCategories.map(category =>
          <Link key={`season-${league}-${category}`} prefetch={false}
            href={`/ranking/${category === "pitching" ? "pitching/" : ""}2026/${league}`}
            className={rankingLinkClass}>
            {league === "CL" ? "セ" : "パ"}{category === "batting" ? "野手" : "投手"}
          </Link>))}
      </div>
    </div>
    <div className="space-y-1.5">
      <p className="text-xs text-gray-400">今週ランキング{meta ? `（${meta.weekLabel}）${meta.isFallbackWeek ? " / 今週のデータ未確定のため直近の掲載週" : ""}` : ""}</p>
      {error ? <p role="status" className="text-xs text-gray-400">週間リンクを取得できませんでした。ページを再読み込みしてください。</p> : !meta ? <p role="status" className="text-xs text-gray-400">対象週を読み込み中...</p> : <div className="flex flex-wrap gap-1.5">
      {rankingLeagues.flatMap(league => rankingCategories.map(category =>
        <Link key={`${league}-${category}`} prefetch={false}
          href={`/ranking/${category === "pitching" ? "pitching/" : ""}weekly/2026/${meta.weekKey}/${league}`}
          className={rankingLinkClass}>
          {league === "CL" ? "セ" : "パ"}{category === "batting" ? "野手" : "投手"}
        </Link>))}
      </div>}
    </div>
  </nav>
}
