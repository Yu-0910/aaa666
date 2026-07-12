/** Batting metrics default to descending, except strikeout-rate style metrics. */
export function getDefaultBattingSortOrder(metricKey: string): "asc" | "desc" {
  if (metricKey === "kpct" || metricKey === "k%") {
    return "asc"
  }
  return "desc"
}
