/**
 * top-leaders スナップショットの R2 / プロキシ取得（fs なし）。
 * API Route から import してもバンドルが壊れないよう leadersSnapshot2026 とは分離。
 */

import type { LeadersConfig } from "@/lib/ranking/leadersTypes"
import { fetchDisplayJsonServer } from "@/lib/ranking/fetchDisplayJsonServer"
import {
  topLeadersSnapshotPublicUrl,
  type TopLeadersCategory,
} from "@/lib/topPage/leadersSnapshotShared"

function isLeadersConfigShape(value: unknown): value is LeadersConfig {
  if (!value || typeof value !== "object") return false
  const o = value as LeadersConfig
  return (
    Array.isArray(o.top3Metrics) &&
    Array.isArray(o.miniMetrics) &&
    o.leaders !== null &&
    typeof o.leaders === "object"
  )
}

export async function fetchTopLeadersSnapshotRemote(
  year: string,
  league: string,
  category: TopLeadersCategory
): Promise<LeadersConfig | null> {
  try {
    const raw = await fetchDisplayJsonServer<unknown>(
      topLeadersSnapshotPublicUrl(year, league, category)
    )
    if (!isLeadersConfigShape(raw)) return null
    return raw
  } catch (err) {
    console.error("[fetchTopLeadersSnapshotRemote]", year, league, category, err)
    return null
  }
}
