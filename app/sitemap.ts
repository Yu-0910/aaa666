import type { MetadataRoute } from "next"
import { getAllPlayerSlugEntries, supportsPitchTypeRoute } from "@/lib/playerSlug.server"
import { playerPagePath } from "@/lib/playerSlug"
import { playerPageTabUrlPath } from "@/lib/playerPageTabUrlPhase2"
import {
  isCatcherRegistrationPosition,
  isPitcherRegistrationPosition,
} from "@/lib/rosterPitcher"

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
    "/site-map",
    "/about",
    "/contact",
    "/privacy-policy",
    "/disclaimer",
  ]

  const items: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${BASE_URL}${route}`,
  }))

  for (const entry of getAllPlayerSlugEntries()) {
    items.push({ url: `${BASE_URL}${playerPagePath(entry.slug)}` })
    if (supportsPitchTypeRoute(entry)) {
      items.push(
        { url: `${BASE_URL}${playerPageTabUrlPath(entry.slug, "pitch")}` },
        { url: `${BASE_URL}${playerPageTabUrlPath(entry.slug, "situation")}` },
        { url: `${BASE_URL}${playerPageTabUrlPath(entry.slug, "matchup")}` },
      )
      continue
    }
    items.push(
      { url: `${BASE_URL}${playerPageTabUrlPath(entry.slug, "pitch")}` },
      { url: `${BASE_URL}${playerPageTabUrlPath(entry.slug, "situation")}` },
      { url: `${BASE_URL}${playerPageTabUrlPath(entry.slug, "matchup")}` },
    )
    if (!isPitcherRegistrationPosition(entry.position, { rosterNpbPlayerId: entry.npbPlayerId })) {
      items.push({ url: `${BASE_URL}${playerPageTabUrlPath(entry.slug, "vs-team")}` })
    }
    if (isCatcherRegistrationPosition(entry.position)) {
      items.push({ url: `${BASE_URL}${playerPageTabUrlPath(entry.slug, "catcher")}` })
    }
  }

  return items
}
