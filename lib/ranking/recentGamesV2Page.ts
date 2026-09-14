type Metric = { key: string; label: string }
export function recentV2Query(query: Record<string, string | string[] | undefined>, metrics: Metric[]) {
  const candidate = query.sort === "h" ? "hits" : query.sort
  const sort = typeof candidate === "string" && metrics.some(metric => metric.key === candidate) ? candidate : "ops"
  const order = query.order === "asc" || query.order === "desc" ? query.order : sort === "kPct" ? "asc" : "desc"
  return { sort, order } as { sort: string; order: "asc" | "desc" }
}
export function recentV2Href(league: "CL" | "PL", sort = "ops", order: "asc" | "desc" = sort === "kPct" ? "asc" : "desc") {
  return `/ranking/recent-games/2026/${league}/batting?sort=${encodeURIComponent(sort)}&order=${order}`
}
export function recentV2NextOrder(key: string, sort: string, order: "asc" | "desc"): "asc" | "desc" {
  return key === sort ? order === "desc" ? "asc" : "desc" : key === "kPct" ? "asc" : "desc"
}
