import type { TopProbablesSnapshot } from "@/lib/probables/types"

export async function fetchEnrichedProbablesSnapshot(
  year: string | number,
): Promise<TopProbablesSnapshot | null> {
  try {
    const res = await fetch(`/api/top-probables/enrich?year=${year}`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as TopProbablesSnapshot
  } catch {
    return null
  }
}

export async function enrichProbablesSnapshotFromApi(
  snapshot: TopProbablesSnapshot,
): Promise<TopProbablesSnapshot> {
  const enriched = await fetchEnrichedProbablesSnapshot(snapshot.seasonYear)
  return enriched ?? snapshot
}
