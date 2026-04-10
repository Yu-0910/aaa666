/**
 * 投手ランキング用クライアント（打撃 RankingPageClient をベースに差し替え）
 */

'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { useClientSearchString } from '@/hooks/useIsDesktop'
import RankingUI from '@/components/RankingUI'
import type { RankingViewModel, RankingRow } from '@/lib/ranking/types'
import { loadPitchingRankingJson } from '@/lib/ranking/jsonLoader'
import {
  shouldRequireQualifyingPitching,
  computePitchingQualifyingMinIpByTeam,
  rowMeetsPitchingQualifyingIp,
  getPitchingQualifyingUiNote,
} from '@/lib/ranking/qualifyingPitching'
import { getPitchingSortOrderForKey } from '@/lib/ranking/pitchingSortOrder'
import { lookupRomanInMap } from '@/lib/ranking/romanNameLookup'
import { FullPageLoading } from '@/components/ui/spinner'

interface PitchingRankingPageClientProps {
  initialViewModel: RankingViewModel
}


function normalizeRankingRow(raw: Record<string, unknown>): RankingRow {
  const romanNameRaw = (
    raw['romanName'] ??
    raw['roman_name'] ??
    raw['RomanName'] ??
    raw['name_en'] ??
    raw['player_name_en'] ??
    ''
  ) as string
  const romanName =
    typeof romanNameRaw === 'string' && romanNameRaw.trim() !== '' ? romanNameRaw.trim() : undefined
  const name = String(
    raw['name'] ??
      raw['player'] ??
      raw['player_name_ja'] ??
      raw['選手名'] ??
      raw['名前'] ??
      raw['Name'] ??
      ''
  ).trim()
  return {
    ...raw,
    rank: raw['rank'] as number,
    playerId: String(raw['playerId'] ?? raw['player_id'] ?? raw['id'] ?? ''),
    name: name || '不明',
    romanName,
    team: String(raw['team'] ?? raw['Team'] ?? raw['チーム'] ?? raw['team_name'] ?? ''),
  } as RankingRow
}

async function mergeRomanNamesFromCsv(
  rows: RankingRow[],
  season: string,
  league: string
): Promise<RankingRow[]> {
  const baseUrl = typeof window === 'undefined' ? '' : window.location.origin
  const url = `${baseUrl}/api/roman-names/${season}/${league}`
  let map: Record<string, string> = {}
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) map = (await res.json()) as Record<string, string>
  } catch {
    return rows
  }
  return rows.map((row) => {
    if (row.romanName && row.romanName.trim()) return row
    const en = lookupRomanInMap(map, row.name, row.team)
    if (!en) return row
    return { ...row, romanName: en }
  })
}

export default function PitchingRankingPageClient({ initialViewModel }: PitchingRankingPageClientProps) {
  const router = useRouter()
  const clientSearch = useClientSearchString()
  const { sortKey, order } = useMemo(() => {
    const q = clientSearch.replace(/^\?/, '')
    const sp = new URLSearchParams(q)
    const sk = sp.get('sort') || 'era'
    const ord = (sp.get('order') as 'asc' | 'desc') || getPitchingSortOrderForKey(sk)
    return { sortKey: sk, order: ord }
  }, [clientSearch])

  const [rowsFromJson, setRowsFromJson] = useState<RankingRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fetchSettled, setFetchSettled] = useState(false)

  const metricDef = initialViewModel.metrics.find((m) => m.key === sortKey)

  useEffect(() => {
    if (!metricDef) {
      setRowsFromJson([])
      setLoadError(null)
      setFetchSettled(true)
      return
    }
    let cancelled = false
    setLoadError(null)
    setFetchSettled(false)
    loadPitchingRankingJson(
      initialViewModel.season,
      initialViewModel.league,
      metricDef.label,
      !shouldRequireQualifyingPitching(metricDef.key)
    )
      .then((data: unknown) => {
        if (cancelled) return
        const rawRows = Array.isArray(data) ? data : (data as { rows?: unknown[] })?.rows ?? []
        const rows: RankingRow[] = (rawRows as Record<string, unknown>[]).map(normalizeRankingRow)
        return mergeRomanNamesFromCsv(rows, initialViewModel.season, initialViewModel.league)
      })
      .then((rows) => {
        if (cancelled || rows == null) return
        setRowsFromJson(rows)
        setLoadError(null)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setLoadError(
          e.message?.includes('404')
            ? '2026年の投手ランキングデータが見つかりません（JSON 未配置の可能性）。npm run phase19:build:pitching-rankings を実行してください。'
            : e.message || 'データの読み込みに失敗しました'
        )
        setRowsFromJson([])
      })
      .finally(() => {
        if (!cancelled) setFetchSettled(true)
      })
    return () => {
      cancelled = true
    }
  }, [initialViewModel.season, initialViewModel.league, sortKey, metricDef?.label])

  const pitchingQualifyingThresholds = useMemo(
    () => computePitchingQualifyingMinIpByTeam(rowsFromJson),
    [rowsFromJson]
  )

  const sortedRows = useMemo(() => {
    const rows = rowsFromJson
    const metric = initialViewModel.metrics.find((m) => m.key === sortKey)
    if (!metric) return rows

    const requiresQ = shouldRequireQualifyingPitching(metric.key)
    const canApply =
      requiresQ &&
      rows.length > 0 &&
      pitchingQualifyingThresholds.fallbackMinIp > 0

    let filteredRows = rows
    if (canApply) {
      filteredRows = rows.filter((row) => rowMeetsPitchingQualifyingIp(row, pitchingQualifyingThresholds))
    }

    const sorted = [...filteredRows].sort((a, b) => {
      const aValue = a[metric.key]
      const bValue = b[metric.key]
      if (aValue === null || aValue === undefined) return 1
      if (bValue === null || bValue === undefined) return -1
      if (isNaN(Number(aValue))) return 1
      if (isNaN(Number(bValue))) return -1
      if (order === 'asc') {
        return Number(aValue) - Number(bValue)
      }
      return Number(bValue) - Number(aValue)
    })

    return sorted.map((row, index) => ({
      ...row,
      rank: index + 1,
    }))
  }, [
    rowsFromJson,
    initialViewModel.metrics,
    sortKey,
    order,
    pitchingQualifyingThresholds,
  ])

  const handleSortChange = (metricKey: string) => {
    const currentSort = sortKey
    const currentOrder = order
    let newOrder: 'asc' | 'desc'
    if (currentSort === metricKey) {
      newOrder = currentOrder === 'asc' ? 'desc' : 'asc'
    } else {
      newOrder = getPitchingSortOrderForKey(metricKey)
    }
    router.replace(
      `/ranking/pitching/${initialViewModel.season}/${initialViewModel.league}?sort=${encodeURIComponent(metricKey)}&order=${newOrder}`
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center max-w-lg">
          <h1 className="text-2xl font-bold mb-4">エラー</h1>
          <p className="text-gray-400 text-sm leading-relaxed">{loadError}</p>
          <p className="text-gray-600 text-xs mt-4">
            投手ランキングは 2026 年のみ掲載し、2025 年への自動フォールバックは行いません。
          </p>
        </div>
      </div>
    )
  }

  if (metricDef && !fetchSettled) {
    return <FullPageLoading />
  }

  const emptyAfterFilter =
    fetchSettled &&
    rowsFromJson.length > 0 &&
    sortedRows.length === 0 &&
    shouldRequireQualifyingPitching(sortKey)

  const emptyNoData = fetchSettled && rowsFromJson.length === 0 && !!metricDef

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {!loadError && emptyNoData && (
        <div className="border-b border-amber-900/50 bg-amber-950/40 px-3 py-2 text-center text-xs sm:text-sm text-amber-100/90">
          この指標のランキングデータがまだありません。public/data/rankings/pitching/2026/
          {initialViewModel.league}/ に JSON を配置するか、npm run phase19:build:pitching-rankings を実行してください。
        </div>
      )}
      {!loadError && emptyAfterFilter && (
        <div className="border-b border-[#444] bg-[#141414] px-3 py-2 text-center text-xs sm:text-sm text-gray-400">
          規定投球回を満たす選手がいません。別の指標を選ぶか、データ範囲を広げてください。
        </div>
      )}
      <RankingUI
        viewModel={{ ...initialViewModel, rows: rowsFromJson }}
        sortedRows={sortedRows}
        sortKey={sortKey}
        order={order}
        onSortChange={handleSortChange}
        rankingPathBase="/ranking/pitching"
        metricLabelFallback="投球成績"
        yearOptions={[2026]}
        titleSubNote={
          shouldRequireQualifyingPitching(sortKey) ? getPitchingQualifyingUiNote() : undefined
        }
      />
    </div>
  )
}
