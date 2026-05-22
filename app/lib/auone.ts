/**
 * article.auone.jp からプロ野球ニュース記事を取得するモジュール
 * 
 * Phase 1: HTMLパース実装
 * - 初期HTMLから記事を取得
 * - リストアイテム（<li>）からタイトル、リンク、日付、ソースを抽出
 */

export interface AuoneArticle {
  title: string
  url: string
  date: string
  source: string
  publishedAt: string // ISO形式
}

export interface AuoneDebugInfo {
  baseUrl: string
  htmlLength: number
  extractedCount: number
  sampleArticles: Array<{
    title: string
    url: string
    date: string
    source: string
  }>
  errors?: string[]
}

const AUONE_BASE_URL = 'https://article.auone.jp/keyword/article/1'

/**
 * HTMLから記事情報を抽出
 */
function extractArticlesFromHtml(html: string): AuoneArticle[] {
  const articles: AuoneArticle[] = []
  const errors: string[] = []

  try {
    // リストアイテム（<li>）から記事情報を抽出
    const listItemPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let match

    while ((match = listItemPattern.exec(html)) !== null) {
      try {
        const itemHtml = match[1]
        
        // リンクを抽出
        const linkMatch = itemHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
        if (!linkMatch) {
          continue
        }

        let link = linkMatch[1]
        // 相対URLを絶対URLに変換
        if (link.startsWith('/')) {
          link = `https://article.auone.jp${link}`
        } else if (!link.startsWith('http')) {
          continue // 無効なリンク
        }

        // auone.jpの記事ページのみを対象
        if (!link.includes('article.auone.jp/detail')) {
          continue
        }

        // HTML構造:
        // <a href="...">
        //   <div class="news__thumbnail">...</div>
        //   <div class="news__content">
        //     <p class="news__title">タイトル</p>
        //     <p class="news__date">
        //       <span>01/19 18:47</span>
        //       <span class="news__service-name">ソース名</span>
        //     </p>
        //   </div>
        // </a>

        // 日付を抽出（MM/DD HH:mm形式）
        const dateMatch = itemHtml.match(/(\d{2}\/\d{2}\s+\d{2}:\d{2})/)
        const date = dateMatch ? dateMatch[1] : ''

        // ソースを抽出（<span class="news__service-name">から）
        let source = ''
        const sourceMatch = itemHtml.match(/<span\s+class=["']news__service-name["'][^>]*>([^<]+)<\/span>/i)
        if (sourceMatch) {
          source = sourceMatch[1].trim()
        } else {
          // フォールバック: 日付の後のテキストから抽出
          if (dateMatch) {
            const afterDate = itemHtml.substring((dateMatch.index ?? 0) + dateMatch[0].length)
            const cleanAfterDate = afterDate.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            const fallbackSourceMatch = cleanAfterDate.match(/^([A-Za-z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s\-\.]+)/)
            if (fallbackSourceMatch) {
              source = fallbackSourceMatch[1].trim()
              source = source.replace(/^[\/\s<>]+|[\/\s<>]+$/g, '').trim()
            }
          }
        }

        // タイトルを抽出（<p class="news__title">から、またはリンクテキストから）
        let title = ''
        const titleMatch = itemHtml.match(/<p\s+class=["']news__title["'][^>]*>([^<]+)<\/p>/i)
        if (titleMatch) {
          title = titleMatch[1].trim()
        } else {
          // フォールバック: リンクテキストから抽出
          title = linkMatch[2].replace(/<[^>]+>/g, '').trim()
          title = title.replace(/\s+/g, ' ').trim()
          
          // タイトルから日付とソースを除去（もし含まれている場合）
          if (date && source) {
            const dateSourcePattern = new RegExp(`\\s*${date.replace(/\//g, '\\/')}\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')
            title = title.replace(dateSourcePattern, '').trim()
          } else if (date) {
            const datePattern = new RegExp(`\\s*${date.replace(/\//g, '\\/')}\\s*$`, 'i')
            title = title.replace(datePattern, '').trim()
          }
        }

        // タイトルが空の場合はスキップ
        if (!title || title.length < 5) {
          continue
        }

        // 日付をISO形式に変換
        let publishedAt = ''
        if (date) {
          try {
            // MM/DD HH:mm形式をパース
            const [datePart, timePart] = date.split(' ')
            const [month, day] = datePart.split('/')
            const [hour, minute] = timePart.split(':')
            
            // 現在の年を取得
            const currentYear = new Date().getFullYear()
            const dateObj = new Date(currentYear, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute))
            
            if (!isNaN(dateObj.getTime())) {
              publishedAt = dateObj.toISOString()
            }
          } catch (error) {
            // 日付パース失敗時は現在時刻を使用
            publishedAt = new Date().toISOString()
          }
        } else {
          publishedAt = new Date().toISOString()
        }

        articles.push({
          title,
          url: link,
          date,
          source,
          publishedAt,
        })
      } catch (error) {
        errors.push(`Failed to parse list item: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
    }

    // 重複を除去（同じURLの記事は1つだけ）
    const uniqueArticles = articles.filter((article, index, self) =>
      index === self.findIndex(a => a.url === article.url)
    )

    return uniqueArticles
  } catch (error) {
    errors.push(`Failed to extract articles: ${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}

/**
 * auone.jpからプロ野球ニュース記事を取得
 * 
 * @param debugMode デバッグモード（デバッグ情報を返す）
 * @returns 記事の配列とデバッグ情報
 */
export async function fetchAuoneNews(debugMode: boolean = false): Promise<{
  articles: AuoneArticle[]
  debugInfo?: AuoneDebugInfo
}> {
  const debugInfo: AuoneDebugInfo = {
    baseUrl: AUONE_BASE_URL,
    htmlLength: 0,
    extractedCount: 0,
    sampleArticles: [],
  }

  try {
    console.log('[Auone] Fetching from:', AUONE_BASE_URL)
    
    // HTMLを取得
    const response = await fetch(AUONE_BASE_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      // Next.jsのfetchは自動的にタイムアウトを処理
      next: { revalidate: 300 }, // 5分間キャッシュ
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const html = await response.text()
    debugInfo.htmlLength = html.length

    console.log(`[Auone] HTML取得成功: ${html.length} bytes`)

    // HTMLから記事情報を抽出
    const articles = extractArticlesFromHtml(html)
    debugInfo.extractedCount = articles.length
    debugInfo.sampleArticles = articles.slice(0, 3).map(a => ({
      title: a.title,
      url: a.url,
      date: a.date,
      source: a.source,
    }))

    console.log(`[Auone] 記事抽出成功: ${articles.length}件`)

    return {
      articles,
      debugInfo: debugMode ? debugInfo : undefined,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[Auone] Failed to fetch news:', errorMessage)
    
    if (debugMode) {
      debugInfo.errors = [errorMessage]
    }

    // エラー時は空配列を返す（500エラーにしない）
    return {
      articles: [],
      debugInfo: debugMode ? debugInfo : undefined,
    }
  }
}

