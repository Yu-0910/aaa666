import type { WeeklyCurrentWeekJson } from "@/lib/topPage/weeklyCurrentWeekMeta"

/** 週間ランキングページ用 current-week.json（クライアント） */
export async function fetchWeeklyCurrentWeekClient(
  year: string
): Promise<WeeklyCurrentWeekJson | null> {
  try {
    const res = await fetch(`/data/rankings/weekly/${year}/current-week.json`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as WeeklyCurrentWeekJson
  } catch {
    return null
  }
}
