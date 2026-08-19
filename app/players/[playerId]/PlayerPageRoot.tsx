"use client"

import dynamic from "next/dynamic"
import { useViewportLayout } from "@/hooks/useIsDesktop"
import { SectionLoadingSpinner } from "@/components/ui/spinner"
import type { PlayerPageSection } from "@/lib/playerSlug"

const PLAYER_PAGE_CHUNK_RELOAD_KEY = "player-page-chunk-reload-v1"

async function loadPlayerPageClient() {
  try {
    return await import("./PlayerPageClient").then((mod) => ({ default: mod.PlayerPageClient }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "")
    const isChunkLoadFailure = /chunk|loading css chunk|loading chunk/i.test(message)
    if (
      isChunkLoadFailure &&
      typeof window !== "undefined" &&
      typeof sessionStorage !== "undefined"
    ) {
      const reloadKey = `${PLAYER_PAGE_CHUNK_RELOAD_KEY}:${window.location.pathname}`
      const alreadyRetried = sessionStorage.getItem(reloadKey) === "1"
      if (!alreadyRetried) {
        sessionStorage.setItem(reloadKey, "1")
        window.location.reload()
        return new Promise<never>(() => {})
      }
      sessionStorage.removeItem(reloadKey)
    }
    throw error
  }
}

const PlayerPageClient = dynamic(loadPlayerPageClient, {
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
      <SectionLoadingSpinner />
    </div>
  ),
  ssr: false,
})

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
