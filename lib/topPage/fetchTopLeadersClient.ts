/**
 * トップページ（クライアント）用リーダー取得。
 * 2026 は事前生成 JSON を優先し、無いときだけ API にフォールバック。
 */

import type { LeadersConfig } from "@/lib/ranking/leadersTypes"
import { fetchJsonCached } from "@/lib/topPage/fetchJsonCached"
import {
  topLeadersSnapshotPublicUrl,
  TOP_LEADERS_SNAPSHOT_YEAR,
  type TopLeadersCategory,
} from "@/lib/topPage/leadersSnapshotShared"

async function fetchLeadersJson(url: string): Promise<LeadersConfig> {
  const data = await fetchJsonCached<LeadersConfig & { error?: string }>(url)
  if (data.error) throw new Error(data.error)
  return data
}

export async function fetchTopLeadersForPage(
  year: string | number,
  league: string,
  category: TopLeadersCategory
): Promise<LeadersConfig> {
  const yearStr = String(year)
  const upperLeague = league.toUpperCase()

  if (yearStr === TOP_LEADERS_SNAPSHOT_YEAR) {
    if (category === "pitching") {
      return fetchLeadersJson(`/api/pitching-leaders/${yearStr}/${upperLeague}`)
    }
    const snapshotUrl = topLeadersSnapshotPublicUrl(yearStr, upperLeague, category)
    try {
      const fromSnapshot = await fetchLeadersJson(snapshotUrl)
      if (Object.keys(fromSnapshot.leaders ?? {}).length > 0) {
        return fromSnapshot
      }
    } catch {
      /* API へ */
    }
    const apiUrl =
      category === "batting"
        ? `/api/leaders/${yearStr}/${upperLeague}`
        : `/api/pitching-leaders/${yearStr}/${upperLeague}`
    return fetchLeadersJson(apiUrl)
  }

  if (category === "pitching") {
    return fetchLeadersJson(`/api/pitching-leaders/${yearStr}/${upperLeague}`)
  }
  return fetchLeadersJson(`/api/leaders/${yearStr}/${upperLeague}`)
}
