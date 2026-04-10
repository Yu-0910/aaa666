"use client"

import { useIsDesktop } from "@/hooks/useIsDesktop"
import { TopPageClient, type TopPageClientProps } from "@/app/components/top/TopPageClient"

type Props = Omit<TopPageClientProps, "layout">

export function TopPageRoot(props: Props) {
  const isDesktop = useIsDesktop()
  return <TopPageClient {...props} layout={isDesktop ? "desktop" : "mobile"} />
}
