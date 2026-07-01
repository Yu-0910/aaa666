"use client"

import Link from "next/link"

const footerLinks = [
  { href: "/about", label: "このサイトについて" },
  { href: "/contact", label: "お問い合わせ" },
  { href: "/privacy-policy", label: "プライバシーポリシー" },
  { href: "/disclaimer", label: "免責事項" },
  { href: "/sitemap", label: "サイトマップ" },
] as const

type SiteFooterProps = {
  className?: string
}

export default function SiteFooter({ className = "" }: SiteFooterProps) {
  return (
    <footer
      className={`border-t border-[#333] bg-black text-gray-400 ${className}`.trim()}
      aria-label="サイトフッター"
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <nav
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm"
          aria-label="固定ページ"
        >
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-[#ffff44]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="mt-4 text-center text-xs text-gray-500">© Short-Stop</p>
      </div>
    </footer>
  )
}
