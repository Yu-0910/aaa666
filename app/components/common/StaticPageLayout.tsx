import type { ReactNode } from "react"
import Link from "next/link"
import SiteFooter from "@/app/components/common/SiteFooter"
import { SITE_TOP_HREF } from "@/lib/siteNavigation"

type StaticPageLayoutProps = {
  title: string
  description?: string
  children: ReactNode
}

export default function StaticPageLayout({
  title,
  description,
  children,
}: StaticPageLayoutProps) {
  return (
    <div className="min-h-screen site-bg text-white">
      <header className="border-b border-[#333] site-header-bg backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href={SITE_TOP_HREF}
            className="text-sm font-semibold text-[#ffff44] transition-colors hover:text-white"
          >
            Short-Stop
          </Link>
          <Link
            href={SITE_TOP_HREF}
            className="text-xs text-gray-400 transition-colors hover:text-[#ffff44]"
          >
            トップへ戻る
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 border-b border-[#333] pb-5">
          <div className="mb-3 h-1 w-14 bg-[#ffff44]" aria-hidden />
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{title}</h1>
          {description ? (
            <p className="mt-3 text-sm leading-7 text-gray-300 sm:text-base">{description}</p>
          ) : null}
        </div>

        <div className="space-y-8 text-sm leading-7 text-gray-200 sm:text-base">
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
