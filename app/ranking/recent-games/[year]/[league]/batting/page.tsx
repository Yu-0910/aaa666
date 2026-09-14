import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { loadRecentGamesV2 } from "@/lib/ranking/loadRecentGamesV2"
import { recentV2Query } from "@/lib/ranking/recentGamesV2Page"
import type { V2Snapshot } from "@/lib/ranking/recentGamesV2"
import { loadMetricsFromRecord } from "@/lib/ranking/record"
import RecentGamesRankingClient from "../../../RecentGamesRankingClient"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "直近10試合 打撃ランキング | Short-Stop" }

type Props = {
  params: Promise<{ year: string; league: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function RecentGamesRankingPage({ params, searchParams }: Props) {
  const { year, league: rawLeague } = await params
  const league = rawLeague.toUpperCase()
  if (year !== "2026" || league !== "CL" && league !== "PL") notFound()
  const metrics = loadMetricsFromRecord()
  const { sort, order } = recentV2Query(await searchParams, metrics)
  let snapshot: V2Snapshot | null = null
  try { snapshot = await loadRecentGamesV2(league, metrics.map(({ key, label }) => ({ key, label }))) }
  catch (error) { console.error("[recent-games-ranking]", error instanceof Error ? error.message : "Data load failed") }
  return <RecentGamesRankingClient snapshot={snapshot} metrics={metrics} league={league} sort={sort} order={order} />
}
