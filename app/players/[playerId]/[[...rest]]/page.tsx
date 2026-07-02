import type { Metadata } from "next"
import PlayerPageRoot from "../PlayerPageRoot"
import { metadataForResolvedPlayerRoute, resolvePlayerRouteOrRedirect } from "../playerRouteServer"

export async function generateMetadata({
  params,
}: {
  /** `playerId` is the existing segment name. Runtime value is a slug or legacy player segment. */
  params:
    | Promise<{ playerId: string; rest?: string[] }>
    | { playerId: string; rest?: string[] }
}): Promise<Metadata> {
  const resolvedParams = params instanceof Promise ? await params : params
  const resolved = resolvePlayerRouteOrRedirect({
    playerId: resolvedParams.playerId,
    rest: resolvedParams.rest,
  })
  return metadataForResolvedPlayerRoute(resolved)
}

export default async function PlayerSectionPage({
  params,
}: {
  /** `playerId` is the existing segment name. Runtime value is a slug or legacy player segment. */
  params:
    | Promise<{ playerId: string; rest?: string[] }>
    | { playerId: string; rest?: string[] }
}) {
  const resolvedParams = params instanceof Promise ? await params : params
  const resolved = resolvePlayerRouteOrRedirect({
    playerId: resolvedParams.playerId,
    rest: resolvedParams.rest,
  })
  return <PlayerPageRoot pageSection={resolved.pageSection} />
}
