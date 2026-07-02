"use client"

import dynamic from "next/dynamic"
import { useViewportLayout } from "@/hooks/useIsDesktop"
import { SectionLoadingSpinner } from "@/components/ui/spinner"
import type { PlayerPageSection } from "@/lib/playerSlug"

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

export default function PlayerPageRoot({ pageSection }: { pageSection: PlayerPageSection }) {
  const { isDesktop, forceMobile } = useViewportLayout()

  return (
    <PlayerPageClient
      layout={isDesktop ? "desktop" : "mobile"}
      forceMobile={forceMobile}
      pageSection={pageSection}
    />
  )
}

