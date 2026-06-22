import { formatEra } from "@/lib/formatStat"
import type { TopProbablesPitcherSlot } from "@/lib/probables/types"
import type { PitcherSeasonPocPayload } from "@/lib/pitcherSeasonPocTypes"

export type PitcherSeasonStatsFields = Pick<
  TopProbablesPitcherSlot,
  "seasonEra" | "seasonWins" | "seasonLosses" | "seasonKbbPct"
>

export function pitcherSeasonStatsFieldsFromPoc(
  poc: PitcherSeasonPocPayload,
): PitcherSeasonStatsFields {
  const b = poc.basic
  const kbbPct = b.bf > 0 ? (((b.so - b.bb) / b.bf) * 100).toFixed(1) : null
  return {
    seasonEra: b.era != null ? formatEra(b.era) : null,
    seasonWins: b.winCount ?? null,
    seasonLosses: b.lossCount ?? null,
    seasonKbbPct: kbbPct,
  }
}

export function formatPitcherSeasonStatsLine(
  stats: PitcherSeasonStatsFields,
): string | null {
  const { seasonEra, seasonWins, seasonLosses, seasonKbbPct } = stats
  if (
    seasonEra == null &&
    seasonWins == null &&
    seasonLosses == null &&
    seasonKbbPct == null
  ) {
    return null
  }
  const eraPart = seasonEra != null ? `防${seasonEra}` : "防—"
  const wlPart =
    seasonWins != null && seasonLosses != null
      ? `${seasonWins}勝${seasonLosses}敗`
      : "—勝—敗"
  const kbbPart = seasonKbbPct != null ? `K-BB％${seasonKbbPct}` : "K-BB％—"
  return `${eraPart} ${wlPart} ${kbbPart}`
}
