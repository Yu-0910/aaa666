/**
 * チーム捕手一覧の母集団（サーバー専用）
 * 名簿捕手 ∪ 当該球団で gamesAsCatcher > 0 の選手
 */

import fs from "fs"
import path from "path"
import { getNpbRoster2026 } from "@/lib/npbRoster"
import { getProjectRoot } from "@/lib/projectRoot"
import { CURRENT_ROSTER_PLAYER_ENTRIES } from "@/lib/currentRosterPlayerEntries"
import type { CatcherAppearancesDerived } from "@/lib/catcherAppearances"
import { rosterEnglishFullFromCsvRow } from "@/lib/rosterEnglishDisplay"
import { teamCodeFromShort } from "@/lib/standings/teamCodes"
import {
  mergeTeamCatcherRosterSeeds,
  type TeamCatcherRosterSeed,
} from "@/lib/teamPage/teamCatcherRoster"

function normalizeRosterTeamCode(teamCode: string, teamName: string): string {
  const fromTeamName = teamCodeFromShort(teamName)
  if (fromTeamName && fromTeamName !== teamName) return fromTeamName
  return teamCodeFromShort(teamCode)
}

function rosterPlayerIdsForTeam(teamCode: string): Set<string> {
  const ids = new Set<string>()
  for (const row of getNpbRoster2026()) {
    if (normalizeRosterTeamCode(row.team_code, row.team) !== teamCode) continue
    const npbId = String(row.npb_player_id ?? "").trim()
    if (npbId) ids.add(npbId)
  }
  for (const entry of CURRENT_ROSTER_PLAYER_ENTRIES) {
    if (String(entry.teamCode ?? "").trim() !== teamCode) continue
    const npbId = String(entry.npbPlayerId ?? "").trim()
    if (npbId) ids.add(npbId)
  }
  return ids
}

function appearanceCatcherIdsForTeam(year: string, teamCode: string): string[] {
  const dir = path.join(
    getProjectRoot(),
    "_data",
    "derived",
    "player_catcher_appearances",
    String(year).replace(/[^\d]/g, "") || "2026",
  )
  if (!fs.existsSync(dir)) return []

  const rosterOnTeam = rosterPlayerIdsForTeam(teamCode)

  const ids: string[] = []
  for (const file of fs.readdirSync(dir)) {
    if (!file.startsWith("npb_") || !file.endsWith(".json")) continue
    const npbId = file.slice(4, -5)
    if (!rosterOnTeam.has(npbId)) continue
    try {
      const raw = fs.readFileSync(path.join(dir, file), "utf8")
      const j = JSON.parse(raw) as CatcherAppearancesDerived
      if (j.schemaVersion !== "player-catcher-appearances-v1") continue
      if ((j.gamesAsCatcher ?? 0) > 0) ids.push(npbId)
    } catch {
      continue
    }
  }
  return ids
}

export function buildTeamCatcherRosterSeeds(teamCode: string, year: string): TeamCatcherRosterSeed[] {
  const code = teamCode.trim()
  const rosterCatchers = getNpbRoster2026()
    .filter((r) => normalizeRosterTeamCode(r.team_code, r.team) === code && r.position === "捕手")
    .map(
      (r): TeamCatcherRosterSeed => ({
        npbPlayerId: r.npb_player_id,
        nameJa: r.name_ja,
        romanName: rosterEnglishFullFromCsvRow(r) || undefined,
        teamCode: code,
        fromRoster: true,
      }),
    )

  const currentRosterCatchers = CURRENT_ROSTER_PLAYER_ENTRIES
    .filter((r) => r.teamCode === code && r.position === "捕手")
    .map(
      (r): TeamCatcherRosterSeed => ({
        npbPlayerId: r.npbPlayerId,
        nameJa: r.nameJa,
        romanName: r.romanFull || undefined,
        teamCode: code,
        fromRoster: true,
      }),
    )

  const rosterCatchersMerged = mergeTeamCatcherRosterSeeds(
    rosterCatchers,
    currentRosterCatchers.map((r) => r.npbPlayerId),
  ).map((seed) => {
    const current = currentRosterCatchers.find((entry) => entry.npbPlayerId === seed.npbPlayerId)
    if (!current) return seed
    return {
      ...seed,
      nameJa: seed.nameJa !== seed.npbPlayerId ? seed.nameJa : current.nameJa,
      romanName: seed.romanName ?? current.romanName,
    }
  })

  const appearanceIds = appearanceCatcherIdsForTeam(year, code).filter(
    (id) => !rosterCatchersMerged.some((s) => s.npbPlayerId === id),
  )

  const rosterById = new Map(getNpbRoster2026().map((r) => [r.npb_player_id, r] as const))
  const currentById = new Map(
    CURRENT_ROSTER_PLAYER_ENTRIES.map((r) => [r.npbPlayerId, r] as const),
  )
  return mergeTeamCatcherRosterSeeds(rosterCatchersMerged, appearanceIds).map((seed) => {
    if (seed.fromRoster || seed.nameJa !== seed.npbPlayerId) return seed
    const r = rosterById.get(seed.npbPlayerId)
    if (r) {
      return {
        ...seed,
        nameJa: r.name_ja,
        romanName: seed.romanName ?? (rosterEnglishFullFromCsvRow(r) || undefined),
      }
    }
    const current = currentById.get(seed.npbPlayerId)
    if (current) {
      return {
        ...seed,
        nameJa: current.nameJa,
        romanName: seed.romanName ?? current.romanFull ?? undefined,
      }
    }
    return seed
  })
}
