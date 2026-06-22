/**
 * Phase 2: 野手球団別カウント配球 API — Yahoo 打者 ID 解決と派生 JSON 取得。
 */

import { loadBatterVsTeamCountPitchTypesFromRepoAsync } from "@/lib/batterVsTeamCountPitchTypesLoad"
import type { BatterVsTeamCountPitchTypesFile } from "@/lib/batterVsTeamCountPitchTypesTypes"
import { getYahooIdForPilotAsync } from "@/lib/seasonStatsPilot"

export async function fetchBatterVsTeamCountPitchTypesPayload(
  year: string,
  decodedPublicId: string,
): Promise<{ yahooBatterId: string; payload: BatterVsTeamCountPitchTypesFile | null }> {
  const decoded = String(decodedPublicId ?? "").trim()
  if (!decoded) {
    return { yahooBatterId: "", payload: null }
  }

  let yahooBatterId = (await getYahooIdForPilotAsync(decoded))?.trim() ?? ""
  if (!yahooBatterId && /^\d+$/.test(decoded)) {
    yahooBatterId = decoded
  }
  if (!yahooBatterId) {
    return { yahooBatterId: "", payload: null }
  }

  let payload = await loadBatterVsTeamCountPitchTypesFromRepoAsync(year, yahooBatterId)
  if (!payload && /^\d+$/.test(decoded) && decoded !== yahooBatterId) {
    payload = await loadBatterVsTeamCountPitchTypesFromRepoAsync(year, decoded)
    if (payload) yahooBatterId = decoded
  }

  return { yahooBatterId, payload }
}
