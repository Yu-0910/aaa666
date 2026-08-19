"use client"

import { useViewportLayout } from "@/hooks/useIsDesktop"
import type { PlayerPageSection } from "@/lib/playerSlug"
import { PlayerPageClient } from "./PlayerPageClient"

export default function PlayerPageRoot({
  pageSection,
  initialDisplayName,
  initialDisplayRomanName,
}: {
  pageSection: PlayerPageSection
  initialDisplayName: string
  initialDisplayRomanName?: string | null
}) {
  const { isDesktop, forceMobile } = useViewportLayout()

  return (
    <PlayerPageClient
      layout={isDesktop ? "desktop" : "mobile"}
      forceMobile={forceMobile}
      pageSection={pageSection}
      initialDisplayName={initialDisplayName}
      initialDisplayRomanName={initialDisplayRomanName ?? null}
    />
  )
}
