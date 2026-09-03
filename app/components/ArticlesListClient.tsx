/**
 * クライアントコンポーネント: 記事リストを表示
 */

"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { SectionLoadingSpinner } from "@/components/ui/spinner"

export type Article = {
  id: number | string
  title: string
  date: string
  source: string
  image: string
  link: string
  category?: string
  publishedAt?: string
  // Google News RSS用の追加フィールド
  sourceUrl?: string
  sourceName?: string
}

/**
 * sourceフィールドを正規化（Google News対策）
 */
function normalizeSource(item: any): { source: string; sourceUrl?: string; sourceName?: string } {
  // sourceUrl候補を順に試す
  const sourceUrl = 
    item.sourceUrl || 
    item.source?.url || 
    item.source?.["@_url"] || 
    item.source?.$?.url || 
    undefined
  
  // sourceName候補を順に試す
  const sourceName = 
    item.sourceName || 
    item.source?.name || 
    item.source?.["#text"] || 
    (typeof item.source === 'string' ? item.source : undefined) || 
    ''
  
  // sourceフィールド（表示用）
  const source = item.source || item.sourceName || sourceName || '不明'
  
  return {
    source: typeof source === 'string' ? source : String(source),
    sourceUrl,
    sourceName,
  }
}

/**
 * 日付を正規化（パース失敗時も記事を落とさない）
 */
function normalizeDate(item: any): string {
  const dateStr = item.date || item.pubDate || item.publishedAt || ''
  if (!dateStr) return ''
  
  // 既に"YYYY.MM.DD"形式ならそのまま
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(dateStr)) {
    return dateStr
  }
  
  // ISO形式やその他の形式をパース
  const timestamp = Date.parse(item.isoDate || item.pubDate || item.publishedAt || dateStr)
  if (!isNaN(timestamp)) {
    const date = new Date(timestamp)
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
  }
  
  // パース失敗時も空文字を返す（記事自体は表示する）
  return dateStr || ''
}

export default function ArticlesListClient() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rawData, setRawData] = useState<any[]>([]) // デバッグ用：元のデータを保持
  const [debugNews, setDebugNews] = useState(false)
  
  // URLパラメータからdebugNewsを取得（クライアント側で）
  // SSRを避けるため、useEffectで取得
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const isDebugNews = params.get('debugNews') === '1'
      setDebugNews(isDebugNews)
      
      if (process.env.NODE_ENV === 'development' && isDebugNews) {
        console.log('[ArticlesListClient] DebugNews mode enabled')
      }
    }
  }, [])

  useEffect(() => {
    // APIルートから記事データを取得
    if (process.env.NODE_ENV === 'development') {
      console.log('[ArticlesListClient] Fetching: /api/articles')
    }
    fetch('/api/articles')
      .then(res => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[ArticlesListClient] Response status:', res.status)
        }
        if (!res.ok) {
          return res.json().then(errData => {
            throw new Error(errData.error || `HTTP error! status: ${res.status}`)
          })
        }
        return res.json()
      })
      .then(data => {
        // レスポンス形式の正規化（配列 or {articles: 配列} の両方を受け付ける）
        const raw = data
        const arr = Array.isArray(raw)
          ? raw
          : (raw && Array.isArray(raw.articles) ? raw.articles : null)
        
        // レスポンス形式をログに出力（事故防止）
        if (process.env.NODE_ENV === 'development') {
          const responseShape = Array.isArray(raw) ? 'array' : (raw as any)?.mode || typeof raw
          console.log('[ArticlesListClient] Response shape:', responseShape)
        }
        
        if (!arr) {
          console.error('[ArticlesListClient] Invalid response shape:', raw)
          console.error('[ArticlesListClient] Response type:', typeof raw)
          console.error('[ArticlesListClient] Response mode:', (raw as any)?.mode || '(none)')
          setArticles([])
          setLoading(false)
          return
        }
        
        // デバッグ用：元のデータを保持
        setRawData(arr)
        
        const rawCount = arr.length
        
        // 報知記事の判定（title, link, sourceUrl, source に 'hochi' が含まれるか）
        const hochiCount = arr.filter((a: any) => {
          const searchText = `${a.title || ''} ${a.link || ''} ${a.sourceUrl || ''} ${a.source || ''}`.toLowerCase()
          return searchText.includes('hochi') || searchText.includes('報知')
        }).length
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[ArticlesListClient] Data received:', {
            isArray: Array.isArray(raw),
            responseShape: Array.isArray(raw) ? 'array' : (raw as any)?.mode || typeof raw,
            dataType: typeof raw,
            rawCount,
            hochiCount,
            firstItem: arr.length > 0 ? JSON.stringify(arr[0], null, 2) : null,
          })
          
          // 報知記事の詳細を確認
          if (hochiCount > 0) {
            const hochiArticles = arr.filter((a: any) => {
              const searchText = `${a.title || ''} ${a.link || ''} ${a.sourceUrl || ''} ${a.source || ''}`.toLowerCase()
              return searchText.includes('hochi') || searchText.includes('報知')
            })
            console.log('[ArticlesListClient] Hochi articles found:', hochiArticles.map((a: any) => ({
              title: a.title?.substring(0, 50),
              source: a.source,
              sourceUrl: a.sourceUrl,
              link: a.link,
            })))
          }
          // 画像URLの詳細を確認
          if (arr.length > 0) {
            console.log('[ArticlesListClient] Image URLs check:', arr.slice(0, 5).map((a: any) => ({
              title: a.title?.substring(0, 30),
              image: a.image,
              imageType: typeof a.image,
              imageLength: a.image?.length,
              isPlaceholder: a.image === '/placeholder.svg',
              hasValidUrl: a.image && a.image.startsWith('http')
            })))
          }
          // デバッグ: ソースごとの記事数を確認
          if (arr.length > 0) {
            const sourceCount: Record<string, number> = {}
            arr.forEach((a: Article) => {
              sourceCount[a.source] = (sourceCount[a.source] || 0) + 1
            })
            console.log('[ArticlesListClient] Articles by source:', sourceCount)
            // 報知の記事を明示的に表示
            const hochiArticleCount = Object.entries(sourceCount).reduce((sum, [source, count]) => {
              return sum + (source.includes('報知') ? count : 0)
            }, 0)
            console.log('[ArticlesListClient] 報知の記事数:', hochiArticleCount, '件')
            if (hochiArticleCount === 0) {
              console.warn('[ArticlesListClient] ⚠️ 報知の記事が0件です。ソース一覧:', Object.keys(sourceCount))
            }
          } else {
            console.warn('[ArticlesListClient] ⚠️ 記事データが空です。arr:', arr)
          }
        }
        
        // 記事を正規化
        const normalizedArticles: Article[] = arr.map((item: any) => {
          const normalized = normalizeSource(item)
          const normalizedDate = normalizeDate(item)
          
          return {
            id: item.id || `${item.link}-${item.title}` || `article-${Date.now()}-${Math.random()}`,
            title: item.title || 'タイトルなし',
            date: normalizedDate,
            source: normalized.source,
            image: item.image || '/placeholder.svg',
            link: item.link || '#',
            category: item.category,
            publishedAt: item.publishedAt || item.pubDate,
            sourceUrl: normalized.sourceUrl,
            sourceName: normalized.sourceName,
          }
        })
        
        // 重複排除（sourceUrl + title + date をキーにする）
        const deduplicatedArticles = normalizedArticles.filter((article, index, self) => {
          const key = `${article.sourceUrl || article.link}|${article.title}|${article.date}`
          return index === self.findIndex(a => {
            const aKey = `${a.sourceUrl || a.link}|${a.title}|${a.date}`
            return aKey === key
          })
        })
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[ArticlesListClient] Normalized articles:', {
            rawCount: arr.length,
            normalizedCount: normalizedArticles.length,
            deduplicatedCount: deduplicatedArticles.length,
            removedDuplicates: normalizedArticles.length - deduplicatedArticles.length,
          })
        }
        
        setArticles(deduplicatedArticles)
        setLoading(false)
      })
      .catch(err => {
        console.error('[ArticlesListClient] Error fetching articles:', err)
        setError(err.message || '記事の取得に失敗しました')
        setLoading(false)
      })
  }, [])

  // デバッグ情報の計算（Hooksは常に同じ順序で呼び出される必要があるため、早期リターンの前に配置）
  const debugInfo = useMemo(() => {
    // debugNewsが明示的にtrueでない場合はnullを返す
    if (debugNews !== true) return null
    
    const rawCount = rawData.length
    const renderedCount = articles.length
    
    // source別の件数を集計
    const sourceCount: Record<string, number> = {}
    articles.forEach(article => {
      const sourceKey = article.source || '不明'
      sourceCount[sourceKey] = (sourceCount[sourceKey] || 0) + 1
    })
    
    // sourceUrlのドメイン別件数を集計
    const domainCount: Record<string, number> = {}
    articles.forEach(article => {
      try {
        const domain = article.sourceUrl ? new URL(article.sourceUrl).hostname : new URL(article.link).hostname
        domainCount[domain] = (domainCount[domain] || 0) + 1
      } catch {
        domainCount['unknown'] = (domainCount['unknown'] || 0) + 1
      }
    })
    
    // 報知記事の件数
    const hochiCount = articles.filter(a => {
      const searchText = `${a.title || ''} ${a.link || ''} ${a.sourceUrl || ''} ${a.source || ''}`.toLowerCase()
      return searchText.includes('hochi') || searchText.includes('報知')
    }).length
    
    return {
      rawCount,
      renderedCount,
      sourceCount,
      domainCount,
      hochiCount,
    }
  }, [debugNews, rawData, articles])

  // 早期リターン（Hooksの後に配置）
  if (loading) {
    return <SectionLoadingSpinner />
  }

  if (error) {
    return (
      <div className="text-red-500 text-center py-8">エラー: {error}</div>
    )
  }

  if (articles.length === 0) {
    return (
      <div className="text-gray-400 text-center py-8">記事がありません。</div>
    )
  }

  return (
    <div className="space-y-2">
      {articles.map((article, index) => (
        <Link
          key={`${article.id}-${index}`}
          href={article.link}
          className="flex gap-2 site-bg border border-[#333] p-1.5 hover:bg-[#2a2a2a] transition-colors"
        >
          <img
            src={article.image || "/placeholder.svg"}
            alt={article.title}
            className="w-20 h-16 object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-white text-sm font-semibold line-clamp-2 mb-0.5">{article.title}</h3>
            <div className="flex items-center gap-2 text-[10px] text-[#999]">
              <span className="latin">{article.date}</span>
              {article.publishedAt && (() => {
                try {
                  const date = new Date(article.publishedAt)
                  if (!isNaN(date.getTime())) {
                    // JST時刻を取得（UTC+9時間）
                    const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000))
                    const hours = String(jstDate.getUTCHours()).padStart(2, '0')
                    const minutes = String(jstDate.getUTCMinutes()).padStart(2, '0')
                    return (
                      <>
                        <span>|</span>
                        <span className="latin tabular-nums">{hours}:{minutes}</span>
                      </>
                    )
                  }
                } catch (error) {
                  // パースエラーは無視
                }
                return null
              })()}
              <span>|</span>
              <span>{article.source}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

