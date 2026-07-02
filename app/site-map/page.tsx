import type { Metadata } from "next"
import Link from "next/link"
import StaticPageLayout from "@/app/components/common/StaticPageLayout"
import { getAllPlayerSlugEntries, supportsPitchTypeRoute } from "@/lib/playerSlug.server"
import { playerPagePath } from "@/lib/playerSlug"
import { TEAM_PAGE_DRAWER_NAV } from "@/lib/teamPage/teamPageNavLinks"
import { teamPageHubHref } from "@/lib/teamPage/teamPageHref"

export const metadata: Metadata = {
  title: "サイトマップ | Short-Stop",
  description: "Short-Stopの主要ページ一覧です。",
}

const staticPages = [
  { href: "/about", label: "このサイトについて" },
  { href: "/contact", label: "お問い合わせ" },
  { href: "/privacy-policy", label: "プライバシーポリシー" },
  { href: "/disclaimer", label: "免責事項" },
] as const

const topLinks = [
  { href: "/", label: "サイトトップ" },
  { href: "/weekly-stats", label: "今週の成績ランキング" },
  { href: "/probable-pitchers", label: "予想先発" },
  { href: "/news", label: "最新情報" },
  { href: "/standings", label: "順位表" },
  { href: "/ranking", label: "打撃ランキング入口" },
  { href: "/ranking/pitching", label: "投手ランキング入口" },
  { href: "/ranking/2026/PL", label: "2026年 パ・リーグ 打撃ランキング" },
  { href: "/ranking/2026/CL", label: "2026年 セ・リーグ 打撃ランキング" },
  { href: "/ranking/pitching/2026/PL", label: "2026年 パ・リーグ 投手ランキング" },
  { href: "/ranking/pitching/2026/CL", label: "2026年 セ・リーグ 投手ランキング" },
] as const

const teamLinks = [...TEAM_PAGE_DRAWER_NAV.CL, ...TEAM_PAGE_DRAWER_NAV.PL].map((team) => ({
  href: teamPageHubHref(team.teamCode, "2026"),
  label: `${team.label} ページ`,
}))

const playerLinks = getAllPlayerSlugEntries().slice(0, 60).map((entry) => ({
  label: `${entry.nameJa} 成績`,
  href: playerPagePath(entry.slug),
  advancedHref: playerPagePath(entry.slug, "advanced"),
  splitsHref: playerPagePath(entry.slug, "splits"),
  gameLogHref: playerPagePath(entry.slug, "game-log"),
  pitchTypesHref: supportsPitchTypeRoute(entry) ? playerPagePath(entry.slug, "pitch-types") : null,
}))

export default function SiteMapPage() {
  return (
    <StaticPageLayout
      title="サイトマップ"
      description="現在公開している主要ページへのリンクをまとめています。"
    >
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">主要ページ</h2>
        <ul className="space-y-2">
          {topLinks.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="text-gray-200 transition-colors hover:text-[#ffff44]">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">球団ページ</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {teamLinks.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="text-gray-200 transition-colors hover:text-[#ffff44]">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">選手関連ページについて</h2>
        <p>選手ページはslug形式の個別URLで公開しています。主要な例を掲載しています。</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {playerLinks.map((link) => (
            <li key={link.href} className="space-y-1">
              <Link href={link.href} className="block text-gray-200 transition-colors hover:text-[#ffff44]">
                {link.label}
              </Link>
              <Link href={link.advancedHref} className="block text-sm text-gray-400 transition-colors hover:text-white">
                詳細成績
              </Link>
              <Link href={link.splitsHref} className="block text-sm text-gray-400 transition-colors hover:text-white">
                状況別成績
              </Link>
              <Link href={link.gameLogHref} className="block text-sm text-gray-400 transition-colors hover:text-white">
                試合別成績
              </Link>
              {link.pitchTypesHref ? (
                <Link href={link.pitchTypesHref} className="block text-sm text-gray-400 transition-colors hover:text-white">
                  球種情報
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">固定ページ</h2>
        <ul className="space-y-2">
          {staticPages.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="text-gray-200 transition-colors hover:text-[#ffff44]">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </StaticPageLayout>
  )
}
