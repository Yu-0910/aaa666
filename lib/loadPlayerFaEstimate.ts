import { fetchDerivedJsonServer } from "@/lib/derived/fetchDerivedJsonServer"
import type { FaEstimateDomestic, PlayerFaEstimatesByNpbId } from "@/lib/faEstimate"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"

const bundleCache = new Map<string, PlayerFaEstimatesByNpbId | null>()

export async function loadPlayerFaEstimatesBundle(
  seasonYear: string = DERIVED_SEASON_YEAR_DEFAULT
): Promise<PlayerFaEstimatesByNpbId | null> {
  const year = (seasonYear || DERIVED_SEASON_YEAR_DEFAULT).trim()
  if (bundleCache.has(year)) return bundleCache.get(year) ?? null
  const bundle = await fetchDerivedJsonServer<PlayerFaEstimatesByNpbId>(
    "player_fa_estimates",
    year,
    "npb_fa_estimates.json"
  )
  bundleCache.set(year, bundle)
  return bundle
}

export async function loadDomesticFaEstimateForPlayer(
  npbPlayerId: string,
  seasonYear: string = DERIVED_SEASON_YEAR_DEFAULT
): Promise<FaEstimateDomestic | null> {
  const id = (npbPlayerId || "").trim()
  if (!/^\d+$/.test(id)) return null
  const bundle = await loadPlayerFaEstimatesBundle(seasonYear)
  if (!bundle?.byNpbPlayerId) return null
  return bundle.byNpbPlayerId[id]?.domesticFa ?? null
}
