import type { Metadata } from "next"

export type TopPageTabId = 0 | 1 | 2 | 3 | 4
export type TopPageRouteKey = "top" | "weekly" | "probables" | "news" | "standings"

const SITE_NAME = "Short-Stop"
const TOP_SHARE_IMAGE_URL = "https://short-stop.jp/x-share-card.png?v=20260813"
const TOP_SHARE_IMAGE_ALT = "Short-Stop"

export type TopPageRouteConfig = {
  key: TopPageRouteKey
  tabId: TopPageTabId
  label: string
  href: string
  title: string
  description: string
  canonical: string
}

export const TOP_PAGE_ROUTE_CONFIGS: Record<TopPageRouteKey, TopPageRouteConfig> = {
  top: {
    key: "top",
    tabId: 0,
    label: "TOP",
    href: "/",
    title: "プロ野球 2026 成績ランキング | Short-Stop",
    description:
      "2026年プロ野球の打撃成績・投手成績ランキングをリーグ別に掲載。OPS、防御率、打率、本塁打、K-BB%などを確認できます。",
    canonical: "https://short-stop.jp/",
  },
  weekly: {
    key: "weekly",
    tabId: 1,
    label: "今週",
    href: "/weekly-stats",
    title: "プロ野球 今週の成績ランキング 2026 | Short-Stop",
    description:
      "2026年プロ野球の今週の打撃成績・投手成績ランキングを掲載。週間OPS、打率、本塁打、防御率などを確認できます。",
    canonical: "https://short-stop.jp/weekly-stats",
  },
  probables: {
    key: "probables",
    tabId: 2,
    label: "予想投手",
    href: "/probable-pitchers",
    title: "プロ野球 予想先発 2026 | Short-Stop",
    description:
      "2026年プロ野球の予想先発投手を掲載。各カードの先発予想や投手成績を確認できます。",
    canonical: "https://short-stop.jp/probable-pitchers",
  },
  news: {
    key: "news",
    tabId: 3,
    label: "最新情報",
    href: "/news",
    title: "プロ野球 最新情報 2026 | Short-Stop",
    description:
      "2026年プロ野球の最新情報を掲載。選手成績、試合情報、ランキング更新情報を確認できます。",
    canonical: "https://short-stop.jp/news",
  },
  standings: {
    key: "standings",
    tabId: 4,
    label: "順位表",
    href: "/standings",
    title: "プロ野球 順位表 2026 | Short-Stop",
    description:
      "2026年プロ野球のセ・リーグ、パ・リーグ順位表を掲載。勝敗、勝率、ゲーム差などを確認できます。",
    canonical: "https://short-stop.jp/standings",
  },
}

export const TOP_PAGE_TABS = [
  TOP_PAGE_ROUTE_CONFIGS.top,
  TOP_PAGE_ROUTE_CONFIGS.weekly,
  TOP_PAGE_ROUTE_CONFIGS.probables,
  TOP_PAGE_ROUTE_CONFIGS.news,
  TOP_PAGE_ROUTE_CONFIGS.standings,
] as const

export function topPageMetadataFor(routeKey: TopPageRouteKey): Metadata {
  const route = TOP_PAGE_ROUTE_CONFIGS[routeKey]
  return {
    title: route.title,
    description: route.description,
    alternates: {
      canonical: route.canonical,
    },
    openGraph: {
      title: route.title,
      description: route.description,
      url: route.canonical,
      siteName: SITE_NAME,
      type: "website",
      images: [
        {
          url: TOP_SHARE_IMAGE_URL,
          width: 1200,
          height: 630,
          alt: TOP_SHARE_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: route.title,
      description: route.description,
      images: [TOP_SHARE_IMAGE_URL],
    },
  }
}
