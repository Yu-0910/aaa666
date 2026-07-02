import type { MetadataRoute } from "next"
import { getAllPlayerSlugEntries, supportsPitchTypeRoute } from "@/lib/playerSlug.server"
import { playerPagePath } from "@/lib/playerSlug"

const BASE_URL = "https://short-stop.jp"

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "/",
    "/weekly-stats",
    "/probable-pitchers",
    "/news",
    "/standings",
    "/ranking",
    "/ranking/pitching",
    "/sitemap",
    "/about",
    "/contact",
    "/privacy-policy",
    "/disclaimer",
  ]

  const items: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${BASE_URL}${route}`,
  }))

  for (const entry of getAllPlayerSlugEntries()) {
    items.push(
      { url: `${BASE_URL}${playerPagePath(entry.slug)}` },
      { url: `${BASE_URL}${playerPagePath(entry.slug, "advanced")}` },
      { url: `${BASE_URL}${playerPagePath(entry.slug, "splits")}` },
      { url: `${BASE_URL}${playerPagePath(entry.slug, "game-log")}` },
    )
    if (supportsPitchTypeRoute(entry)) {
      items.push({ url: `${BASE_URL}${playerPagePath(entry.slug, "pitch-types")}` })
    }
  }

  return items
}

