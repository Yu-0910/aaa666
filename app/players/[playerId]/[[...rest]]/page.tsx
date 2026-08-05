import type { Metadata } from "next"
import { loadPlayerProfileMergedForInitialHtml } from "@/lib/playerProfileMergedServer"
import PlayerPageRoot from "../PlayerPageRoot"
import PlayerInitialHtmlSnapshot from "../PlayerInitialHtmlSnapshot"
import { metadataForResolvedPlayerRoute, resolvePlayerRouteOrRedirect } from "../playerRouteServer"

export async function generateMetadata({
  params,
  searchParams,
}: {
  /** `playerId` is the existing segment name. Runtime value is a slug or legacy player segment. */
  params:
    | Promise<{ playerId: string; rest?: string[] }>
    | { playerId: string; rest?: string[] }
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}): Promise<Metadata> {
  const resolvedParams = params instanceof Promise ? await params : params
  const resolvedSearch = searchParams instanceof Promise ? await searchParams : searchParams
  const resolved = resolvePlayerRouteOrRedirect({
    playerId: resolvedParams.playerId,
    rest: resolvedParams.rest,
    searchParams: resolvedSearch,
  })
  return metadataForResolvedPlayerRoute(resolved)
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  /** `playerId` is the existing segment name. Runtime value is a slug or legacy player segment. */
  params:
    | Promise<{ playerId: string; rest?: string[] }>
    | { playerId: string; rest?: string[] }
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}) {
  const resolvedParams = params instanceof Promise ? await params : params
  const resolvedSearch = searchParams instanceof Promise ? await searchParams : searchParams
  const resolved = resolvePlayerRouteOrRedirect({
    playerId: resolvedParams.playerId,
    rest: resolvedParams.rest,
    searchParams: resolvedSearch,
  })
  const profileMerged = await loadPlayerProfileMergedForInitialHtml({
    playerId: resolved.entry.slug || resolvedParams.playerId,
    npbPlayerId: resolved.entry.npbPlayerId,
  })
  return (
    <>
      <PlayerInitialHtmlSnapshot entry={resolved.entry} profileMerged={profileMerged} />
      <PlayerPageRoot
        pageSection={resolved.pageSection}
        initialDisplayName={resolved.entry.nameJa}
        initialDisplayRomanName={resolved.entry.romanFull || null}
      />
    </>
  )
}
