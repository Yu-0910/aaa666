import PlayerPageRoot from "../PlayerPageRoot"
import type { PlayerPageSection } from "@/lib/playerSlug"

export const dynamic = "force-static"

function normalizeRestSection(rest: string[] | undefined): PlayerPageSection {
  const section = String(rest?.[rest.length - 1] ?? "").trim().toLowerCase()
  switch (section) {
    case "advanced":
      return "advanced"
    case "splits":
      return "splits"
    case "game-log":
      return "game-log"
    case "pitch-types":
      return "pitch-types"
    default:
      return "basic"
  }
}

export default function PlayerSectionPage({
  params,
}: {
  /** `playerId` is the existing segment name. Runtime value is a slug or legacy player segment. */
  params:
    | Promise<{ playerId: string; rest?: string[] }>
    | { playerId: string; rest?: string[] }
}) {
  const resolvedParams = params as { playerId: string; rest?: string[] }
  return <PlayerPageRoot pageSection={normalizeRestSection(resolvedParams?.rest)} />
}
