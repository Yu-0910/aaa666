import type { ReactNode } from "react"
import { Suspense } from "react"
import { FullPageLoading } from "@/components/ui/spinner"

/**
 * PlayerPageClient が usePathname を使用する。
 * Next.js 16 開発モードでは pathname が Promise 経由になり、Suspense 無しだと永続サスペンドし
 * 「真っ黒で何も出ない」ことがある（app/page.tsx と同旨）。
 */
export default function PlayersLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<FullPageLoading />}>{children}</Suspense>
}
