import PlayerPageRoot from "./PlayerPageRoot"
import type { PlayerPageSection } from "@/lib/playerSlug"

const BASIC_SECTION: PlayerPageSection = "basic"

export default async function PlayerPage({
  params: _params,
  searchParams: _searchParams,
}: {
  /** `playerId` is the existing segment name. Runtime value is a slug or legacy player segment. */
  params: Promise<{ playerId: string }> | { playerId: string }
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}) {
  return <PlayerPageRoot pageSection={BASIC_SECTION} />
}
