"use client"

import { useRouter } from "next/navigation"
import RankingUI from "@/components/RankingUI"
import { RecentGamesWeeklyLinks } from "@/app/components/top/RecentGamesWeeklyLinks"
import { recentV2Href, recentV2NextOrder } from "@/lib/ranking/recentGamesV2Page"
import { rankRecentV2, type V2Snapshot } from "@/lib/ranking/recentGamesV2"
import { formatRankingStatDisplay } from "@/lib/formatStat"
import type { WeeklyTabWeekMeta } from "@/lib/topPage/fetchTopWeeklyLeadersClient"
import type { MetricDefinition, RankingRow } from "@/lib/ranking/types"

export default function RecentGamesRankingClient({ snapshot, metrics, league, sort, order, weekMeta }: {
  snapshot: V2Snapshot | null
  metrics: MetricDefinition[]
  league: "CL" | "PL"
  sort: string
  order: "asc" | "desc"
  weekMeta: WeeklyTabWeekMeta | null
}) {
  const router = useRouter()
  const rows: RankingRow[] = snapshot ? rankRecentV2(snapshot.rows, sort, order).map(row => ({
    ...row.values, playerId: row.playerId, npbPlayerId: row.npbPlayerId,
    name: row.name, romanName: row.romanName ?? undefined, team: row.team,
    rank: row.rank, valueText: formatRankingStatDisplay(metrics.find(m => m.key === sort)?.label ?? sort, row.values[sort]),
  })) : []
  const title = `${league === "CL" ? "セ・リーグ" : "パ・リーグ"}　直近10試合 ${metrics.find(m => m.key === sort)?.label ?? sort}ランキング (2026年)`
  return <RankingUI
    allowActiveMetricToggle
    viewModel={{ title, season: "2026", league, metrics, activeMetric: sort, rows }}
    sortedRows={rows} sortKey={sort} order={order}
    onSortChange={key => router.replace(recentV2Href(league, key, recentV2NextOrder(key, sort, order)), { scroll: false })}
    yearOptions={[2026]} onYearChange={() => {}}
    titleOverride={title}
    beforeTitle={<RecentGamesWeeklyLinks weekMeta={weekMeta} />}
    formatMetricValue={formatRankingStatDisplay}
    beforeTable={<>
      {snapshot ? (!rows.length && <p role="status" className="mb-2 text-sm text-gray-400">{snapshot.rows.length ? "この指標の掲載条件を満たす選手がいません。" : "この期間の打撃成績はまだありません。"}</p>) : <div role="alert" className="mb-3 rounded border border-[#555] p-4 text-sm">
        <p>直近10試合の成績データを読み込めませんでした。</p>
        <button type="button" onClick={() => router.refresh()} className="mt-2 text-[#ffff44] underline">再読み込み</button>
      </div>}
    </>}
  />
}
