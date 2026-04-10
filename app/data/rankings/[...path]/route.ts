/**
 * ランキングデータプロキシルート
 * /data/rankings/* へのリクエストを外部ストレージへプロキシ
 * ブラウザは常に同一オリジン（自サイト）にアクセスするため、CORS設定が不要
 *
 * 相対パスは `public/data/rankings/` 直下と一致させる。
 * 打撃: `{year}/{season}/{file}.json`
 * 投手: `pitching/{year}/{season}/{file}.json`（`loadPitchingRankingJson` と一致）
 */

import { NextResponse } from 'next/server'
import { getExternalRankingsUrl } from '@/lib/ranking/url'

// キャッシュを無効化して強制的に動的レンダリング
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET リクエストを処理
 * /data/rankings/2025/PL/OPS.json のようなリクエストを外部ストレージへプロキシ
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> | { path: string[] } }
) {
  try {
    // paramsがPromiseかどうかをチェック
    const resolvedParams = params instanceof Promise ? await params : params
    const pathSegments = resolvedParams.path || []
    
    if (pathSegments.length === 0) {
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      )
    }
    
    // パスを結合（例: '2026/PL/OPS.json' または 'pitching/2026/CL/防御率.json'）。
    // 打撃のみ: 先頭セグメントが `2026` のとき未配置なら 2025 にフォールバック。投手 `pitching/...` ではフォールバックしない。
    const relativePath = pathSegments.join('/')
    let pathForFetch = relativePath
    
    // 環境変数チェック
    const baseUrl = process.env.RANKINGS_BASE_URL
    if (!baseUrl) {
      // 開発環境ではローカルファイル参照にフォールバック
      if (process.env.NODE_ENV === 'development') {
        const fs = await import('fs')
        const path = await import('path')
        const tryRead = (rel: string) => {
          const filePath = path.join(process.cwd(), 'public', 'data', 'rankings', rel)
          try {
            const fileContent = fs.readFileSync(filePath, 'utf-8')
            return JSON.parse(fileContent) as unknown
          } catch {
            return null
          }
        }
        let data = tryRead(relativePath)
        if (data == null && pathSegments[0] === '2026') {
          const alt = ['2025', ...pathSegments.slice(1)].join('/')
          data = tryRead(alt)
        }
        if (data != null) {
          const headers = new Headers()
          headers.set('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600')
          headers.set('Content-Type', 'application/json')
          return NextResponse.json(data, { headers })
        }
        console.error(`[RankingsProxy] Local file not found: ${relativePath}`)
        return NextResponse.json({ error: 'File not found (local fallback failed)' }, { status: 404 })
      }
      
      // 本番環境ではエラー
      console.error('[RankingsProxy] RANKINGS_BASE_URL is not configured')
      return NextResponse.json(
        { error: 'RANKINGS_BASE_URL is not configured' },
        { status: 500 }
      )
    }
    
    // 段階移行: scope をチェック
    const scope = process.env.RANKINGS_EXTERNALIZE_SCOPE || ''
    if (scope) {
      const scopes = scope.split(',').map(s => s.trim().toLowerCase())
      const pathLower = pathForFetch.toLowerCase()
      
      const isInScope = scopes.some(s => pathLower.includes(s))
      if (!isInScope) {
        // scope外: ローカルファイル参照（開発環境）または404
        if (process.env.NODE_ENV === 'development') {
          const fs = await import('fs')
          const path = await import('path')
          const tryRead = (rel: string) => {
            const filePath = path.join(process.cwd(), 'public', 'data', 'rankings', rel)
            try {
              const fileContent = fs.readFileSync(filePath, 'utf-8')
              return JSON.parse(fileContent) as unknown
            } catch {
              return null
            }
          }
          let data = tryRead(relativePath)
          if (data == null && pathSegments[0] === '2026') {
            const alt = ['2025', ...pathSegments.slice(1)].join('/')
            data = tryRead(alt)
          }
          if (data != null) {
            const headers = new Headers()
            headers.set('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600')
            headers.set('Content-Type', 'application/json')
            return NextResponse.json(data, { headers })
          }
          console.error(`[RankingsProxy] Local file not found (scope): ${relativePath}`)
          return NextResponse.json(
            { error: 'File not found (not in scope and local fallback failed)' },
            { status: 404 }
          )
        }
        
        // 本番環境では404
        return NextResponse.json(
          { error: `Path ${relativePath} is not in externalization scope: ${scope}` },
          { status: 404 }
        )
      }
    }
    
    const timeoutMs = 5000
    const fetchExternal = async (rel: string): Promise<Response> => {
      const externalUrl = getExternalRankingsUrl(rel)
      if (process.env.NODE_ENV === 'development') {
        console.log(`[RankingsProxy] Fetching from external URL: ${externalUrl}`)
      }
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
      if (!fetchResponse.ok && pathSegments[0] === '2026' && fetchResponse.status === 404) {
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
      console.error(
        `[RankingsProxy] Failed to fetch from external, status: ${fetchResponse.status}`
      )
      return NextResponse.json(
        { error: `Failed to fetch ranking data: ${fetchResponse.statusText}` },
        { status: fetchResponse.status }
      )
    }
    
    // レスポンスボディを取得（streamで返すことでメモリ効率を向上）
    const responseBody = fetchResponse.body
    
    // キャッシュヘッダーを設定
    const headers = new Headers()
    headers.set('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600')
    
    // 元のレスポンスヘッダーからContent-Typeを引き継ぐ
    const contentType = fetchResponse.headers.get('Content-Type')
    if (contentType) {
      headers.set('Content-Type', contentType)
    } else {
      // Content-Typeが設定されていない場合は、ファイル拡張子から推測
      if (relativePath.endsWith('.json')) {
        headers.set('Content-Type', 'application/json')
      } else {
        headers.set('Content-Type', 'application/octet-stream')
      }
    }
    
    // その他の有用なヘッダーを引き継ぐ（オプション）
    const etag = fetchResponse.headers.get('ETag')
    if (etag) {
      headers.set('ETag', etag)
    }
    
    const lastModified = fetchResponse.headers.get('Last-Modified')
    if (lastModified) {
      headers.set('Last-Modified', lastModified)
    }
    
    // ストリームでレスポンスを返す（メモリ効率が良い）
    return new NextResponse(responseBody, {
      status: fetchResponse.status,
      statusText: fetchResponse.statusText,
      headers,
    })
  } catch (error) {
    console.error('[RankingsProxy] Error:', error)
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
