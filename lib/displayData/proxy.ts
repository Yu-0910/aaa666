import { NextResponse } from 'next/server'
import { allowBatting2025Fallback } from '@/lib/ranking/allowBatting2025Fallback'
import { getExternalDisplayDataUrl } from '@/lib/displayData/externalUrl'
import { getRankingsBaseUrl } from '@/lib/displayData/rankingsBaseUrl'

export type DisplayDataKind = 'rankings' | 'top-leaders'

const CACHE =
  'public, max-age=300, s-maxage=300, stale-while-revalidate=600'

function jsonResponseWithCache(data: unknown): NextResponse {
  const headers = new Headers()
  headers.set('Cache-Control', CACHE)
  headers.set('Content-Type', 'application/json')
  return NextResponse.json(data, { headers })
}

async function tryReadLocalJson(
  kind: DisplayDataKind,
  relativePath: string
): Promise<unknown | null> {
  const fs = await import('fs')
  const path = await import('path')
  const filePath = path.join(process.cwd(), 'public', 'data', kind, relativePath)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown
  } catch {
    return null
  }
}

async function readLocalWithOptional2025Fallback(
  kind: DisplayDataKind,
  relativePath: string,
  pathSegments: string[]
): Promise<unknown | null> {
  let data = await tryReadLocalJson(kind, relativePath)
  if (
    kind === 'rankings' &&
    allowBatting2025Fallback() &&
    data == null &&
    pathSegments[0] === '2026' &&
    pathSegments[1] !== 'pitching'
  ) {
    const alt = ['2025', ...pathSegments.slice(1)].join('/')
    data = await tryReadLocalJson(kind, alt)
  }
  return data
}

function r2ObjectKey(kind: DisplayDataKind, relativePath: string): string {
  return `data/${kind}/${relativePath.replace(/^\/+/, '')}`
}

export async function handleDisplayDataGet(
  kind: DisplayDataKind,
  pathSegments: string[]
): Promise<NextResponse> {
  if (pathSegments.length === 0) {
    return NextResponse.json({ error: 'Path is required' }, { status: 400 })
  }

  const relativePath = pathSegments.join('/')
  let pathForFetch = relativePath
  const preferLocal = String(process.env.RANKINGS_PREFER_LOCAL || '').trim() === '1'

  if (preferLocal) {
    const data = await readLocalWithOptional2025Fallback(kind, relativePath, pathSegments)
    if (data != null) return jsonResponseWithCache(data)
  }

  const baseUrl = getRankingsBaseUrl()
  if (!baseUrl) {
    const data = await readLocalWithOptional2025Fallback(kind, relativePath, pathSegments)
    if (data != null) return jsonResponseWithCache(data)
    return NextResponse.json(
      {
        error: `Display JSON not found under public/data/${kind}/ or set RANKINGS_BASE_URL.`,
      },
      { status: 404 }
    )
  }

  const scope = process.env.RANKINGS_EXTERNALIZE_SCOPE || ''
  if (scope) {
    const scopes = scope.split(',').map((s) => s.trim().toLowerCase())
    const pathLower = pathForFetch.toLowerCase()
    const isInScope = scopes.some((s) => pathLower.includes(s))
    if (!isInScope) {
      const data = await readLocalWithOptional2025Fallback(kind, relativePath, pathSegments)
      if (data != null) return jsonResponseWithCache(data)
      return NextResponse.json(
        { error: `Path not in externalization scope (${scope})` },
        { status: 404 }
      )
    }
  }

  const timeoutMs = 5000
  const fetchExternal = async (rel: string): Promise<Response> => {
    const externalUrl = getExternalDisplayDataUrl(r2ObjectKey(kind, rel))
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(externalUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  let fetchResponse: Response
  try {
    fetchResponse = await fetchExternal(pathForFetch)
    if (
      kind === 'rankings' &&
      allowBatting2025Fallback() &&
      !fetchResponse.ok &&
      pathSegments[0] === '2026' &&
      fetchResponse.status === 404
    ) {
      pathForFetch = ['2025', ...pathSegments.slice(1)].join('/')
      fetchResponse = await fetchExternal(pathForFetch)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timeout' }, { status: 504 })
    }
    throw error
  }

  if (!fetchResponse.ok) {
    const localFallback = await readLocalWithOptional2025Fallback(
      kind,
      relativePath,
      pathSegments
    )
    if (localFallback != null) {
      return jsonResponseWithCache(localFallback)
    }
    return NextResponse.json(
      { error: `Failed to fetch display data: ${fetchResponse.statusText}` },
      { status: fetchResponse.status }
    )
  }

  const headers = new Headers()
  headers.set('Cache-Control', CACHE)
  const contentType = fetchResponse.headers.get('Content-Type')
  headers.set('Content-Type', contentType || 'application/json')
  const etag = fetchResponse.headers.get('ETag')
  if (etag) headers.set('ETag', etag)
  const lastModified = fetchResponse.headers.get('Last-Modified')
  if (lastModified) headers.set('Last-Modified', lastModified)

  return new NextResponse(fetchResponse.body, {
    status: fetchResponse.status,
    statusText: fetchResponse.statusText,
    headers,
  })
}
