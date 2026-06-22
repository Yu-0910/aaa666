import type { ReactNode } from "react"
import { Suspense } from "react"
import { FullPageLoading } from "@/components/ui/spinner"

/** チームページ子ルートのクライアント境界 */
export default function TeamsLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<FullPageLoading />}>{children}</Suspense>
}
