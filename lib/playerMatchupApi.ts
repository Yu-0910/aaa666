/**
 * Phase 2: 対戦成績 API 用の公開 ID → NPB 解決と派生 JSON 取得。
 * `season-pitching` と同様、名簿未ヒット時も数値 ID / マップで派生を直接読む。
 */

import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { resolvePlayerSlugEntry } from "@/lib/playerSlug.server"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"
import { loadPlayerMatchupFromRepoAsync } from "@/lib/playerMatchupLoad"
import type { PlayerMatchupDerived } from "@/lib/playerMatchupTypes"

export function resolveMatchupNpbPlayerId(decodedPublicId: string): string {
  const id = String(decodedPublicId ?? "").trim()
  if (!id) return ""

  const fromRoster = findRosterPlayerByPublicId(id)?.npb_player_id?.trim() ?? ""
  if (fromRoster) return fromRoster

  const fromSlug = resolvePlayerSlugEntry(id)?.npbPlayerId?.trim() ?? ""
  if (fromSlug) return fromSlug

  const mapped = resolveNpbPlayerIdFromPublicId(id)?.trim() ?? ""
  if (mapped) return mapped

  if (/^\d+$/.test(id)) return id
  return ""
}

export async function fetchPlayerMatchupPayload(
  year: string,
  decodedPublicId: string,
  role: "batter" | "pitcher",
): Promise<{ npbPlayerId: string; payload: PlayerMatchupDerived | null }> {
  let npb = resolveMatchupNpbPlayerId(decodedPublicId)
  if (!npb) {
    return { npbPlayerId: "", payload: null }
  }

  let payload = await loadPlayerMatchupFromRepoAsync(year, npb, role)
  const decoded = String(decodedPublicId ?? "").trim()
  if (!payload && /^\d+$/.test(decoded) && decoded !== npb) {
    payload = await loadPlayerMatchupFromRepoAsync(year, decoded, role)
    if (payload) npb = decoded
  }

  return { npbPlayerId: npb, payload }
}
