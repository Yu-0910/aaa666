/**
 * 表示用 JSON プロキシ（Phase 6）
 * /data/rankings/* / /data/top-leaders/* / /data/standings/* / /data/top-probables/* を RANKINGS_BASE_URL 配下へ転送
 */

import { handleDisplayDataGet, type DisplayDataKind } from '@/lib/displayData/proxy'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const KINDS: DisplayDataKind[] = ['rankings', 'top-leaders', 'standings', 'top-probables']

function parseKind(pathSegments: string[]): { kind: DisplayDataKind; rest: string[] } | null {
  const head = pathSegments[0]
  if (head === 'rankings' || head === 'top-leaders' || head === 'standings' || head === 'top-probables') {
    return { kind: head, rest: pathSegments.slice(1) }
  }
  return null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> | { path: string[] } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const pathSegments = resolvedParams.path || []
    const parsed = parseKind(pathSegments)
    if (!parsed) {
      return NextResponse.json(
        { error: `Unknown data root. Use one of: ${KINDS.join(', ')}` },
        { status: 404 }
      )
    }
    return handleDisplayDataGet(parsed.kind, parsed.rest, request)
  } catch (error) {
    console.error('[DisplayDataProxy]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
