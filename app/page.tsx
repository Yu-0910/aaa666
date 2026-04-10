import { Suspense } from "react"
import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { FullPageLoading } from "@/components/ui/spinner"

/**
 * TopPageRoot → useIsDesktop → usePathname。
 * Next.js 16 開発モードでは pathname が Promise 経由になり、Suspense 無しだとこのスロットが永続サスペンドし
 * 「真っ黒で何も出ない」ことがある。
 */
export default function Page() {
  return (
    <Suspense fallback={<FullPageLoading />}>
      <TopPageRoot initialYear={2025} articlesMode="rss" />
    </Suspense>
  )
}
