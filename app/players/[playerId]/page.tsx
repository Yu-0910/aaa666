"use client"

import dynamic from "next/dynamic"
import { useViewportLayout } from "@/hooks/useIsDesktop"
import { SectionLoadingSpinner } from "@/components/ui/spinner"

const PlayerPageClient = dynamic(
  () => import("./PlayerPageClient").then((mod) => ({ default: mod.PlayerPageClient })),
  {
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <SectionLoadingSpinner />
      </div>
    ),
    ssr: false,
  },
)

export default function PlayerPage() {
  const { isDesktop, forceMobile } = useViewportLayout()

  return (
    <PlayerPageClient
      layout={isDesktop ? "desktop" : "mobile"}
      forceMobile={forceMobile}
    />
  )
}
