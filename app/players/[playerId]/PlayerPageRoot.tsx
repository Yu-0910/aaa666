"use client"

import { useEffect, useState, type ComponentType } from "react"
import { useViewportLayout } from "@/hooks/useIsDesktop"
import { SectionLoadingSpinner } from "@/components/ui/spinner"
import type { PlayerPageSection } from "@/lib/playerSlug"

type PlayerPageClientProps = {
  layout: "desktop" | "mobile"
  forceMobile: boolean
  pageSection: PlayerPageSection
  initialDisplayName: string
  initialDisplayRomanName: string | null
}

function PlayerPageClientLoader(props: PlayerPageClientProps) {
  const [Client, setClient] = useState<ComponentType<PlayerPageClientProps> | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    import("./PlayerPageClient")
      .then(({ PlayerPageClient: LoadedClient }) => {
        if (active) setClient(() => LoadedClient)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [])

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4 text-center text-white">
        選手ページの読み込みに失敗しました。ページを再読み込みしてください。
      </div>
    )
  }
  if (!Client) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <SectionLoadingSpinner />
      </div>
    )
  }
  return <Client {...props} />
}

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
    <PlayerPageClientLoader
      layout={isDesktop ? "desktop" : "mobile"}
      forceMobile={forceMobile}
      pageSection={pageSection}
      initialDisplayName={initialDisplayName}
      initialDisplayRomanName={initialDisplayRomanName ?? null}
    />
  )
}
