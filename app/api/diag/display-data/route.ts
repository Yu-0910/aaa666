/**
 * 本番で 2026 が 2025 に見えるときの切り分け用（管理者向け）
 * GET /api/diag/display-data
 */

import { NextResponse } from 'next/server'
import { allowBatting2025Fallback } from '@/lib/ranking/allowBatting2025Fallback'
import { getExternalDisplayDataUrl } from '@/lib/displayData/externalUrl'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function probe(url: string): Promise<{
  url: string
  ok: boolean
  status: number | null
  topOps?: number | null
  topHr?: number | null
  error?: string
}> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) {
      return { url, ok: false, status: res.status }
    }
    const raw = (await res.json()) as unknown
    if (Array.isArray(raw) && raw[0] && typeof raw[0] === 'object') {
      const row = raw[0] as Record<string, unknown>
      return {
        url,
        ok: true,
        status: res.status,
        topOps: typeof row.ops === 'number' ? row.ops : null,
        topHr: typeof row.hr === 'number' ? row.hr : null,
      }
    }
    return { url, ok: true, status: res.status }
  } catch (e) {
    return {
      url,
      ok: false,
      status: null,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function GET() {
  const base = process.env.RANKINGS_BASE_URL?.trim() || null
  const nextPublic = process.env.NEXT_PUBLIC_RANKINGS_BASE_URL?.trim() || null
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim()
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  const r2Ops2026 = base
    ? getExternalDisplayDataUrl('data/rankings/2026/CL/OPS.json')
    : null
  const r2Ops2025 = base
    ? getExternalDisplayDataUrl('data/rankings/2025/PL/OPS.json')
    : null
  const proxyOps2026 = origin ? `${origin.replace(/\/+$/, '')}/data/rankings/2026/CL/OPS.json` : null

  const [r2_2026, r2_2025, proxy_2026] = await Promise.all([
    r2Ops2026 ? probe(r2Ops2026) : Promise.resolve(null),
    r2Ops2025 ? probe(r2Ops2025) : Promise.resolve(null),
    proxyOps2026 ? probe(proxyOps2026) : Promise.resolve(null),
  ])

  const diagnosis: string[] = []
  if (!base) {
    diagnosis.push(
      'RANKINGS_BASE_URL が未設定です。Vercel の Production に設定し Redeploy してください。'
    )
  }
  if (!nextPublic) {
    diagnosis.push(
      'NEXT_PUBLIC_RANKINGS_BASE_URL が未設定です。ブラウザが R2 直読みできません（サーバーと同じ URL を設定）。'
    )
  }
  if (r2_2026 && !r2_2026.ok) {
    diagnosis.push('R2 に 2026/CL/OPS.json がありません。npm run display:r2:upload:2026 を実行。')
  }
  if (r2_2026?.ok && r2_2026.topHr != null && r2_2026.topHr > 20) {
    diagnosis.push(
      `R2 の 2026 OPS 先頭の本塁打が ${r2_2026.topHr} 本です。2025 シーズン終了時の値の可能性があります。`
    )
  }
  if (r2_2026?.ok && r2_2026.topHr != null && r2_2026.topHr <= 20 && proxy_2026 && !proxy_2026.ok) {
    diagnosis.push(
      'R2 には 2026 がありますが /data プロキシが 404 です。env 設定後に Redeploy が必要です。'
    )
  }
  if (allowBatting2025Fallback()) {
    diagnosis.push(
      '2025 フォールバックが有効です（開発環境のみ想定）。本番で 2025 が混ざる原因になります。'
    )
  }

  return NextResponse.json({
    env: {
      hasRankingsBaseUrl: Boolean(base),
      hasNextPublicRankingsBaseUrl: Boolean(nextPublic),
      vercel: Boolean(process.env.VERCEL),
      nodeEnv: process.env.NODE_ENV,
      allowBatting2025Fallback: allowBatting2025Fallback(),
    },
    probes: { r2_2026, r2_2025, proxy_2026 },
    diagnosis,
    hint: {
      expected2026TopHrMax: 'おおよそ 15 本以下（5月時点）',
      expected2025TopHr: '40 本前後（佐藤輝明）',
    },
  })
}
