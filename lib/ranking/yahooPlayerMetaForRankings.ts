/**
 * ランキング用の選手名・チームメタ（canonical + 名簿）。Phase 12 / Phase 28 で共有。
 */

import type { BattingLine, CanonicalGameDocument, LineupPlayer } from "@/lib/yahooGame/types"
import {
  CSV_TEAM_TO_RANKING_SHORT,
  leagueBucketForTeamShort,
  rosterTeamToRankingShort,
} from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import {
  findRosterPlayerByPublicId,
  findRosterPlayerByPublicIdOrJaName,
  rosterEnglishShortForRanking,
} from "@/lib/npbRoster"
import {
  normalizeRomanMapKey,
  normalizeRomanMapKeyNoSpace,
} from "@/lib/ranking/romanNameFromCsv"

function teamForYahooId(doc: CanonicalGameDocument, yahooId: string): string {
  for (const team of doc.game.teams ?? []) {
    const teamName = String(team.teamName ?? "").trim()
    for (const p of (team.startingLineup ?? []) as LineupPlayer[]) {
      if (String(p.yahooPlayerId ?? "").trim() === yahooId) return teamName
    }
  }
  return ""
}

function shouldPreferPlayerName(current: string, candidate: string): boolean {
  const a = current.trim()
  const b = candidate.trim()
  if (!b) return false
  if (!a) return true
  if (a === b) return false
  if (/^\d+$/.test(a) && !/^\d+$/.test(b)) return true
  if (b.includes(" ") && !a.includes(" ")) return true
  if (b.includes("\u3000") && !a.includes(" ") && !a.includes("\u3000")) return true
  return b.length > a.length
}

function pickPlayerName(current: string, candidate: string): string {
  return shouldPreferPlayerName(current, candidate) ? candidate.trim() : current.trim()
}

export function yahooMetaFromCanonical(
  docs: CanonicalGameDocument[]
): Map<string, { name: string; team: string }> {
  const map = new Map<string, { name: string; team: string }>()
  for (const doc of docs) {
    for (const team of doc.game.teams ?? []) {
      const teamName = String(team.teamName ?? "").trim()
      for (const p of (team.startingLineup ?? []) as LineupPlayer[]) {
        const id = String(p.yahooPlayerId ?? "").trim()
        const name = String(p.playerName ?? "").trim()
        if (!id || !name || !teamName) continue
        if (!map.has(id)) map.set(id, { name, team: teamName })
      }
    }

    for (const bl of doc.domain.battingLines ?? []) {
      const line = bl as BattingLine
      const id = String(line.yahooPlayerId ?? "").trim()
      if (!id) continue
      const pn = String(line.playerName ?? "").trim()
      if (!pn) continue
      const cur = map.get(id)
      const lineupTeam = teamForYahooId(doc, id)
      if (!cur) {
        map.set(id, { name: pn, team: lineupTeam })
      } else {
        map.set(id, {
          name: pickPlayerName(cur.name, pn),
          team: cur.team || lineupTeam,
        })
      }
    }

    const mentioned = doc.game.yahooPlayersMentioned ?? {}
    for (const [id, nm] of Object.entries(mentioned)) {
      const yid = String(id).trim()
      if (!yid || map.has(yid)) continue
      const name = String(nm ?? "").trim()
      if (!name) continue
      map.set(yid, { name, team: teamForYahooId(doc, yid) })
    }

    for (const pl of doc.domain.pitchingLines ?? []) {
      const id = String(pl.yahooPlayerId ?? "").trim()
      const pn = String(pl.playerName ?? "").trim()
      if (!id || !pn) continue
      const cur = map.get(id)
      const lineupTeam = teamForYahooId(doc, id)
      const short = rosterTeamToRankingShort(lineupTeam || "")
      if (!cur) {
        map.set(id, { name: pn, team: short })
      } else if (pn.length > cur.name.length) {
        map.set(id, { ...cur, name: pn, team: cur.team || short })
      }
    }
  }

  for (const [id, meta] of [...map.entries()]) {
    if (meta.team.trim()) {
      map.set(id, { ...meta, team: rosterTeamToRankingShort(meta.team) })
      continue
    }
    const roster = findRosterPlayerByPublicId(id)
    if (roster?.team) {
      map.set(id, { ...meta, team: rosterTeamToRankingShort(roster.team) })
    }
  }
  for (const [id, meta] of [...map.entries()]) {
    if (meta.team.trim() || !meta.name.trim()) continue
    const byJa = findRosterPlayerByPublicId(meta.name)
    if (byJa?.team) {
      map.set(id, { ...meta, team: rosterTeamToRankingShort(byJa.team) })
    }
  }

  return map
}

export function metaForRankingRow(
  yahooId: string,
  metaMap: Map<string, { name: string; team: string }>
): { name: string; team: string } {
  const cur = metaMap.get(yahooId)
  const nameTrim = (cur?.name ?? "").trim()
  const teamTrim = (cur?.team ?? "").trim()
  const badName = !nameTrim || nameTrim === yahooId
  const roster = findRosterPlayerByPublicId(yahooId)
  if (roster?.name_ja) {
    const teamFromRoster = rosterTeamToRankingShort(roster.team)
    if (badName || !teamTrim) {
      return {
        name: roster.name_ja.trim(),
        team: teamTrim || teamFromRoster,
      }
    }
  }
  return cur ?? { name: yahooId, team: "" }
}

export function resolveRomanNameForRanking(
  yahooId: string,
  nameJa: string,
  teamShort: string,
  romanMap: Record<string, string>
): string | undefined {
  const roster = findRosterPlayerByPublicIdOrJaName(yahooId, nameJa)
  const enFromRoster = roster ? rosterEnglishShortForRanking(roster) : ""
  if (enFromRoster) return enFromRoster

  const teamCsv = roster?.team
    ? roster.team
    : teamShort
      ? Object.keys(CSV_TEAM_TO_RANKING_SHORT).find((k) => CSV_TEAM_TO_RANKING_SHORT[k] === teamShort) ??
        teamShort
      : ""

  const tryKeys: Array<[string, string]> = []
  if (roster) {
    tryKeys.push([roster.name_ja, roster.team])
    tryKeys.push([roster.name_ja.replace(/\u3000/g, " "), roster.team])
  }
  if (nameJa && teamCsv) tryKeys.push([nameJa, teamCsv])
  if (nameJa && teamShort) tryKeys.push([nameJa, teamShort])

  for (const [n, t] of tryKeys) {
    if (!n || !t) continue
    const k1 = normalizeRomanMapKey(n, t)
    if (romanMap[k1]) return romanMap[k1].trim()
    const k2 = normalizeRomanMapKeyNoSpace(n, t)
    if (romanMap[k2]) return romanMap[k2].trim()
  }
  return undefined
}

export function resolveBattingRankingLeagueBucket(
  yahooId: string,
  meta: { name: string; team: string } | undefined
): "CL" | "PL" | null {
  const roster = findRosterPlayerByPublicId(yahooId)
  if (roster?.team) {
    const short = rosterTeamToRankingShort(roster.team).trim()
    if (short) return leagueBucketForTeamShort(short)
  }
  const m = meta ?? { name: "", team: "" }
  if (m.team.trim()) {
    const short = rosterTeamToRankingShort(m.team).trim()
    if (short) return leagueBucketForTeamShort(short)
  }
  const byJa = findRosterPlayerByPublicIdOrJaName(yahooId, m.name)
  if (byJa?.team) {
    const short = rosterTeamToRankingShort(byJa.team).trim()
    if (short) return leagueBucketForTeamShort(short)
  }
  return null
}

export function resolvePitchingRankingLeagueBucket(
  yahooId: string,
  meta: { name: string; team: string } | undefined
): "CL" | "PL" | null {
  return resolveBattingRankingLeagueBucket(yahooId, meta)
}
