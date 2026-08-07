// キャッシュを無効化して強制的に動的レンダリング
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * 動的ルート: /ranking/[year]/[league]
 * 第二セグメントは season（CL/PL/PRE_spring/PRE_fall 等）。R2 の data/rankings/{year}/{season}/ と一致。
 * Record.csvの全指標を順番通りに表示（CSVに存在する指標のみ）
 */

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { FullPageLoading } from '@/components/ui/spinner'
import RankingPageClient from './RankingPageClient'
import { loadMetricsFromRecord } from '@/lib/ranking/record'
import type { RankingViewModel } from '@/lib/ranking/types'

interface RankingPageProps {
  params: Promise<{
    year: string
    league: string
  }>
  searchParams: Promise<{
    metric?: string
  }>
}

export default async function RankingPage({ params, searchParams }: RankingPageProps) {
  const paramsResolved = await params
  const { year, league } = paramsResolved
  const { metric } = await searchParams
  
  // ルーティング到達ログ（devのみ、最小化）
  if (process.env.NODE_ENV === 'development') {
    console.log("[ROUTE_HIT] /ranking/[year]/[league]", { year, league, metric }, "CWD=", process.cwd())
  }

  // 年度と season（URL 第二セグメント）のバリデーション
  if (!year || !league) {
    notFound()
  }

  // season: 英数字＋アンダースコアのみ許可。R2 の data/rankings/{year}/{season}/ と一致させる
  const seasonRaw = league.trim()
  if (!seasonRaw || !/^[A-Za-z0-9_]+$/.test(seasonRaw)) {
    notFound()
  }

  // R2 上のキーは CL/PL が大文字、PRE_spring/PRE_fall はそのまま。取得用キーを統一
  const season =
    seasonRaw.toUpperCase() === 'CL' ? 'CL' : seasonRaw.toUpperCase() === 'PL' ? 'PL' : seasonRaw

  try {
    // 指標リストのみ取得（Record.csv順）。ランキングデータはClient側で指標ごとにJSONを取得（案A）
    const metrics = loadMetricsFromRecord()

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

    // 表示用ラベル（取得用キーは season のまま）
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
      title: `${seasonDisplayName}　打撃成績ランキング (${year}年)`,
      season: year,
      league: season,
      metrics,
      activeMetric: 'ops',
      rows: [], // Client側で指標ごとに loadRankingJson して取得
    }

    return (
      <Suspense fallback={<FullPageLoading />}>
        <RankingPageClient initialViewModel={viewModel} />
      </Suspense>
    )
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[RankingPage] error:', error)
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










