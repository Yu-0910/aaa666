/**
 * チーム捕手一覧の母集団（サーバー専用）
 * 名簿捕手 ∪ 当該球団で gamesAsCatcher > 0 の選手
 */

import fs from "fs"
import path from "path"
import { getNpbRoster2026 } from "@/lib/npbRoster"
import { getProjectRoot } from "@/lib/projectRoot"
import type { CatcherAppearancesDerived } from "@/lib/catcherAppearances"
import { rosterEnglishFullFromCsvRow } from "@/lib/rosterEnglishDisplay"
import {
  mergeTeamCatcherRosterSeeds,
  type TeamCatcherRosterSeed,
} from "@/lib/teamPage/teamCatcherRoster"

function appearanceCatcherIdsForTeam(year: string, teamCode: string): string[] {
  const dir = path.join(
    getProjectRoot(),
    "_data",
    "derived",
    "player_catcher_appearances",
    String(year).replace(/[^\d]/g, "") || "2026",
  )
  if (!fs.existsSync(dir)) return []

  const rosterOnTeam = new Map(
    getNpbRoster2026()
      .filter((r) => r.team_code === teamCode)
      .map((r) => [r.npb_player_id, r] as const),
  )

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
    .filter((r) => r.team_code === code && r.position === "捕手")
    .map(
      (r): TeamCatcherRosterSeed => ({
        npbPlayerId: r.npb_player_id,
        nameJa: r.name_ja,
        romanName: rosterEnglishFullFromCsvRow(r) || undefined,
        teamCode: code,
        fromRoster: true,
      }),
    )

  const appearanceIds = appearanceCatcherIdsForTeam(year, code).filter(
    (id) => !rosterCatchers.some((s) => s.npbPlayerId === id),
  )

  const rosterById = new Map(getNpbRoster2026().map((r) => [r.npb_player_id, r] as const))
  return mergeTeamCatcherRosterSeeds(rosterCatchers, appearanceIds).map((seed) => {
    if (seed.fromRoster || seed.nameJa !== seed.npbPlayerId) return seed
    const r = rosterById.get(seed.npbPlayerId)
    return r
      ? {
          ...seed,
          nameJa: r.name_ja,
          romanName: seed.romanName ?? (rosterEnglishFullFromCsvRow(r) || undefined),
        }
      : seed
  })
}
