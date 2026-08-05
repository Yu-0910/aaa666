import type { MetadataRoute } from "next"
import { getAllPlayerSlugEntries } from "@/lib/playerSlug.server"
import { playerPagePath } from "@/lib/playerSlug"
import {
  TEAM_PAGE_SUB_TABS,
  TEAM_PAGE_V1_YEARS,
} from "@/lib/teamPage/teamPageConstants"
import { TEAM_PAGE_DRAWER_NAV } from "@/lib/teamPage/teamPageNavLinks"
import { teamPageHref, teamPageHubHref } from "@/lib/teamPage/teamPageHref"
import {
  TOP_PAGE_MODERN_LAYOUT_MAX_YEAR,
  TOP_PAGE_MODERN_LAYOUT_MIN_YEAR,
} from "@/lib/topPageModernLayout"

const BASE_URL = "https://short-stop.jp"
const LEAGUES = ["CL", "PL"] as const

function siteUrl(path: string): MetadataRoute.Sitemap[number] {
  return { url: `${BASE_URL}${path}` }
}

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

  const items: MetadataRoute.Sitemap = []
  const seen = new Set<string>()

  const addPath = (path: string) => {
    const normalized = path === "/" ? "/" : `/${path.replace(/^\/+|\/+$/g, "")}`
    if (seen.has(normalized)) return
    seen.add(normalized)
    items.push(siteUrl(normalized))
  }

  for (const route of staticRoutes) {
    addPath(route)
  }

  for (let year = TOP_PAGE_MODERN_LAYOUT_MAX_YEAR; year >= TOP_PAGE_MODERN_LAYOUT_MIN_YEAR; year -= 1) {
    if (year !== TOP_PAGE_MODERN_LAYOUT_MAX_YEAR) {
      addPath(`/${year}`)
    }
    for (const league of LEAGUES) {
      addPath(`/ranking/${year}/${league}`)
      addPath(`/ranking/pitching/${year}/${league}`)
    }
  }

  for (let year = TOP_PAGE_MODERN_LAYOUT_MAX_YEAR; year >= 2013; year -= 1) {
    addPath(year === TOP_PAGE_MODERN_LAYOUT_MAX_YEAR ? "/standings" : `/standings/${year}`)
  }

  const teamLinks = [...TEAM_PAGE_DRAWER_NAV.CL, ...TEAM_PAGE_DRAWER_NAV.PL]
  for (const year of TEAM_PAGE_V1_YEARS) {
    for (const team of teamLinks) {
      addPath(teamPageHubHref(team.teamCode, year))
      for (const subTab of TEAM_PAGE_SUB_TABS) {
        addPath(teamPageHref({ teamCode: team.teamCode, year, subTab: subTab.id }))
      }
    }
  }

  for (const entry of getAllPlayerSlugEntries()) {
    addPath(playerPagePath(entry.slug))
  }

  return items
}
