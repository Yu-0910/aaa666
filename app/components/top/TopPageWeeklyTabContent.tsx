"use client"

import { useEffect, useState } from "react"
import type { TopPageLayoutMode } from "./topPageLayoutMode"
import type { TopWeeklyView } from "@/app/components/common/RankingBottomNav"
import type { RecentV2CardsPayload } from "@/lib/topPage/recentGamesV2Cards"
import type { RecentTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"
import { recentV2Href } from "@/lib/ranking/recentGamesV2Page"
import { BattingTopFourMetricsGrid } from "./BattingTopFourMetricsGrid"
import { TopPageModernLeaderRow } from "./TopPageModernLeaderRow"
import { topLeaderRowTypography, battingSeasonGridMetrics, battingTop2025SeasonTopN } from "@/lib/topPageBatting2025Grid"
import { recentGamesAreStale } from "@/lib/ranking/recentGamesFreshness"

export function TopPageWeeklyTabContent({ year, activeView, initialPayload }: {
  year: number; layout: TopPageLayoutMode; activeView: TopWeeklyView; initialPayload?: RecentTabPayload | null
}) {
  const league = activeView.startsWith("cl") ? "CL" : "PL"
  return <RecentCards key={league + year} league={league} year={year} initialData={initialPayload?.[league] ?? null} />
}

function isValidRecentPayload(payload: RecentV2CardsPayload | null | undefined, league: "CL" | "PL", year: number): payload is RecentV2CardsPayload {
  return !!payload
    && payload.schemaVersion === "recent-10-cards-v2"
    && payload.league === league
    && Array.isArray(payload.cards)
    && payload.cards.length === battingSeasonGridMetrics(year).length
    && battingSeasonGridMetrics(year).every((label, index) => payload.cards[index]?.label === label
      && payload.cards[index]?.limit === battingTop2025SeasonTopN(label, String(year))
      && Array.isArray(payload.cards[index]?.rows))
}

function RecentCards({ league, year, initialData }: { league: "CL" | "PL"; year: number; initialData?: RecentV2CardsPayload | null }) {
  const validInitialData = isValidRecentPayload(initialData, league, year) ? initialData : null
  const [data, setData] = useState<RecentV2CardsPayload | null>(validInitialData)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError(false)
    if (validInitialData && attempt === 0) {
      setData(validInitialData)
      return () => controller.abort()
    }
    setData(null)
    if (year !== 2026) return () => controller.abort()
    fetch(`/api/recent-games-v2/${league}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
      .then(async response => {
        if (!response.ok) throw new Error("Unavailable")
        const payload: RecentV2CardsPayload = await response.json()
        if (!isValidRecentPayload(payload, league, year)) throw new Error("Invalid data")
        if (!controller.signal.aborted) setData(payload)
      }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [league, year, attempt, validInitialData])

  if (year !== 2026) return <p className="py-8 text-sm">直近10試合は2026年のみ表示しています。</p>
  return <section aria-label="直近10試合打撃ランキング" className="space-y-1">
    <div className="flex items-center gap-2"><div style={{ width: 4, height: 32, backgroundColor: league === "CL" ? "#039850" : "#10b8ce" }} /><div><h2 className="text-sm font-medium">{league === "CL" ? "セ" : "パ"}・直近10試合 打撃ランキング</h2><p className="text-[10px] text-gray-400">{league === "CL" ? "Central" : "Pacific"} League / Last 10 Team Games</p></div></div>
    {error ? <div role="alert" className="rounded border border-[#444] p-4 text-sm">
      <p>直近10試合の成績データを取得できませんでした。</p>
      <button type="button" onClick={() => setAttempt(n => n + 1)} className="mt-2 text-[#ffff44] underline">再読み込み</button>
    </div> : !data ? <p role="status" className="py-8 text-sm">直近10試合を読み込み中...</p> : <>
      {recentGamesAreStale(data.generatedAt) && <p role="status" className="text-sm text-amber-300">更新から48時間以上経過しているか、更新日時が不正です。最新の成績ではない可能性があります。</p>}
      <BattingTopFourMetricsGrid year={year} isWeeklyTab={false}
        leaders={Object.fromEntries(data.cards.map(card => [card.label, card.rows]))}
        getRankingUrl={label => recentV2Href(league, data.cards.find(card => card.label === label)!.key)}
        getStatsListUrl={label => recentV2Href(league, data.cards.find(card => card.label === label)!.key)}
        emptyLabel="対象者なし"
        renderLeaderRow={({ leader, stat, index }) => <TopPageModernLeaderRow
          key={String(leader.playerId)} leader={leader} stat={stat} index={index}
          playerHref={typeof leader.href === "string" ? leader.href : null}
          modernLeaderRow={true} typography={topLeaderRowTypography(year, "batting", false)}
        />}
      />
    </>}
  </section>
}
