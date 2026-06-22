import type { TopProbablesSnapshot } from "@/lib/probables/types"
import { fetchJsonCached } from "@/lib/topPage/fetchJsonCached"

export function siteTopProbablesPath(year: string | number): string {
  return `/data/top-probables/${year}/current.json`
}

export function isTopProbablesSnapshot(v: unknown): v is TopProbablesSnapshot {
  if (!v || typeof v !== "object") return false
  const o = v as TopProbablesSnapshot
  return o.schemaVersion === "top-probables-v1" && Array.isArray(o.cards)
}

export async function fetchTopProbablesJson(
  year: string | number,
): Promise<TopProbablesSnapshot> {
  const url = siteTopProbablesPath(year)
  const data = await fetchJsonCached<TopProbablesSnapshot & { error?: string }>(url)
  if (data.error) throw new Error(data.error)
  if (!isTopProbablesSnapshot(data)) {
    throw new Error("Invalid top-probables JSON")
  }
  return data
}
