export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * 動的ルート: /ranking/pitching/[year]/[league]
 * 完成品は year=2026 のみ（それ以外は notFound）。
 */

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { FullPageLoading } from '@/components/ui/spinner'
import PitchingRankingPageClient from './PitchingRankingPageClient'
import { loadMetricsFromRecordPitching } from '@/lib/ranking/recordPitching'
import type { RankingViewModel } from '@/lib/ranking/types'

interface PitchingRankingPageProps {
  params: Promise<{
    year: string
    league: string
  }>
}

export default async function PitchingRankingPage({ params }: PitchingRankingPageProps) {
  const { year, league } = await params

  if (process.env.NODE_ENV === 'development') {
    console.log('[ROUTE_HIT] /ranking/pitching/[year]/[league]', { year, league })
  }

  if (!year || !league) {
    notFound()
  }

  if (year !== '2026') {
    notFound()
  }

  const seasonRaw = league.trim()
  if (!seasonRaw || !/^[A-Za-z0-9_]+$/.test(seasonRaw)) {
    notFound()
  }

  const season =
    seasonRaw.toUpperCase() === 'CL' ? 'CL' : seasonRaw.toUpperCase() === 'PL' ? 'PL' : seasonRaw

  try {
    const metrics = loadMetricsFromRecordPitching()

    if (metrics.length === 0) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">エラー</h1>
            <p className="text-gray-400">利用可能な指標が見つかりませんでした。</p>
          </div>
        </div>
      )
    }

    const seasonDisplayName =
      seasonRaw.toUpperCase() === 'CL'
        ? 'セ・リーグ'
        : seasonRaw.toUpperCase() === 'PL'
          ? 'パ・リーグ'
          : seasonRaw === 'PRE_spring'
            ? '春季リーグ'
            : seasonRaw === 'PRE_fall'
              ? '秋季リーグ'
              : seasonRaw

    const viewModel: RankingViewModel = {
      title: `${seasonDisplayName}　投球成績ランキング (${year}年)`,
      season: year,
      league: season,
      metrics,
      activeMetric: 'era',
      rows: [],
    }

    return (
      <Suspense fallback={<FullPageLoading />}>
        <PitchingRankingPageClient initialViewModel={viewModel} />
      </Suspense>
    )
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[PitchingRankingPage] error:', error)
      throw error
    }

    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">エラー</h1>
          <p className="text-gray-400 mb-2">
            {error instanceof Error ? error.message : 'データの読み込みに失敗しました'}
          </p>
        </div>
      </div>
    )
  }
}
