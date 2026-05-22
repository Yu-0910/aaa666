/**
 * API Route: 記事データを取得
 * Phase 1: _data/articles/articles.jsonから記事データを読み込む
 * Phase 2: RSSフィードから記事データを取得・パース
 */

export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"

import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import Parser from 'rss-parser'
import { XMLParser } from 'fast-xml-parser'
import { resolveGoogleNewsPublisherUrl, resetResolveCountInRequest } from '@/app/lib/googleNewsResolve'
import { resolveYahooOriginalUrl, resolveYahooOriginalInfo, type YahooOriginalInfo } from '@/app/lib/yahooResolve'
import { fetchDmenuNews, type DmenuDebugInfo, type NormalizedArticle as DmenuNormalizedArticle } from '@/app/lib/dmenu'
import { fetchAuoneNews, type AuoneDebugInfo, type AuoneArticle } from '@/app/lib/auone'

export type Article = {
  id: number | string
  title: string
  date: string
  source: string
  image: string
  link: string
  category?: string
  publishedAt?: string
  imageDebug?: {
    imageSource: "resolved-ogp" | "resolved-retry" | "google-news-fallback" | "placeholder"
    tried: Array<{ step: string; url: string; ok: boolean; note?: string }>
  }
}

// デバッグ情報の型定義
type FeedDebugInfo = {
  feedName: string
  feedUrl: string
  fetchOk: boolean
  httpStatus?: number
  contentType?: string
  rawXmlPreview?: string // 最初の1000文字
  itemsLength?: number
  firstItemKeys?: string[]
  firstItemSource?: any // JSON文字列化可能な値
  domainCheck?: {
    itemLink?: string
    itemSourceUrl?: string
    itemSourceName?: string
    allowedDomains?: string[]
    linkDomainMatch?: boolean
    sourceDomainMatch?: boolean
    finalMatch?: boolean
  }
  urlResolve?: {
    totalAttempts?: number
    successCount?: number
    failureCount?: number
    timeoutCount?: number
    hochiNewsCount?: number
    errors?: Array<{
      url?: string
      errorType?: string
      errorMessage?: string
    }>
  }
  finalArticleCount: number
  error?: string
}

type RSSFeedConfig = {
  name: string
  url: string
  enabled: boolean
  disabled?: boolean // 無効化フラグ（enabled: false より明示的）
  type?: string // フィードタイプ（例: "yahoo_topics", "google_news"）
  allowedDomains?: string[] // オプショナル: 許可するドメインのリスト（指定された場合、記事URLのドメインがこのリストに含まれるもののみ取得）
  allowedKeywords?: string[] // オプショナル: 許可するキーワードのリスト（指定された場合、タイトルや説明文にこのキーワードが含まれる記事のみ取得）
}

type RSSFeedsConfig = {
  feeds: RSSFeedConfig[]
  settings: {
    maxArticles: number
    cacheDuration: number
    timeout: number
  }
}

// キャッシュ用の変数（メモリキャッシュ）
let cachedArticles: Article[] | null = null
let cacheTimestamp: number = 0

/**
 * キャッシュをクリア（デバッグ用）
 */
function clearCache() {
  cachedArticles = null
  cacheTimestamp = 0
  if (process.env.NODE_ENV === 'development') {
    console.log('[API] Cache cleared')
  }
}

/**
 * RSSフィード設定ファイルを読み込む
 */
function loadRSSFeedsConfig(): RSSFeedsConfig | null {
  const configPath = path.join(process.cwd(), 'config', 'rss_feeds.json')
  
  if (!fs.existsSync(configPath)) {
    console.warn('[API] RSS feeds config not found, using fallback')
    return null
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(configContent) as RSSFeedsConfig
  } catch (error) {
    console.error('[API] Error loading RSS feeds config:', error)
    return null
  }
}

/**
 * 記事データファイルのパスを探索（Phase 1用）
 */
function findArticlesJson(): string | null {
  const searchPaths = [
    path.join(process.cwd(), '_data', 'articles', 'articles.json'),
    path.join(process.cwd(), 'data', 'articles', 'articles.json'),
    path.join(process.cwd(), 'articles.json'),
  ]

  for (const jsonPath of searchPaths) {
    if (fs.existsSync(jsonPath)) {
      return jsonPath
    }
  }

  return null
}

/**
 * 画像URLがブランド/ロゴ/ファビコンかどうかを判定
 */
function isBadImageUrl(url: string): { bad: boolean; reason?: string } {
  const u = url.toLowerCase()
  
  // branding / logo / favicon / sprite っぽいものを除外
  const badPatterns = [
    "news.google.com",
    "gstatic.com/images/branding",
    "googlelogo",
    "google_news",
    "googlenews",
    "/logo",
    "favicon",
    "sprite",
    "icon",
    "apple-touch-icon",
  ]
  
  if (badPatterns.some(p => u.includes(p))) {
    return { bad: true, reason: "branding/logo/favicon pattern" }
  }
  
  // 小さすぎるサムネっぽいクエリも除外（あれば）
  if (u.includes("w=") && /w=(1?\d{1,2}|1[0-9]{2})(&|$)/.test(u)) {
    return { bad: true, reason: "too small width" }
  }
  
  return { bad: false }
}

/**
 * URLを正規化（相対URL→絶対URL、HTML entity decode、空白除去）
 */
function normalizeImageUrl(url: string, baseUrl: string): string {
  try {
    // HTML entity decode
    let normalized = url
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
    
    // 相対URLを絶対URLに変換
    if (normalized.startsWith('//')) {
      normalized = `https:${normalized}`
    } else if (normalized.startsWith('/')) {
      const base = new URL(baseUrl)
      normalized = `${base.protocol}//${base.host}${normalized}`
    } else if (!normalized.startsWith('http')) {
      const base = new URL(baseUrl)
      normalized = `${base.protocol}//${base.host}/${normalized}`
    }
    
    return normalized
  } catch {
    return url
  }
}

/**
 * OGP画像取得のデバッグ情報型
 */
type OgpDebug = {
  ok: boolean
  imageUrl: string
  status?: number
  contentType?: string
  finalUrl?: string
  error?: string
  candidates?: Array<{ url: string; score?: number }>
  rejected?: Array<{ url: string; reason: string }>
  note?: string
}

/**
 * JSON-LDから画像URLを抽出
 */
function extractImageFromJsonLd(html: string): string[] {
  const candidates: string[] = []
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  
  while ((match = jsonLdRegex.exec(html))) {
    try {
      const jsonStr = match[1]?.trim()
      if (!jsonStr) continue
      
      const parsed = JSON.parse(jsonStr)
      const items = Array.isArray(parsed) ? parsed : [parsed]
      
      for (const item of items) {
        // ImageObject の url
        if (item['@type'] === 'ImageObject' && item.url) {
          candidates.push(item.url)
        }
        // 直接 image プロパティ
        if (item.image) {
          if (typeof item.image === 'string') {
            candidates.push(item.image)
          } else if (item.image.url) {
            candidates.push(item.image.url)
          } else if (Array.isArray(item.image)) {
            for (const img of item.image) {
              if (typeof img === 'string') {
                candidates.push(img)
              } else if (img.url) {
                candidates.push(img.url)
              }
            }
          }
        }
      }
    } catch {
      // JSONパースエラーは無視
    }
  }
  
  return candidates
}

/**
 * OGP画像を取得する関数（デバッグ情報付き）
 * 複数の画像候補を抽出し、ロゴ判定を行い、最適な画像を選択
 */
async function fetchOGPImageDebug(url: string, timeout: number = 5000, maxDepth: number = 2): Promise<OgpDebug> {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[fetchOGPImageDebug] Starting fetch for: ${url}, timeout: ${timeout}ms, maxDepth: ${maxDepth}`)
  }
  
  try {
    // タイムアウト付きfetch（リダイレクトを追従）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      redirect: 'follow', // リダイレクトを追従
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
      cache: 'no-store' as RequestCache,
    })

    clearTimeout(timeoutId)

    const status = response.status
    const contentType = response.headers.get('content-type') || undefined
    const finalUrl = response.url

    if (!response.ok) {
      // 非200の場合: 本文の先頭200文字を取得してnoteに入れる
      let note: string | undefined = undefined
      try {
        const text = await response.text()
        note = text.substring(0, 200)
      } catch {
        // 本文取得失敗は無視
      }
      
      return {
        ok: false,
        imageUrl: '/placeholder.svg',
        status,
        contentType,
        finalUrl,
        error: `HTTP ${status}`,
        note,
      }
    }

    const html = await response.text()
    
    // Google NewsのURL（news.google.com）の場合は、HTMLから実際の記事URLを抽出
    if (finalUrl.includes('news.google.com') && maxDepth > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[fetchOGPImageDebug] Google News URL detected: ${finalUrl}, HTML length: ${html.length}, maxDepth: ${maxDepth}`)
      }
      
      // og:urlを抽出
      const ogUrlMatch = html.match(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i)
      if (ogUrlMatch && ogUrlMatch[1]) {
        const articleUrl = ogUrlMatch[1]
        if (process.env.NODE_ENV === 'development') {
          console.log(`[fetchOGPImageDebug] Found og:url: ${articleUrl}`)
        }
        // 実際の記事URLからOGP画像を取得（再帰的に呼び出し、無限ループを防ぐためmaxDepthを減らす）
        if (!articleUrl.includes('news.google.com')) {
          return await fetchOGPImageDebug(articleUrl, timeout, maxDepth - 1)
        }
      }
      
      // canonicalリンクを抽出
      const canonicalMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)
      if (canonicalMatch && canonicalMatch[1]) {
        const articleUrl = canonicalMatch[1]
        if (process.env.NODE_ENV === 'development') {
          console.log(`[fetchOGPImageDebug] Found canonical: ${articleUrl}`)
        }
        // 実際の記事URLからOGP画像を取得（再帰的に呼び出し、無限ループを防ぐためmaxDepthを減らす）
        if (!articleUrl.includes('news.google.com')) {
          return await fetchOGPImageDebug(articleUrl, timeout, maxDepth - 1)
        }
      }
      
      // HTML内の記事URLパターンを抽出（最後の手段）
      // 例: https://www.sanspo.com/article/20260118-XXXXX などのURLパターン
      const articleUrlPatterns = [
        /https?:\/\/[^\s"'<>]+\.(sanspo|hochi|nikkansports|daily|sponichi|chunichi|asahi|mainichi|yomiuri|tokyo-np)\.(com|co\.jp|net)[^\s"'<>]*/i,
        /https?:\/\/[^\s"'<>]+\/article[s]?\/[^\s"'<>]+/i,
      ]
      
      for (const pattern of articleUrlPatterns) {
        const matches = html.match(pattern)
        if (matches && matches[0] && !matches[0].includes('news.google.com')) {
          const articleUrl = matches[0]
          if (process.env.NODE_ENV === 'development') {
            console.log(`[fetchOGPImageDebug] Found article URL pattern: ${articleUrl}`)
          }
          return await fetchOGPImageDebug(articleUrl, timeout, maxDepth - 1)
        }
      }
      
      // Google NewsのページからはOGP画像を取得しない（placeholderを返す）
      // 詳細なデバッグ情報を出力
      console.warn(`[fetchOGPImageDebug] Could not extract article URL from Google News page: ${finalUrl}`)
      console.warn(`[fetchOGPImageDebug] HTML length: ${html.length}, maxDepth: ${maxDepth}`)
      
      // 抽出を試みたパターンの結果を確認
      const ogUrlCheck = html.match(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i)
      const canonicalCheck = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)
      console.warn(`[fetchOGPImageDebug] og:url found: ${!!ogUrlCheck}, canonical found: ${!!canonicalCheck}`)
      if (ogUrlCheck) console.warn(`[fetchOGPImageDebug] og:url value: ${ogUrlCheck[1]}`)
      if (canonicalCheck) console.warn(`[fetchOGPImageDebug] canonical value: ${canonicalCheck[1]}`)
      
      // HTMLの一部を出力（記事URLパターンが含まれているか確認）
      // 上で定義した articleUrlPatterns を再利用
      for (const pattern of articleUrlPatterns) {
        const matches = html.match(pattern)
        if (matches) {
          console.warn(`[fetchOGPImageDebug] Found pattern match: ${matches[0]}`)
        }
      }
      
      return {
        ok: false,
        imageUrl: '/placeholder.svg',
        status,
        contentType,
        finalUrl,
        error: 'NO_ARTICLE_URL_EXTRACTED',
        note: `Google News page, could not extract article URL. HTML length: ${html.length}, og:url: ${ogUrlCheck ? 'found' : 'not found'}, canonical: ${canonicalCheck ? 'found' : 'not found'}`,
      }
    }
    
    // 画像候補を複数抽出
    const imageCandidates: string[] = []
    
    // 1) og:image
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)
    if (ogImageMatch?.[1]) {
      imageCandidates.push(ogImageMatch[1])
    }
    
    // 2) og:image:secure_url
    const ogImageSecureMatch = html.match(/<meta\s+property=["']og:image:secure_url["']\s+content=["']([^"']+)["']/i)
    if (ogImageSecureMatch?.[1]) {
      imageCandidates.push(ogImageSecureMatch[1])
    }
    
    // 3) twitter:image
    const twitterImageMatch = html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i)
    if (twitterImageMatch?.[1]) {
      imageCandidates.push(twitterImageMatch[1])
    }
    
    // 4) link[rel="image_src"]
    const imageSrcMatch = html.match(/<link\s+rel=["']image_src["']\s+href=["']([^"']+)["']/i)
    if (imageSrcMatch?.[1]) {
      imageCandidates.push(imageSrcMatch[1])
    }
    
    // 5) JSON-LD
    const jsonLdImages = extractImageFromJsonLd(html)
    imageCandidates.push(...jsonLdImages)
    
    // 候補を正規化し、ロゴ判定でフィルタリング
    const validCandidates: Array<{ url: string; width?: number; height?: number; score?: number }> = []
    const rejected: Array<{ url: string; reason: string }> = []
    
    for (const candidate of imageCandidates) {
      const normalized = normalizeImageUrl(candidate, finalUrl)
      const badCheck = isBadImageUrl(normalized)
      
      if (badCheck.bad) {
        rejected.push({ url: normalized, reason: badCheck.reason || 'bad pattern' })
        if (process.env.NODE_ENV === 'development') {
          console.log(`[fetchOGPImageDebug] Rejected candidate (${badCheck.reason}): ${normalized}`)
        }
        continue
      }
      
      // width/heightを抽出（あれば）
      const widthMatch = normalized.match(/[?&]w=(\d+)/)
      const heightMatch = normalized.match(/[?&]h=(\d+)/)
      const width = widthMatch ? parseInt(widthMatch[1], 10) : undefined
      const height = heightMatch ? parseInt(heightMatch[1], 10) : undefined
      const score = (width || 0) * (height || 0) // スコア計算
      
      validCandidates.push({ url: normalized, width, height, score })
    }
    
    if (validCandidates.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[fetchOGPImageDebug] No valid image candidates found for: ${finalUrl}`)
      }
      return {
        ok: false,
        imageUrl: '/placeholder.svg',
        status,
        contentType,
        finalUrl,
        error: 'NO_IMAGE_META',
        candidates: imageCandidates.slice(0, 10).map(url => ({ url })),
        rejected: rejected.length > 0 ? rejected.slice(0, 10) : undefined,
        note: `Found ${imageCandidates.length} candidates, all rejected`,
      }
    }
    
    // 複数候補がある場合、width/heightが大きいものを優先
    validCandidates.sort((a, b) => (b.score || 0) - (a.score || 0))
    
    const selected = validCandidates[0].url
    if (process.env.NODE_ENV === 'development') {
      console.log(`[fetchOGPImageDebug] Selected image: ${selected} (from ${validCandidates.length} candidates)`)
    }
    
    return {
      ok: true,
      imageUrl: selected,
      status,
      contentType,
      finalUrl,
      candidates: validCandidates.slice(0, 10).map(c => ({ url: c.url, score: c.score })),
      rejected: rejected.length > 0 ? rejected.slice(0, 10) : undefined,
    }
  } catch (error: any) {
    console.error("FETCH FAILED:", {
      url,
      message: error?.message,
      code: error?.code,
      name: error?.name,
      errno: error?.errno,
      syscall: error?.syscall,
      cause: error?.cause,
      stack: error?.stack,
    })
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (error instanceof Error && error.name !== 'AbortError') {
      console.warn(`[API] Failed to fetch OGP image for ${url}:`, error)
    }
    return {
      ok: false,
      imageUrl: '/placeholder.svg',
      error: errorMessage,
    }
  }
}

/**
 * OGP画像を取得する関数（ラッパー）
 * fetchOGPImageDebugの薄いラッパー（既存コードとの互換性のため）
 */
async function fetchOGPImage(url: string, timeout: number = 5000, maxDepth: number = 2): Promise<string> {
  const result = await fetchOGPImageDebug(url, timeout, maxDepth)
  return result.imageUrl
}

/**
 * リトライ付きfetchヘルパー
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 2
): Promise<Response> {
  const timeoutMs = 15000
  
  // デフォルトヘッダー
  const defaultHeaders: HeadersInit = {
    'User-Agent': 'Mozilla/5.0 (compatible; RSSFetcher/1.0; +https://example.com)',
    'Accept': 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7',
    'Accept-Language': 'ja,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  }
  
  // 既存のheadersとマージ
  const headers = {
    ...defaultHeaders,
    ...(options.headers || {}),
  }
  
  // Next.jsのfetchオプション
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    cache: 'no-store' as RequestCache,
  }
  
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      // 成功（2xx）
      if (response.ok) {
        const contentType = response.headers.get('content-type') || ''
        const contentLength = response.headers.get('content-length') || 'unknown'
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`[API] fetchWithRetry: ${url.substring(0, 80)}... fetched OK status=${response.status} bytes=${contentLength} attempt=${attempt + 1}`)
          
          // HTMLが返ってきた場合（RSSが返ってない可能性）
          if (contentType.includes('text/html')) {
            console.warn(`[API] fetchWithRetry: Warning - Content-Type is ${contentType}, expected RSS/XML`)
          }
        }
        
        return response
      }
      
      // リトライ対象のステータスコード
      const shouldRetry = 
        response.status === 429 || // Too Many Requests
        response.status === 502 || // Bad Gateway
        response.status === 503 || // Service Unavailable
        response.status === 504    // Gateway Timeout
      
      if (shouldRetry && attempt < maxRetries) {
        // 429の場合はRetry-Afterヘッダーを確認
        let waitMs = attempt === 0 ? 500 : 1500 // 指数バックオフ
        
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          if (retryAfter) {
            const retryAfterSeconds = parseInt(retryAfter, 10)
            if (!isNaN(retryAfterSeconds)) {
              waitMs = retryAfterSeconds * 1000
              if (process.env.NODE_ENV === 'development') {
                console.log(`[API] fetchWithRetry: 429 received, Retry-After=${retryAfterSeconds}s, waiting ${waitMs}ms`)
              }
            }
          }
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[API] fetchWithRetry: ${url.substring(0, 80)}... status=${response.status} ${response.statusText}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
        }
        
        await new Promise(resolve => setTimeout(resolve, waitMs))
        continue
      }
      
      // リトライしないエラーまたはリトライ上限到達
      const contentType = response.headers.get('content-type') || ''
      throw new Error(`HTTP ${response.status} ${response.statusText}${contentType ? ` (Content-Type: ${contentType})` : ''}`)
      
    } catch (error: any) {
      console.error("FETCH FAILED:", {
        url,
        message: error?.message,
        code: error?.code,
        name: error?.name,
        errno: error?.errno,
        syscall: error?.syscall,
        cause: error?.cause,
        stack: error?.stack,
      })
      lastError = error instanceof Error ? error : new Error(String(error))
      
      // AbortError（タイムアウト）またはネットワークエラー
      const isRetryable = 
        lastError.name === 'AbortError' ||
        lastError.message.includes('ECONNREFUSED') ||
        lastError.message.includes('ETIMEDOUT') ||
        lastError.message.includes('ENOTFOUND') ||
        lastError.message.includes('network')
      
      if (isRetryable && attempt < maxRetries) {
        const waitMs = attempt === 0 ? 500 : 1500
        
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[API] fetchWithRetry: ${url.substring(0, 80)}... ${lastError.name}: ${lastError.message}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
        }
        
        await new Promise(resolve => setTimeout(resolve, waitMs))
        continue
      }
      
      // リトライしないエラーまたはリトライ上限到達
      if (attempt === maxRetries) {
        const contentType = (error as any).contentType || ''
        console.error(`[API] fetchWithRetry: ${url.substring(0, 80)}... FAILED after ${attempt + 1} attempts:`, {
          error: lastError.name,
          message: lastError.message,
          contentType,
        })
        throw lastError
      }
    }
  }
  
  // ここには到達しないはずだが、念のため
  throw lastError || new Error('Unknown error in fetchWithRetry')
}

/**
 * 画像取得結果の型
 */
type ImagePickResult = {
  imageUrl: string
  imageSource: "resolved-ogp" | "resolved-retry" | "google-news-fallback" | "placeholder"
  tried: Array<{ 
    step: string
    url: string
    ok: boolean
    note?: string
    status?: number
    contentType?: string
    finalUrl?: string
    pickedImageUrl?: string
    error?: string
    rejectedCount?: number
    candidateCount?: number
  }>
}

/**
 * 記事の画像を段階的に取得する（Google News用）
 */
async function pickArticleImage(params: {
  itemLink: string
  resolvedUrl: string | null
  allowedDomains: string[]
  timeoutMs: number
  debug: boolean
}): Promise<ImagePickResult> {
  const { itemLink, resolvedUrl, allowedDomains, timeoutMs, debug } = params
  const tried: ImagePickResult["tried"] = []

  // 1) resolvedUrl で試す
  if (resolvedUrl) {
    if (debug) {
      const debugResult = await fetchOGPImageDebug(resolvedUrl, timeoutMs)
      const ok = debugResult.ok && debugResult.imageUrl !== "/placeholder.svg"
      tried.push({
        step: "resolved-ogp",
        url: resolvedUrl,
        ok,
        note: ok ? "picked" : (debugResult.error || "placeholder"),
        status: debugResult.status,
        contentType: debugResult.contentType,
        finalUrl: debugResult.finalUrl,
        pickedImageUrl: ok ? debugResult.imageUrl : undefined,
        error: debugResult.error,
        rejectedCount: debugResult.rejected?.length,
        candidateCount: debugResult.candidates?.length,
      })
      if (ok) {
        return { imageUrl: debugResult.imageUrl, imageSource: "resolved-ogp", tried }
      }
    } else {
      const img = await fetchOGPImage(resolvedUrl, timeoutMs)
      const ok = !!img && img !== "/placeholder.svg"
      tried.push({ step: "resolved-ogp", url: resolvedUrl, ok, note: ok ? "picked" : "placeholder" })
      if (ok) {
        return { imageUrl: img, imageSource: "resolved-ogp", tried }
      }
    }
  } else {
    tried.push({ step: "resolved-ogp", url: itemLink, ok: false, note: "resolvedUrl null" })
  }

  // 2) resolvedUrlがnull or placeholderなら、Google Newsの解決を "再試行" してpublisherUrlを取りに行く
  //    ※ resolve側の失敗キャッシュTTLが短い前提（10秒に変更済み）
  try {
    const publisherUrl = await resolveGoogleNewsPublisherUrl(itemLink, allowedDomains, { timeoutMs: Math.max(timeoutMs, 12000) })
    if (publisherUrl) {
      if (debug) {
        const debugResult = await fetchOGPImageDebug(publisherUrl, timeoutMs)
        const ok2 = debugResult.ok && debugResult.imageUrl !== "/placeholder.svg"
        tried.push({
          step: "resolved-retry",
          url: publisherUrl,
          ok: ok2,
          note: ok2 ? "picked" : (debugResult.error || "placeholder"),
          status: debugResult.status,
          contentType: debugResult.contentType,
          finalUrl: debugResult.finalUrl,
          pickedImageUrl: ok2 ? debugResult.imageUrl : undefined,
          error: debugResult.error,
          rejectedCount: debugResult.rejected?.length,
          candidateCount: debugResult.candidates?.length,
        })
        if (ok2) {
          return { imageUrl: debugResult.imageUrl, imageSource: "resolved-retry", tried }
        }
      } else {
        const img2 = await fetchOGPImage(publisherUrl, timeoutMs)
        const ok2 = !!img2 && img2 !== "/placeholder.svg"
        tried.push({ step: "resolved-retry", url: publisherUrl, ok: ok2, note: ok2 ? "picked" : "placeholder" })
        if (ok2) {
          return { imageUrl: img2, imageSource: "resolved-retry", tried }
        }
      }
    } else {
      tried.push({ step: "resolved-retry", url: itemLink, ok: false, note: "publisherUrl null" })
    }
  } catch (error) {
    tried.push({ step: "resolved-retry", url: itemLink, ok: false, note: `error: ${error instanceof Error ? error.message : String(error)}` })
  }

  // 3) 最後の保険: Google News URLそのものを fetchOGPImage に渡す（内部でロゴ判定して弾く）
  try {
    if (debug) {
      const debugResult = await fetchOGPImageDebug(itemLink, timeoutMs)
      const ok3 = debugResult.ok && debugResult.imageUrl !== "/placeholder.svg"
      tried.push({
        step: "google-news-fallback",
        url: itemLink,
        ok: ok3,
        note: ok3 ? "picked" : (debugResult.error || "placeholder or rejected"),
        status: debugResult.status,
        contentType: debugResult.contentType,
        finalUrl: debugResult.finalUrl,
        pickedImageUrl: ok3 ? debugResult.imageUrl : undefined,
        error: debugResult.error,
        rejectedCount: debugResult.rejected?.length,
        candidateCount: debugResult.candidates?.length,
      })
      if (ok3) {
        return { imageUrl: debugResult.imageUrl, imageSource: "google-news-fallback", tried }
      }
    } else {
      const img3 = await fetchOGPImage(itemLink, timeoutMs)
      const ok3 = !!img3 && img3 !== "/placeholder.svg"
      tried.push({ step: "google-news-fallback", url: itemLink, ok: ok3, note: ok3 ? "picked" : "placeholder or rejected" })
      if (ok3) {
        return { imageUrl: img3, imageSource: "google-news-fallback", tried }
      }
    }
  } catch (error) {
    tried.push({ step: "google-news-fallback", url: itemLink, ok: false, note: `error: ${error instanceof Error ? error.message : String(error)}` })
  }

  return { imageUrl: "/placeholder.svg", imageSource: "placeholder", tried }
}

/**
 * RSSフィードから記事を取得
 */
/**
 * Google News RSSかどうかを判定
 */
function isGoogleNewsRSS(feedUrl: string): boolean {
  return feedUrl.includes('news.google.com/rss/') || feedUrl.includes('news.google.com/rss?')
}

/**
 * Google News RSSのXMLを直接パースして記事を取得
 */
function parseGoogleNewsRss(xmlContent: string): Array<{
  title: string
  link: string
  pubDate: string
  description?: string
  sourceName?: string
  sourceUrl?: string
}> {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
    })

    const parsed = parser.parse(xmlContent)
    const items: Array<{
      title: string
      link: string
      pubDate: string
      description?: string
      sourceName?: string
      sourceUrl?: string
    }> = []

    // RSS 2.0形式: rss.channel.item
    const channel = parsed.rss?.channel || parsed.feed
    if (!channel) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[API] parseGoogleNewsRss: No channel found in XML')
      }
      return []
    }

    const rawItems = channel.item || (channel.entry ? [channel.entry].flat() : [])
    const itemsArray = Array.isArray(rawItems) ? rawItems : [rawItems]

    for (const item of itemsArray) {
      if (!item) continue

      const title = item.title?.['#text'] || item.title || ''
      const link = item.link?.['#text'] || item.link || item.guid?.['#text'] || item.id || ''
      const pubDate = item.pubDate || item.published || item['dc:date'] || ''
      const description = item.description?.['#text'] || item.description || item.summary?.['#text'] || item.summary || ''

      // source要素を取得
      let sourceName: string | undefined = undefined
      let sourceUrl: string | undefined = undefined

      if (item.source) {
        // sourceがオブジェクトの場合
        if (typeof item.source === 'object') {
          sourceName = item.source['#text'] || item.source['_'] || item.source['name'] || item.source['title'] || undefined
          sourceUrl = item.source['@_url'] || item.source['url'] || undefined
          
          // デバッグログ: 最初のアイテムのみ
          if (itemsArray.indexOf(item) === 0 && process.env.NODE_ENV === 'development') {
            console.log('[API] parseGoogleNewsRss: First item source structure:', {
              source: item.source,
              sourceName,
              sourceUrl,
              sourceKeys: Object.keys(item.source),
            })
          }
        }
        // sourceが文字列の場合
        else if (typeof item.source === 'string') {
          sourceName = item.source
        }
      } else {
        // デバッグログ: sourceが見つからない場合
        if (itemsArray.indexOf(item) === 0 && process.env.NODE_ENV === 'development') {
          console.warn('[API] parseGoogleNewsRss: No source found in first item')
          console.warn('[API] parseGoogleNewsRss: First item keys:', Object.keys(item))
        }
      }

      items.push({
        title: title.trim(),
        link: link.trim(),
        pubDate: pubDate.trim(),
        description: description.trim() || undefined,
        sourceName,
        sourceUrl,
      })
    }

    return items
  } catch (error) {
    console.error('[API] parseGoogleNewsRss error:', error)
    return []
  }
}

/**
 * Atomフィードの生XMLから画像URLを抽出（<link rel="enclosure">から）
 */
function extractImageUrlFromAtomXml(xmlContent: string, entryIndex: number = 0): string | null {
  try {
    // 各entry要素を取得
    const entryMatches = xmlContent.match(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)
    if (!entryMatches || entryMatches.length <= entryIndex) {
      if (process.env.NODE_ENV === 'development' && entryIndex === 0) {
        console.warn(`[API] extractImageUrlFromAtomXml: No entry matches found or entryIndex out of range (${entryIndex}/${entryMatches ? entryMatches.length : 0})`)
      }
      return null
    }

    const entryXml = entryMatches[entryIndex]
    
    if (process.env.NODE_ENV === 'development' && entryIndex === 0) {
      console.log(`[API] extractImageUrlFromAtomXml: Entry XML length: ${entryXml.length}`)
      // entryXml内にenclosureがあるかチェック
      const hasEnclosure = entryXml.includes('rel="enclosure"') || entryXml.includes("rel='enclosure'")
      console.log(`[API] extractImageUrlFromAtomXml: Has enclosure link: ${hasEnclosure}`)
    }
    
    // <link rel="enclosure" href="...">を探す（改行・属性順序・クォート種類に対応）
    // より堅牢な正規表現: linkタグ内にrel="enclosure"またはrel='enclosure'があり、かつhref属性がある
    // [\s\S]*? で改行を含む任意の文字にマッチ
    let enclosureMatch = entryXml.match(/<link[\s\S]*?rel\s*=\s*["']enclosure["'][\s\S]*?href\s*=\s*["']([^"']+)["'][\s\S]*?>/i)
    // パターン2: href属性が先に来る場合
    if (!enclosureMatch) {
      enclosureMatch = entryXml.match(/<link[\s\S]*?href\s*=\s*["']([^"']+)["'][\s\S]*?rel\s*=\s*["']enclosure["'][\s\S]*?>/i)
    }
    
    if (enclosureMatch && enclosureMatch[1]) {
      const imageUrl = enclosureMatch[1]
      if (process.env.NODE_ENV === 'development' && entryIndex === 0) {
        console.log(`[API] extractImageUrlFromAtomXml: Found image URL: ${imageUrl}`)
      }
      return imageUrl
    } else {
      if (process.env.NODE_ENV === 'development' && entryIndex === 0) {
        console.warn(`[API] extractImageUrlFromAtomXml: No enclosure match found in entry XML`)
        // デバッグ: entryXml内の最初の200文字を表示
        console.log(`[API] extractImageUrlFromAtomXml: Entry XML preview: ${entryXml.substring(0, 200)}...`)
      }
    }
    
    return null
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[API] Failed to extract image from Atom XML:`, error)
    }
    return null
  }
}

async function fetchArticlesFromRSS(
  feedConfig: RSSFeedConfig, 
  timeout: number, 
  debugMode: boolean = false
): Promise<{ articles: Article[]; debugInfo?: FeedDebugInfo; yahooDebug?: Array<{
  itemIndex: number
  itemLink: string
  resolvedOriginalUrl: string | null
  publisherHost: string | null
  debugInfo?: YahooOriginalInfo['debugInfo']
}> }> {
  const parser = new Parser({
    timeout: timeout,
    customFields: {
      item: ['enclosure', 'media:content', 'links', 'source'],
    },
    // User-Agentを設定（一部のサイトはUser-Agentが必要）
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
  })

  const debugInfo: FeedDebugInfo = {
    feedName: feedConfig.name,
    feedUrl: feedConfig.url,
    fetchOk: false,
    finalArticleCount: 0,
  }

  try {
    if (process.env.NODE_ENV === 'development' || debugMode) {
      console.log(`[API] Fetching RSS feed: ${feedConfig.name} from ${feedConfig.url}`)
    }
    
    // Google News RSSかどうかを判定
    const isGoogleNews = isGoogleNewsRSS(feedConfig.url)
    // Yahoo Topicsかどうかを判定
    const isYahooTopics = feedConfig.type === 'yahoo_topics' || feedConfig.url.includes('yahoo.co.jp/rss')
    
    // 生XMLを取得（デバッグモード、Atomフィード、またはGoogle News RSSの場合）
    let rawXmlContent: string | null = null
    let httpStatus: number | undefined = undefined
    let contentType: string | undefined = undefined
    
    // デバッグモード、Atomフィード、またはGoogle News RSSの場合は生XMLを取得
    const isAtomFeed = feedConfig.url.endsWith('atom.xml') || feedConfig.url.includes('/atom.xml')
    const shouldFetchRawXml = debugMode || isAtomFeed || isGoogleNews
    
    if (shouldFetchRawXml) {
      try {
        const response = await fetchWithRetry(feedConfig.url)
        
        httpStatus = response.status
        contentType = response.headers.get('content-type') || undefined
        
        if (response.ok) {
          rawXmlContent = await response.text()
          debugInfo.fetchOk = true
          debugInfo.httpStatus = httpStatus
          debugInfo.contentType = contentType
          debugInfo.rawXmlPreview = rawXmlContent.substring(0, 1000)
          
          if (process.env.NODE_ENV === 'development' || debugMode) {
            console.log(`[API] ${feedConfig.name}: Fetched raw XML (${rawXmlContent.length} bytes)`)
          }
        } else {
          debugInfo.fetchOk = false
          debugInfo.httpStatus = httpStatus
          debugInfo.contentType = contentType
          debugInfo.error = `HTTP ${httpStatus}`
        }
      } catch (error) {
        debugInfo.fetchOk = false
        debugInfo.httpStatus = httpStatus
        debugInfo.contentType = contentType
        const errorMessage = error instanceof Error ? error.message : String(error)
        debugInfo.error = errorMessage
        
        console.error(`[API] ${feedConfig.name}: Failed to fetch raw XML:`, {
          url: feedConfig.url.substring(0, 80),
          error: error instanceof Error ? error.name : 'Unknown',
          message: errorMessage,
          contentType,
        })
      }
    }
    
    // Google News RSSの場合はfast-xml-parserで直接パース
    let parsedItems: Array<{
      title: string
      link: string
      pubDate: string
      description?: string
      sourceName?: string
      sourceUrl?: string
    }> = []
    
    if (isGoogleNews && rawXmlContent) {
      // Google News RSSはfast-xml-parserで直接パース
      if (process.env.NODE_ENV === 'development' || debugMode) {
        console.log(`[API] Parsing Google News RSS with fast-xml-parser (XML length: ${rawXmlContent.length})`)
      }
      parsedItems = parseGoogleNewsRss(rawXmlContent)
      
      if (parsedItems.length === 0) {
        debugInfo.fetchOk = false
        debugInfo.error = 'Failed to parse Google News RSS XML'
        if (process.env.NODE_ENV === 'development' || debugMode) {
          console.warn(`[API] Failed to parse Google News RSS: ${feedConfig.name}`)
          console.warn(`[API] XML preview: ${rawXmlContent.substring(0, 500)}`)
        }
        return { articles: [], debugInfo: debugMode ? debugInfo : undefined, yahooDebug: undefined }
      }
      
      if (process.env.NODE_ENV === 'development' || debugMode) {
        console.log(`[API] Parsed ${parsedItems.length} items from Google News RSS`)
      }
      
      // デバッグ情報: Google News RSSの最初のアイテム
      if (parsedItems.length > 0) {
        const firstItem = parsedItems[0]
        debugInfo.itemsLength = parsedItems.length
        debugInfo.firstItemKeys = Object.keys(firstItem)
        debugInfo.firstItemSource = {
          name: firstItem.sourceName,
          url: firstItem.sourceUrl,
        }
        
        if (process.env.NODE_ENV === 'development' || debugMode) {
          console.log(`[API] Google News RSS ${feedConfig.name}: ${parsedItems.length} items found`)
          console.log(`[API] First item (Google News):`, {
            title: firstItem.title?.substring(0, 50),
            link: firstItem.link,
            sourceName: firstItem.sourceName,
            sourceUrl: firstItem.sourceUrl,
          })
          if (feedConfig.allowedDomains) {
            console.log(`[API] Domain filter enabled: ${feedConfig.allowedDomains.join(', ')}`)
          }
        }
      }
    } else {
      // 通常のRSSもfetchWithRetryで生XMLを取得してからパース
      if (!rawXmlContent) {
        try {
          const response = await fetchWithRetry(feedConfig.url)
          httpStatus = response.status
          contentType = response.headers.get('content-type') || undefined
          
          if (response.ok) {
            rawXmlContent = await response.text()
            debugInfo.fetchOk = true
            debugInfo.httpStatus = httpStatus
            debugInfo.contentType = contentType
            debugInfo.rawXmlPreview = rawXmlContent.substring(0, 1000)
          } else {
            debugInfo.fetchOk = false
            debugInfo.httpStatus = httpStatus
            debugInfo.contentType = contentType
            debugInfo.error = `HTTP ${httpStatus}`
            if (process.env.NODE_ENV === 'development' || debugMode) {
              console.error(`[API] ${feedConfig.name}: Failed to fetch RSS (HTTP ${httpStatus})`)
            }
            return { articles: [], debugInfo: debugMode ? debugInfo : undefined, yahooDebug: undefined }
          }
        } catch (error) {
          debugInfo.fetchOk = false
          debugInfo.httpStatus = httpStatus
          debugInfo.contentType = contentType
          const errorMessage = error instanceof Error ? error.message : String(error)
          debugInfo.error = errorMessage
          
          console.error(`[API] ${feedConfig.name}: Failed to fetch RSS:`, {
            url: feedConfig.url.substring(0, 80),
            error: error instanceof Error ? error.name : 'Unknown',
            message: errorMessage,
            contentType,
          })
          return { articles: [], debugInfo: debugMode ? debugInfo : undefined, yahooDebug: undefined }
        }
      }
      
      // 生XMLをrss-parserでパース
      if (!rawXmlContent) {
        debugInfo.fetchOk = false
        debugInfo.error = 'No XML content available'
        return { articles: [], debugInfo: debugMode ? debugInfo : undefined, yahooDebug: undefined }
      }
      
      const feed = await parser.parseString(rawXmlContent)
      
      if (!feed || !feed.items || feed.items.length === 0) {
        debugInfo.fetchOk = false
        debugInfo.error = 'Empty or invalid feed data'
        if (process.env.NODE_ENV === 'development' || debugMode) {
          console.warn(`[API] RSS feed ${feedConfig.name} returned empty or invalid data`)
        }
        return { articles: [], debugInfo: debugMode ? debugInfo : undefined, yahooDebug: undefined }
      }
      
      // デバッグ情報: rss-parser後の情報
      debugInfo.itemsLength = feed.items.length
      if (feed.items.length > 0) {
        const firstItem = feed.items[0]
        debugInfo.firstItemKeys = Object.keys(firstItem)
        
        // Yahoo Topicsの場合、特別なログを追加
        if (isYahooTopics && (process.env.NODE_ENV === 'development' || debugMode)) {
          console.log(`[API] Yahoo Topics RSS: Parsed ${feed.items.length} items`)
          console.log(`[API] Yahoo Topics first item:`, {
            title: firstItem.title?.substring(0, 60),
            link: firstItem.link,
            itemKeys: Object.keys(firstItem),
          })
        }
        // firstItemSourceはJSON文字列化可能な値として保存
        try {
          debugInfo.firstItemSource = (firstItem as any).source ? JSON.parse(JSON.stringify((firstItem as any).source)) : undefined
        } catch (error) {
          debugInfo.firstItemSource = String((firstItem as any).source)
        }
        
        if (process.env.NODE_ENV === 'development' || debugMode) {
          console.log(`[API] RSS feed ${feedConfig.name}: ${feed.items.length} items found`)
          if (feedConfig.allowedDomains) {
            console.log(`[API] Domain filter enabled: ${feedConfig.allowedDomains.join(', ')}`)
          }
          if (debugMode) {
            console.log(`[API] First item structure for ${feedConfig.name}:`, {
              title: firstItem.title?.substring(0, 50),
              link: firstItem.link,
              source: (firstItem as any).source,
              itemKeys: Object.keys(firstItem),
            })
          }
        }
      }
      
      // rss-parserの結果をparsedItems形式に変換
      parsedItems = feed.items.map(item => ({
        title: item.title || '',
        link: item.link || '',
        pubDate: (item as any).isoDate || item.pubDate || (item as any).published || '', // isoDateを優先
        description: (item as { description?: string }).description || item.contentSnippet || undefined,
        sourceName: (item as any).source?.name || (item as any).source?._ || (typeof (item as any).source === 'string' ? (item as any).source : undefined),
        sourceUrl: (item as any).source?.url || (item as any).source?.['@_url'] || undefined,
        comments: (item as any).comments || undefined, // Yahoo Topics RSS用
        guid: (item as any).guid || (item as any).id || undefined, // RSS/Atom用
      }))
    }
    
    // Yahoo Topicsの場合、処理前のログを追加
    if (isYahooTopics && (process.env.NODE_ENV === 'development' || debugMode)) {
      console.log(`[API] Yahoo Topics: Starting to process ${parsedItems.length} parsed items`)
      console.log(`[API] Yahoo Topics: allowedDomains=${feedConfig.allowedDomains?.join(', ') || 'none'}`)
    }
    
    const articles: Article[] = []
    const yahooDebug: Array<{
      itemIndex: number
      itemLink: string
      resolvedOriginalUrl: string | null
      publisherHost: string | null
      debugInfo?: YahooOriginalInfo['debugInfo']
    }> = []
    
    // URL解決の統計（デバッグ用）
    const urlResolveStats = {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      timeoutCount: 0,
      hochiNewsCount: 0,
      errors: [] as Array<{ url?: string; errorType?: string; errorMessage?: string }>,
    }

    // Yahoo Topicsの場合は最大20件、その他は10件まで処理
    const maxItems = isYahooTopics ? 20 : 10
    for (const item of parsedItems.slice(0, maxItems)) {
      // Google News RSSの場合、item.linkを元記事URLに解決
      let resolvedUrl: string | null = null
      let articleLink = item.link
      let publisherHost: string | null = null // Yahoo Topics用
      
      if (isGoogleNews && item.link) {
        urlResolveStats.totalAttempts++
        try {
          // allowedDomainsを取得（フィード設定から、または空配列）
          const allowedDomains = feedConfig.allowedDomains || []
          resolvedUrl = await resolveGoogleNewsPublisherUrl(item.link, allowedDomains)
          if (resolvedUrl) {
            urlResolveStats.successCount++
            if (resolvedUrl.includes('hochi.news')) {
              urlResolveStats.hochiNewsCount++
            }
            articleLink = resolvedUrl // 解決されたURLを使用
            if (process.env.NODE_ENV === 'development' || debugMode) {
              const itemIndex = parsedItems.indexOf(item)
              if (itemIndex < 3 || (debugMode && itemIndex === 0)) {
                console.log(`[API] Resolved URL: ${item.link} -> ${resolvedUrl}`)
              }
            }
          } else {
            urlResolveStats.failureCount++
            // 解決失敗時はフォールバックでitem.linkを使用（既に設定済み）
            if (debugMode) {
              urlResolveStats.errors.push({
                url: item.link,
                errorType: 'No URL Resolved',
                errorMessage: 'resolveGoogleNewsPublisherUrl returned null',
              })
            }
            if (process.env.NODE_ENV === 'development' || debugMode) {
              const itemIndex = parsedItems.indexOf(item)
              if (itemIndex < 3 || (debugMode && itemIndex === 0)) {
                console.warn(`[API] Failed to resolve URL: ${item.link}, using as-is`)
              }
            }
          }
        } catch (error) {
          urlResolveStats.failureCount++
          const errorMessage = error instanceof Error ? error.message : String(error)
          const errorName = error instanceof Error ? error.name : 'Unknown'
          
          if (errorMessage.includes('timeout') || errorName === 'AbortError') {
            urlResolveStats.timeoutCount++
          }
          
          if (debugMode) {
            urlResolveStats.errors.push({
              url: item.link,
              errorType: errorName,
              errorMessage: errorMessage,
            })
          }
          
          if (process.env.NODE_ENV === 'development' || debugMode) {
            const itemIndex = parsedItems.indexOf(item)
            if (itemIndex < 3 || (debugMode && itemIndex === 0)) {
              console.warn(`[API] Error resolving URL ${item.link}:`, {
                name: errorName,
                message: errorMessage,
                stack: error instanceof Error ? error.stack : undefined,
              })
            }
          }
          // エラー時もフォールバックでitem.linkを使用
        }
      } else if (isYahooTopics && item.link) {
        // Yahoo Topicsの場合: Yahoo記事ページから元記事URLと配信元情報を抽出
        try {
          const allowedDomains = feedConfig.allowedDomains || []
          const itemIndex = parsedItems.indexOf(item)
          if (process.env.NODE_ENV === 'development' || debugMode) {
            console.log(`[API] Yahoo Topics item ${itemIndex + 1}/${parsedItems.length}: Processing yahoo=${item.link}`)
            console.log(`[API] Yahoo Topics item ${itemIndex + 1}: Allowed domains=[${allowedDomains.join(', ')}]`)
          }
          
          // debugModeのときのみdebugInfoを収集するため、debug引数をtrueにする
          const itemComments = (item as any).comments || undefined
          const itemGuid = (item as any).guid || undefined
          const info = await resolveYahooOriginalInfo(item.link, allowedDomains, debugMode, itemComments, itemGuid)
          resolvedUrl = info.originalUrl
          publisherHost = info.publisherHost // publisherHostを保存
          
          // debugModeのとき、yahooDebugに追加（Yahoo Topicsの場合、すべての記事を追加）
          if (debugMode && (isYahooTopics || yahooDebug.length < 5)) {
            yahooDebug.push({
              itemIndex: itemIndex + 1,
              itemLink: item.link,
              resolvedOriginalUrl: info.originalUrl,
              publisherHost: info.publisherHost,
              debugInfo: {
                ...info.debugInfo,
                commentsUrl: itemComments || null,
                guid: itemGuid || null,
              },
            })
          }
          
          if (resolvedUrl) {
            articleLink = resolvedUrl // 解決されたURLを使用
            if (process.env.NODE_ENV === 'development' || debugMode) {
              console.log(`[YahooResolve] Item ${itemIndex + 1} resolved: ${item.link} -> ${resolvedUrl}`)
            }
          } else if (info.publisherHost) {
            // originalUrlが取れなくても、publisherHostが取得できた場合は後続のドメインチェックで採用される
            // articleLinkはitem.link（Yahoo URL）のまま使用
            if (process.env.NODE_ENV === 'development' || debugMode) {
              console.log(`[YahooResolve] Item ${itemIndex + 1}: No originalUrl but publisherHost found: ${info.publisherHost}`)
              if (info.publisherName) {
                console.log(`[YahooResolve] Item ${itemIndex + 1}: Publisher name: ${info.publisherName}`)
              }
            }
          } else {
            // originalUrlもpublisherHostも取れない場合は後続のドメインチェックでスキップされる
            if (process.env.NODE_ENV === 'development' || debugMode) {
              console.warn(`[YahooResolve] Item ${itemIndex + 1} failed to resolve: ${item.link} (no originalUrl and no publisherHost)`)
            }
          }
          
          // デバッグモードでのログ出力
          if (debugMode || process.env.NODE_ENV === 'development') {
            console.log(`[YahooResolve] Item ${itemIndex + 1} info:`, {
              link: item.link,
              originalUrl: info.originalUrl || '(none)',
              publisherHost: info.publisherHost || '(none)',
              publisherName: info.publisherName || '(none)',
            })
          }
        } catch (error) {
          const itemIndex = parsedItems.indexOf(item)
          const errorMessage = error instanceof Error ? error.message : String(error)
          if (process.env.NODE_ENV === 'development' || debugMode) {
            console.error(`[YahooResolve] Item ${itemIndex + 1} error resolving ${item.link}:`, errorMessage)
          }
        }
      }
      // 日付をパース
      let dateStr = ''
      const pubDate = item.pubDate || ''
      if (pubDate) {
        const date = new Date(pubDate)
        if (!isNaN(date.getTime())) {
          dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
        } else {
          dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '.')
        }
      } else {
        dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '.')
      }

      // 画像URLを取得
      let imageUrl = '/placeholder.svg'
      let imageDebug: ImagePickResult | undefined = undefined
      
      if (isYahooTopics && resolvedUrl) {
        // Yahoo Topicsの場合: 解決されたURL（resolvedUrl）からOGP画像を取得
        const itemIndex = parsedItems.indexOf(item)
        if (process.env.NODE_ENV === 'development' || debugMode) {
          if (itemIndex < 3 || (debugMode && itemIndex === 0)) {
            console.log(`[API] Calling fetchOGPImage for Yahoo article ${itemIndex + 1} (resolved URL): ${resolvedUrl}`)
          }
        }
        try {
          const ogpImage = await fetchOGPImage(resolvedUrl, 8000)
          if (ogpImage && ogpImage !== '/placeholder.svg') {
            imageUrl = ogpImage
            if (process.env.NODE_ENV === 'development' || debugMode) {
              if (itemIndex < 3 || (debugMode && itemIndex === 0)) {
                console.log(`[API] OGP image found for Yahoo article ${itemIndex + 1}: ${ogpImage}`)
              }
            }
          }
        } catch (error) {
          if (process.env.NODE_ENV === 'development' || debugMode) {
            if (itemIndex < 3 || (debugMode && itemIndex === 0)) {
              console.warn(`[API] Failed to fetch OGP image for ${resolvedUrl}:`, error)
            }
          }
        }
      } else if (isGoogleNews) {
        // Google News RSSの場合: pickArticleImage関数で段階的に画像取得
        const itemIndex = parsedItems.indexOf(item)
        const allowedDomains = feedConfig.allowedDomains || []
        const timeoutMs = timeout || 10000
        
        const imageResult = await pickArticleImage({
          itemLink: item.link,
          resolvedUrl,
          allowedDomains,
          timeoutMs,
          debug: debugMode,
        })
        
        imageUrl = imageResult.imageUrl
        imageDebug = imageResult // デバッグモードで使用
      } else {
        // 通常のRSSの場合は既存のロジックを使用（ただし、itemはparsedItems形式なので簡略化）
        if (rawXmlContent && isAtomFeed) {
          // Atomフィードの場合のみ、XMLから画像を抽出
          const itemIndex = parsedItems.indexOf(item)
          if (itemIndex >= 0 && rawXmlContent) {
            const extractedUrl = extractImageUrlFromAtomXml(rawXmlContent, itemIndex)
            if (extractedUrl) {
              imageUrl = extractedUrl
            }
          }
        } else if (item.description) {
          // description内のimgタグから抽出
          const imgMatch = item.description.match(/<img[^>]+src=["']([^"']+)["']/i)
          if (imgMatch && imgMatch[1]) {
            imageUrl = imgMatch[1]
            // 相対パスの場合は絶対URLに変換
            if (imageUrl.startsWith('/')) {
              const feedUrlObj = new URL(feedConfig.url)
              imageUrl = `${feedUrlObj.protocol}//${feedUrlObj.host}${imageUrl}`
            } else if (!imageUrl.startsWith('http')) {
              const feedUrlObj = new URL(feedConfig.url)
              imageUrl = `${feedUrlObj.protocol}${imageUrl}`
            }
          }
        }
      }

      // ドメインフィルタ: allowedDomainsが指定されている場合、記事URLのドメインまたはitem.sourceUrlをチェック
      // デバッグモード用のドメイン判定情報を収集（最初のアイテムのみ）
      const itemIndex = parsedItems.indexOf(item)
      let domainCheckInfo: FeedDebugInfo['domainCheck'] | undefined = undefined
      if (debugMode && itemIndex === 0) {
        domainCheckInfo = {
          allowedDomains: feedConfig.allowedDomains,
        }
      }

      if (feedConfig.allowedDomains && feedConfig.allowedDomains.length > 0) {
        let isAllowed = false
        
        // ドメインチェック用のURLを決定（優先順位: resolvedUrl > articleLink > sourceUrl > item.link）
        const targetUrlForDomainCheck = resolvedUrl || articleLink || item.sourceUrl || item.link
        const itemSourceUrl = item.sourceUrl
        const itemSourceName = item.sourceName
        
        // デバッグ情報に記録（最初のアイテムのみ）
        if (debugMode && itemIndex === 0) {
          domainCheckInfo = {
            itemLink: item.link,
            itemSourceUrl: itemSourceUrl || '',
            itemSourceName: itemSourceName || '',
            allowedDomains: feedConfig.allowedDomains,
          }
        }
        
        if (process.env.NODE_ENV === 'development' || debugMode) {
          if (itemIndex < 3 || (debugMode && itemIndex === 0)) {
            console.log(`[API] Article ${itemIndex + 1} original URL: ${item.link}`)
            console.log(`[API] Article ${itemIndex + 1} resolved URL: ${resolvedUrl || '(none)'}`)
            console.log(`[API] Article ${itemIndex + 1} articleLink: ${articleLink}`)
            console.log(`[API] Article ${itemIndex + 1} source URL: ${itemSourceUrl || '(none)'}`)
            console.log(`[API] Article ${itemIndex + 1} source name: ${itemSourceName || '(none)'}`)
            console.log(`[API] Article ${itemIndex + 1} target URL for domain check: ${targetUrlForDomainCheck}`)
            console.log(`[API] Article ${itemIndex + 1} allowed domains: ${feedConfig.allowedDomains.join(', ')}`)
          }
        }
        
        // 優先: resolvedUrlまたはarticleLinkのドメインをチェック
        if (targetUrlForDomainCheck) {
          try {
            const checkUrl = new URL(targetUrlForDomainCheck)
            let checkDomain = checkUrl.hostname.toLowerCase()
            
            // ドメイン正規化（www.除去）
            if (checkDomain.startsWith('www.')) {
              checkDomain = checkDomain.substring(4)
            }
            
            // allowedDomainsも正規化してSet化
            const normalizedAllowedDomains = new Set(
              feedConfig.allowedDomains.map(d => {
                const normalized = d.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
                return normalized.startsWith('www.') ? normalized.substring(4) : normalized
              })
            )
            
            // Yahoo Topics RSSで解決前のURL（news.yahoo.co.jp）の処理
            if (isYahooTopics && checkDomain.includes('yahoo.co.jp') && !resolvedUrl) {
              // publisherHostがallowedDomainsに一致する場合は採用
              if (publisherHost) {
                const normalizedPublisherHost = publisherHost.toLowerCase().trim().startsWith('www.') 
                  ? publisherHost.toLowerCase().trim().substring(4) 
                  : publisherHost.toLowerCase().trim()
                
                if (normalizedAllowedDomains.has(normalizedPublisherHost)) {
                  // 採用: articleLinkはitem.link（Yahoo URL）のまま使用
                  // ドメインチェックはpublisherHostを使う
                  checkDomain = normalizedPublisherHost
                  isAllowed = true
                  
                  if (process.env.NODE_ENV === 'development' || debugMode) {
                    console.log(`[API] Article ${itemIndex + 1} (Yahoo Topics): Adopting with publisherHost: ${publisherHost}`)
                  }
                } else {
                  // publisherHostがallowedDomainsに一致しない場合はスキップ
                  if (process.env.NODE_ENV === 'development' || debugMode) {
                    console.warn(`[API] Article ${itemIndex + 1} (Yahoo Topics): publisherHost ${publisherHost} not in allowedDomains, skipping`)
                  }
                  continue
                }
              } else {
                // publisherHostも取得できない場合はスキップ
                if (process.env.NODE_ENV === 'development' || debugMode) {
                  console.warn(`[API] Article ${itemIndex + 1} (Yahoo Topics): No resolvedUrl and no publisherHost, skipping`)
                }
                continue
              }
            }
            
            // Google News RSSで解決前のURL（news.google.com）はスキップ
            if (isGoogleNews && checkDomain === 'news.google.com' && !resolvedUrl) {
              // sourceUrlでフォールバック
              if (itemSourceUrl) {
                try {
                  const sourceUrl = new URL(itemSourceUrl)
                  const sourceDomain = sourceUrl.hostname
                  isAllowed = feedConfig.allowedDomains.some(allowedDomain => {
                    return sourceDomain === allowedDomain || sourceDomain.endsWith(`.${allowedDomain}`)
                  })
                } catch (error) {
                  // sourceUrlのパース失敗時はスキップ
                  if (process.env.NODE_ENV === 'development' || debugMode) {
                    if (itemIndex < 3 || (debugMode && itemIndex === 0)) {
                      console.warn(`[API] Failed to parse source URL: ${itemSourceUrl}`)
                    }
                  }
                }
              } else {
                // sourceUrlも無い場合はスキップ
                if (process.env.NODE_ENV === 'development' || debugMode) {
                  console.warn(`[API] Article ${itemIndex + 1} (Google News): No resolvedUrl and no sourceUrl, skipping`)
                }
                continue
              }
            } else {
              // resolvedUrlまたは通常のRSSの場合（Yahoo TopicsでpublisherHostが採用された場合は既にisAllowedがtrue）
              if (!isAllowed) {
                isAllowed = normalizedAllowedDomains.has(checkDomain) || 
                  Array.from(normalizedAllowedDomains).some(allowedDomain => 
                    checkDomain.endsWith(`.${allowedDomain}`)
                  )
                
                if (process.env.NODE_ENV === 'development' || debugMode) {
                  if (itemIndex < 3 || (debugMode && itemIndex === 0)) {
                    console.log(`[API] Article ${itemIndex + 1} domain check: ${checkDomain} in allowedDomains = ${isAllowed}`)
                  }
                }
              }
              if (debugMode && itemIndex === 0 && domainCheckInfo) {
                domainCheckInfo.finalMatch = isAllowed
              }
            }
          } catch (error) {
            if (process.env.NODE_ENV === 'development' || debugMode) {
              if (itemIndex < 3 || (debugMode && itemIndex === 0)) {
                console.warn(`[API] Failed to parse target URL: ${targetUrlForDomainCheck}`, error)
              }
            }
          }
        }
        
        if (!isAllowed) {
          // フィルタにより除外
          if (process.env.NODE_ENV === 'development' || debugMode) {
            console.log(`[API] Article filtered by domain filter (target: ${targetUrlForDomainCheck}, allowed: ${feedConfig.allowedDomains.join(', ')})`)
          }
          continue // この記事をスキップ
        } else {
          if (debugMode && itemIndex === 0 && domainCheckInfo) {
            domainCheckInfo.finalMatch = true
          }
          if (process.env.NODE_ENV === 'development' || debugMode) {
            if (itemIndex < 3 || (debugMode && itemIndex === 0)) {
              console.log(`[API] Article ${itemIndex + 1} passed domain filter`)
            }
          }
        }
      }
      
      // デバッグ情報にドメイン判定情報を設定（最初のアイテムのみ）
      if (debugMode && itemIndex === 0 && domainCheckInfo) {
        debugInfo.domainCheck = domainCheckInfo
      }

      // キーワードフィルタは無効化（Yahoo!ニュースRSSなど、タイトル/説明文に媒体名が含まれないため）

      // 記事IDを生成（重複を避けるため、sourceも含める）
      // articleLinkを使用（解決されたURLが優先）
      const articleId = `${feedConfig.name}-${articleLink}` || `rss-${Date.now()}-${Math.random()}`

      const article: Article = {
        id: articleId,
        title: item.title || 'タイトルなし',
        date: dateStr,
        source: feedConfig.name, // feedのnameを使用
        image: imageUrl,
        link: articleLink, // 解決されたURLまたはフォールバック
        category: undefined, // parsedItems形式にはcategoryがない
        publishedAt: (item as any).isoDate || item.pubDate || (item as any).published || undefined,
      }
      
      // デバッグモードの場合のみimageDebugを追加
      if (debugMode && imageDebug) {
        article.imageDebug = {
          imageSource: imageDebug.imageSource,
          tried: imageDebug.tried,
        }
      }
      
      articles.push(article)
    }
    
    // デバッグ情報にURL解決統計を追加
    if (isGoogleNews && urlResolveStats.totalAttempts > 0) {
      debugInfo.urlResolve = {
        totalAttempts: urlResolveStats.totalAttempts,
        successCount: urlResolveStats.successCount,
        failureCount: urlResolveStats.failureCount,
        timeoutCount: urlResolveStats.timeoutCount,
        hochiNewsCount: urlResolveStats.hochiNewsCount,
      }
    }

    // デバッグ情報: 最終的な記事件数
    debugInfo.finalArticleCount = articles.length

    if (process.env.NODE_ENV === 'development' || debugMode) {
      console.log(`[API] Successfully fetched ${articles.length} articles from ${feedConfig.name}`)
      
      // Google News RSSの場合、フィルタ後のhochi.news記事数をログに出力
      if (isGoogleNews && feedConfig.allowedDomains && feedConfig.allowedDomains.length > 0) {
        const hochiCount = articles.filter(a => {
          // sourceUrlからhochi.newsをチェック（既にフィルタされているので、すべてhochi.newsのはず）
          return a.source?.includes('報知') || feedConfig.allowedDomains?.some(domain => domain.includes('hochi'))
        }).length
        console.log(`[API] Google News RSS (${feedConfig.name}): ${hochiCount} hochi.news articles after filter`)
      }
    }

    return { 
      articles, 
      debugInfo: debugMode ? debugInfo : undefined,
      yahooDebug: (debugMode && isYahooTopics) ? yahooDebug : undefined
    }
    } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    debugInfo.fetchOk = false
    debugInfo.error = errorMessage
    
    console.error(`[API] Error fetching RSS feed from ${feedConfig.name} (${feedConfig.url}):`, errorMessage)
    
    // より詳細なエラー情報をログに出力
    if (process.env.NODE_ENV === 'development' || debugMode) {
      if (error instanceof Error) {
        console.error(`[API] Error type: ${error.constructor.name}`)
        console.error(`[API] Error stack:`, error.stack)
        // ネットワークエラーの場合
        if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
          console.error(`[API] Network error: Unable to connect to ${feedConfig.url}`)
        }
        // HTTPエラーの場合
        if (errorMessage.includes('404') || errorMessage.includes('403') || errorMessage.includes('401')) {
          console.error(`[API] HTTP error: RSS feed URL may be invalid or requires authentication`)
        }
      }
    }
    return { 
      articles: [], 
      debugInfo: debugMode ? debugInfo : undefined,
      yahooDebug: undefined
    }
  }
}

/**
 * 全RSSフィードから記事を取得
 */
async function fetchAllRSSArticles(
  config: RSSFeedsConfig, 
  debugMode: boolean = false
): Promise<{ articles: Article[]; debugInfos?: FeedDebugInfo[]; yahooDebug?: Array<{
  itemIndex: number
  itemLink: string
  resolvedOriginalUrl: string | null
  publisherHost: string | null
  debugInfo?: YahooOriginalInfo['debugInfo']
}> }> {
  // disabled または enabled: false のフィードを除外
  const enabledFeeds = config.feeds.filter(feed => feed.enabled && !feed.disabled)
  const allArticles: Article[] = []
  const debugInfos: FeedDebugInfo[] = []
  const allYahooDebug: Array<{
    itemIndex: number
    itemLink: string
    resolvedOriginalUrl: string | null
    publisherHost: string | null
    debugInfo?: YahooOriginalInfo['debugInfo']
  }> = []

  if (process.env.NODE_ENV === 'development' || debugMode) {
    console.log(`[API] Fetching from ${enabledFeeds.length} RSS feeds`)
  }

  // 並列でRSSフィードを取得
  const fetchPromises = enabledFeeds.map(feed =>
    fetchArticlesFromRSS(feed, config.settings.timeout, debugMode)
  )

  const results = await Promise.allSettled(fetchPromises)

  let successCount = 0
  let failCount = 0
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value.articles)
      if (result.value.debugInfo) {
        debugInfos.push(result.value.debugInfo)
      }
      // yahooDebugを収集（Yahoo Topicsフィードの場合）
      if (result.value.yahooDebug) {
        allYahooDebug.push(...result.value.yahooDebug)
      }
      successCount++
      if (process.env.NODE_ENV === 'development' || debugMode) {
        console.log(`[API] Feed ${i + 1}/${enabledFeeds.length} (${enabledFeeds[i].name}): ${result.value.articles.length} articles`)
        // 報知の記事があるか確認
        if (enabledFeeds[i].name.includes('報知')) {
          const hochiArticles = result.value.articles.filter(a => a.source?.includes('報知'))
          console.log(`[API] 報知の記事数: ${hochiArticles.length} / ${result.value.articles.length}`)
          if (hochiArticles.length === 0 && result.value.articles.length > 0) {
            console.log(`[API] 報知の記事が0件ですが、フィードからは${result.value.articles.length}件取得しています。最初の記事:`, {
              title: result.value.articles[0]?.title?.substring(0, 50),
              source: result.value.articles[0]?.source,
            })
          }
        }
      }
    } else {
      failCount++
      if (debugMode) {
        // デバッグモードではエラーもdebugInfosに追加
        const errorDebugInfo: FeedDebugInfo = {
          feedName: enabledFeeds[i].name,
          feedUrl: enabledFeeds[i].url,
          fetchOk: false,
          finalArticleCount: 0,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        }
        debugInfos.push(errorDebugInfo)
      }
      if (process.env.NODE_ENV === 'development' || debugMode) {
        console.error(`[API] Feed ${i + 1}/${enabledFeeds.length} (${enabledFeeds[i].name}): FAILED`)
        const error = result.reason
        if (error instanceof Error) {
          console.error(`[API] Error message: ${error.message}`)
          console.error(`[API] Error stack:`, error.stack)
        } else {
          console.error(`[API] Error object:`, error)
        }
      }
    }
  }

  if (process.env.NODE_ENV === 'development' || debugMode) {
    console.log(`[API] RSS fetch summary: ${successCount} succeeded, ${failCount} failed, ${allArticles.length} total articles`)
    // 報知の記事数を確認
    const hochiArticles = allArticles.filter(a => a.source?.includes('報知'))
    console.log(`[API] 最終的な報知の記事数: ${hochiArticles.length} / ${allArticles.length}`)
    if (hochiArticles.length === 0 && allArticles.length > 0) {
      console.warn(`[API] ⚠️ 報知の記事が0件です。取得できた記事のソース:`, [...new Set(allArticles.map(a => a.source))])
    }
  }

  // 最終的な重複排除（resolvedUrlまたはlinkで一意にする）
  const beforeDedupCount = allArticles.length
  const seen = new Set<string>()
  const dedupedArticles: Article[] = []
  
  for (const a of allArticles) {
    // resolvedUrlがあればそれを使い、なければlinkを使う（保険）
    const key = (a.link || '').toLowerCase().trim()
    if (!key) continue
    if (seen.has(key)) {
      if (process.env.NODE_ENV === 'development' || debugMode) {
        console.log(`[API] Dedup: Skipping duplicate article: ${a.title?.substring(0, 50)} (key: ${key.substring(0, 80)})`)
      }
      continue
    }
    seen.add(key)
    dedupedArticles.push(a)
  }
  
  if (process.env.NODE_ENV === 'development' || debugMode) {
    console.log(`[API] Dedup: before=${beforeDedupCount}, after=${dedupedArticles.length}`)
  }

  // 日付でソート（新しい順）
  if (process.env.NODE_ENV === 'development' || debugMode) {
    const hochiBeforeSort = dedupedArticles.filter(a => a.source?.includes('報知')).length
    console.log(`[API] Before sort: ${dedupedArticles.length} total articles, ${hochiBeforeSort} hochi articles`)
  }
  
  dedupedArticles.sort((a, b) => {
    // publishedAt（ISO形式、時刻情報あり）を優先し、なければdate（日付のみ）を使用
    let timeA: number
    let timeB: number
    
    if (a.publishedAt) {
      timeA = new Date(a.publishedAt).getTime()
    } else if (a.date) {
      // dateフィールドは日付のみなので、その日の0時0分として扱う
      timeA = new Date(a.date.replace(/\./g, '-')).getTime()
    } else {
      timeA = 0 // 日付情報がない場合は最後に配置
    }
    
    if (b.publishedAt) {
      timeB = new Date(b.publishedAt).getTime()
    } else if (b.date) {
      timeB = new Date(b.date.replace(/\./g, '-')).getTime()
    } else {
      timeB = 0
    }
    
    // 新しい順（降順）
    return timeB - timeA
  })

  // 最大記事数を制限
  const limitedArticles = dedupedArticles.slice(0, config.settings.maxArticles)
  
  if (process.env.NODE_ENV === 'development' || debugMode) {
    const hochiAfterSort = limitedArticles.filter(a => a.source?.includes('報知')).length
    const hochiTotalAfterSort = allArticles.filter(a => a.source?.includes('報知')).length
    console.log(`[API] After sort & limit: ${limitedArticles.length} articles returned, ${hochiAfterSort} hochi articles in result (${hochiTotalAfterSort} hochi articles in total)`)
    if (hochiTotalAfterSort > 0 && hochiAfterSort === 0) {
      console.warn(`[API] ⚠️ 報知の記事は${hochiTotalAfterSort}件ありますが、maxArticles制限(${config.settings.maxArticles})により除外されています`)
    }
  }
  
  return {
    articles: limitedArticles,
    debugInfos: debugMode ? debugInfos : undefined,
    yahooDebug: (debugMode && allYahooDebug.length > 0) ? allYahooDebug : undefined,
  }
}

/**
 * Phase 1: JSONファイルから記事を取得
 */
function loadArticlesFromJson(): Article[] {
  const jsonPath = findArticlesJson()

  if (!jsonPath) {
    return []
  }

  try {
    const jsonContent = fs.readFileSync(jsonPath, 'utf-8')
    const articles: Article[] = JSON.parse(jsonContent)
    return articles
  } catch (error) {
    console.error('[API] Error loading articles from JSON:', error)
    return []
  }
}

export async function GET(request: Request) {
  try {
    // レート制限対策: リクエスト内の解決件数カウンターをリセット
    resetResolveCountInRequest()
    
    // デバッグモードのチェック
    const url = new URL(request.url)
    const debugMode = url.searchParams.get('debug') === '1'
    const clearCacheParam = url.searchParams.get('clearCache') === '1'

    // キャッシュクリアリクエスト
    if (clearCacheParam) {
      clearCache()
      if (process.env.NODE_ENV === 'development') {
        console.log('[API] Cache cleared by request parameter')
      }
    }

    const rssConfig = loadRSSFeedsConfig()
    const now = Date.now()

    // デバッグモードまたはキャッシュクリア後はキャッシュをスキップ
    if (!debugMode && !clearCacheParam && process.env.NODE_ENV === 'production' && cachedArticles && cacheTimestamp > 0) {
      const cacheAge = now - cacheTimestamp
      const cacheDuration = rssConfig?.settings.cacheDuration || 3600000 // デフォルト1時間

      if (cacheAge < cacheDuration) {
        return NextResponse.json(cachedArticles)
      }
    }

    let articles: Article[] = []
    let debugInfos: FeedDebugInfo[] | undefined = undefined
    let yahooDebug: Array<{
      itemIndex: number
      itemLink: string
      resolvedOriginalUrl: string | null
      publisherHost: string | null
      debugInfo?: YahooOriginalInfo['debugInfo']
    }> | undefined = undefined
    let dmenuDebug: DmenuDebugInfo | undefined = undefined
    let auoneDebug: AuoneDebugInfo | undefined = undefined

    // Phase 2.5: dmenuからニュース記事を取得
    console.log("FETCH START: dmenu fetchDmenuNews called", { ts: new Date().toISOString() })
    if (process.env.NODE_ENV === 'development' || debugMode) {
      console.log('[API] Fetching articles from dmenu...')
    }
    try {
      const dmenuResult = await fetchDmenuNews(debugMode)
      console.log("FETCH GOT RESPONSE: dmenu fetchDmenuNews completed", { articleCount: dmenuResult.articles.length, ts: new Date().toISOString() })
      
      // dmenuのNormalizedArticleをArticle型に変換
      const dmenuArticles: Article[] = dmenuResult.articles.map((item, index) => {
        // publishedAt (ISO形式) から date (YYYY.MM.DD) を生成
        let dateStr = ''
        try {
          const date = new Date(item.publishedAt)
          if (!isNaN(date.getTime())) {
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            dateStr = `${year}.${month}.${day}`
          }
        } catch (error) {
          // パース失敗時は現在日付を使用
          const now = new Date()
          dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
        }

        return {
          id: `dmenu-${item.url}`,
          title: item.title,
          date: dateStr,
          source: item.sourceName,
          image: item.imageUrl,
          link: item.url,
          publishedAt: item.publishedAt,
        }
      })

      articles = articles.concat(dmenuArticles)
      if (dmenuResult.debugInfo) {
        dmenuDebug = dmenuResult.debugInfo
      }
    } catch (error) {
      console.error('[API] Failed to fetch dmenu news:', error)
      // エラー時はスキップ（dmenu記事が取得できなくても他を継続）
    }

    // Phase 2.6: auone.jpからニュース記事を取得
    console.log("FETCH START: auone fetchAuoneNews called", { ts: new Date().toISOString() })
    if (process.env.NODE_ENV === 'development' || debugMode) {
      console.log('[API] Fetching articles from auone.jp...')
    }
    try {
      const auoneResult = await fetchAuoneNews(debugMode)
      console.log("FETCH GOT RESPONSE: auone fetchAuoneNews completed", { articleCount: auoneResult.articles.length, ts: new Date().toISOString() })
      
      // auoneのAuoneArticleをArticle型に変換
      // 画像取得は並列処理で効率化（最大5件まで同時に処理）
      const auoneArticlesPromises = auoneResult.articles.map(async (item) => {
        // publishedAt (ISO形式) から date (YYYY.MM.DD) を生成
        let dateStr = ''
        try {
          const date = new Date(item.publishedAt)
          if (!isNaN(date.getTime())) {
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            dateStr = `${year}.${month}.${day}`
          }
        } catch (error) {
          // パース失敗時は現在日付を使用
          const now = new Date()
          dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
        }

        // 画像URLを取得（auone.jpの記事ページからOGP画像を取得）
        let imageUrl = '/placeholder.svg'
        try {
          if (process.env.NODE_ENV === 'development' || debugMode) {
            if (auoneResult.articles.indexOf(item) < 3) {
              console.log(`[API] Fetching OGP image for auone article: ${item.url}`)
            }
          }
          const ogpImage = await fetchOGPImage(item.url, 8000)
          if (ogpImage && ogpImage !== '/placeholder.svg') {
            imageUrl = ogpImage
            if (process.env.NODE_ENV === 'development' || debugMode) {
              if (auoneResult.articles.indexOf(item) < 3) {
                console.log(`[API] OGP image found for auone article: ${ogpImage}`)
              }
            }
          }
        } catch (error) {
          // 画像取得エラーは無視（placeholderのまま）
          if (process.env.NODE_ENV === 'development' || debugMode) {
            if (auoneResult.articles.indexOf(item) < 3) {
              console.warn(`[API] Failed to fetch OGP image for auone article ${item.url}:`, error instanceof Error ? error.message : String(error))
            }
          }
        }

        return {
          id: `auone-${item.url}`,
          title: item.title,
          date: dateStr,
          source: item.source || 'auone.jp',
          image: imageUrl,
          link: item.url,
          publishedAt: item.publishedAt,
        }
      })

      // 並列処理を実行（ただし、最初の5件のみ並列、残りは順次処理でリソース節約）
      const auoneArticles: Article[] = []
      const batchSize = 5
      for (let i = 0; i < auoneArticlesPromises.length; i += batchSize) {
        const batch = auoneArticlesPromises.slice(i, i + batchSize)
        const batchResults = await Promise.all(batch)
        auoneArticles.push(...batchResults)
      }

      articles = articles.concat(auoneArticles)
      if (auoneResult.debugInfo) {
        auoneDebug = auoneResult.debugInfo
      }
    } catch (error) {
      console.error('[API] Failed to fetch auone news:', error)
      // エラー時はスキップ（auone記事が取得できなくても他を継続）
    }

    // Phase 2: RSSフィードから取得を試みる
    if (rssConfig && rssConfig.feeds.some(feed => feed.enabled)) {
      if (process.env.NODE_ENV === 'development' || debugMode) {
        console.log('[API] Fetching articles from RSS feeds...')
      }
      const result = await fetchAllRSSArticles(rssConfig, debugMode)
      articles = articles.concat(result.articles) // dmenu記事にRSS記事を追加
      debugInfos = result.debugInfos
      yahooDebug = result.yahooDebug
    }

    // デバッグモードの場合はデバッグ情報と記事配列の両方を返す
    if (debugMode) {
      return NextResponse.json({
        mode: 'debug',
        articles, // ★追加: 必ず記事配列を返す
        feeds: debugInfos || [],
        yahooDebug: yahooDebug || undefined,
        dmenuDebug: dmenuDebug || undefined,
        auoneDebug: auoneDebug || undefined,
        summary: {
          totalFeeds: debugInfos?.length || 0,
          successCount: debugInfos?.filter(d => d.fetchOk).length || 0,
          failCount: debugInfos?.filter(d => !d.fetchOk).length || 0,
          totalArticles: articles.length,
        },
      })
    }

    // RSSフィードから取得できなかった場合、Phase 1のJSONファイルにフォールバック
    if (articles.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[API] No articles from RSS, falling back to JSON file')
      }
      articles = loadArticlesFromJson()
    }

    // 日付でソート（新しい順）
    // publishedAt（ISO形式、時刻情報あり）を優先し、なければdate（日付のみ）を使用
    articles.sort((a, b) => {
      // publishedAtを優先（時刻情報を含むため正確）
      let timeA: number
      let timeB: number
      
      if (a.publishedAt) {
        timeA = new Date(a.publishedAt).getTime()
      } else if (a.date) {
        // dateフィールドは日付のみなので、その日の0時0分として扱う
        timeA = new Date(a.date.replace(/\./g, '-')).getTime()
      } else {
        timeA = 0 // 日付情報がない場合は最後に配置
      }
      
      if (b.publishedAt) {
        timeB = new Date(b.publishedAt).getTime()
      } else if (b.date) {
        timeB = new Date(b.date.replace(/\./g, '-')).getTime()
      } else {
        timeB = 0
      }
      
      // 新しい順（降順）
      return timeB - timeA
    })

    // キャッシュを更新
    cachedArticles = articles
    cacheTimestamp = now

    // 開発環境ではデバッグ情報も含める（source別の記事件数）
    if (process.env.NODE_ENV === 'development') {
      const sourceCount: Record<string, number> = {}
      articles.forEach(a => {
        sourceCount[a.source] = (sourceCount[a.source] || 0) + 1
      })
      console.log('[API] Final articles by source:', sourceCount)
      const hochiCount = Object.entries(sourceCount).reduce((sum, [source, count]) => {
        return sum + (source.includes('報知') ? count : 0)
      }, 0)
      console.log('[API] 最終的な報知の記事数:', hochiCount, '件')
    }

    return NextResponse.json(articles)
  } catch (error) {
    console.error('[API] Error loading articles:', error)
    
    // エラー時はPhase 1のJSONファイルにフォールバック
    const fallbackArticles = loadArticlesFromJson()
    return NextResponse.json(fallbackArticles)
  }
}
