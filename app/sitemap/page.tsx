import type { Metadata } from "next"
import Link from "next/link"
import StaticPageLayout from "@/app/components/common/StaticPageLayout"
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
  { href: "/", label: "サイトトップ（2026年トップへリダイレクト）" },
  { href: "/2026", label: "2026年トップページ" },
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

export default function SitemapPage() {
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
        <p>
          選手ページは各選手ごとの個別URLで公開しています。現在はトップページやランキングページ、球団ページなどから各選手ページへ移動できます。
        </p>
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
