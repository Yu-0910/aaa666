import { compactPlayerName, isJapaneseNpbListedNameJa } from "@/lib/playerNameNormalize"
import { formatRomanNameForRanking } from "@/lib/ranking/formatRomanNameForRanking"

export type RosterRow = {
  npbPlayerId: string
  nameJa: string
  nameEn: string
  team: string
  teamCode: string
  compactName: string
}

/** 最小CSVパース（npb_roster_2026.csv 想定） */
export function parseRosterCsv(text: string): RosterRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const header = lines[0].split(",")
  const idx = (name: string) => header.findIndex((h) => h.trim() === name)
  const iId = idx("npb_player_id")
  const iJa = idx("name_ja")
  const iEn = idx("name_en")
  const iEnFull = idx("name_en_full")
  const iEnShort = idx("name_en_short")
  const iTeam = idx("team")
  const iCode = idx("team_code")
  if (iId < 0 || iJa < 0) return []

  const out: RosterRow[] = []
  for (let li = 1; li < lines.length; li++) {
    const cols = splitCsvLine(lines[li])
    if (cols.length <= Math.max(iId, iJa)) continue
    const nameJa = (cols[iJa] ?? "").trim()
    if (!nameJa) continue
    const legacyEn = iEn >= 0 ? (cols[iEn] ?? "").trim() : ""
    const fullEn = iEnFull >= 0 ? (cols[iEnFull] ?? "").trim() : ""
    const shortEn = iEnShort >= 0 ? (cols[iEnShort] ?? "").trim() : ""
    const romanOpts = isJapaneseNpbListedNameJa(nameJa) ? { nameJa } : undefined
    const nameEn =
      shortEn ||
      (fullEn || legacyEn ? formatRomanNameForRanking(fullEn || legacyEn, romanOpts) : "")
    out.push({
      npbPlayerId: (cols[iId] ?? "").trim(),
      nameJa,
      nameEn,
      team: iTeam >= 0 ? (cols[iTeam] ?? "").trim() : "",
      teamCode: iCode >= 0 ? (cols[iCode] ?? "").trim() : "",
      compactName: compactPlayerName(nameJa),
    })
  }
  return out
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQ = !inQ
      continue
    }
    if (!inQ && c === ",") {
      out.push(cur)
      cur = ""
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

/** チーム略称（スタメン表）→名簿の team 文字列に含まれるかで候補を絞る */
export function rosterTeamMatchesHint(teamName: string, rosterTeam: string): boolean {
  const t = rosterTeam || ""
  const h = (teamName || "").trim()
  if (!h || !t) return true
  if (h.includes("広島") && t.includes("広島")) return true
  if (h.includes("中日") && t.includes("中日")) return true
  if (h.includes("巨人") && t.includes("巨人")) return true
  if (h.includes("阪神") && t.includes("阪神")) return true
  if (h.includes("DeNA") || h.includes("横浜")) return t.includes("DeNA") || t.includes("横浜")
  if (h.includes("ヤクルト") && t.includes("ヤクルト")) return true
  if (h.includes("オリックス") && t.includes("オリックス")) return true
  if (h.includes("ソフトバンク") && t.includes("ソフトバンク")) return true
  if (h.includes("ロッテ") && t.includes("ロッテ")) return true
  if (h.includes("西武") && t.includes("西武")) return true
  if (h.includes("楽天") && t.includes("楽天")) return true
  if (h.includes("日本ハム") && t.includes("日本ハム")) return true
  return false
}

function nameLookupKeysFromCompact(compact: string): string[] {
  const c = (compact ?? "").trim()
  if (!c) return []
  const keys = new Set<string>([c])
  // 外国人名などで「Ｍ．サノー」「O.カリステ」等の先頭イニシャル表記がある場合のゆるい一致
  const noInitial = c
    .replace(/^[\uFF21-\uFF3A\uFF41-\uFF5A][．.]/u, "")
    .replace(/^[A-Za-z][.]/u, "")
  if (noInitial) keys.add(noInitial)
  return [...keys]
}

function rosterRowLookupKeys(r: RosterRow): string[] {
  return nameLookupKeysFromCompact(r.compactName)
}

export function findNpbIdForYahooBatting(
  roster: RosterRow[],
  playerName: string,
  teamNameHint: string
): { npbPlayerId: string; team: string; romanName?: string } | null {
  const c = compactPlayerName(playerName)
  const keys = nameLookupKeysFromCompact(c)
  if (keys.length === 0) return null

  const matchesName = (r: RosterRow): boolean => {
    const rkeys = rosterRowLookupKeys(r)
    return rkeys.some((k) => keys.includes(k))
  }

  const candidates = roster.filter((r) => matchesName(r) && rosterTeamMatchesHint(teamNameHint, r.team))
  if (candidates.length === 1) {
    const r = candidates[0]!
    return {
      npbPlayerId: r.npbPlayerId,
      team: r.team,
      romanName: r.nameEn || undefined,
    }
  }
  const loose = roster.filter((r) => matchesName(r))
  if (loose.length === 1) {
    const r = loose[0]!
    return { npbPlayerId: r.npbPlayerId, team: r.team, romanName: r.nameEn || undefined }
  }
  return null
}
