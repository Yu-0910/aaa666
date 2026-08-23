import "server-only"
/**
 * NPB 2026年選手名簿ローダー
 * _data/npb_roster_2026.csv を読み込み、打席・投球の利き手を提供
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "node:url"
import { compactPlayerName, isJapaneseNpbListedNameJa, rosterNameMatchKey } from "@/lib/playerNameNormalize"
import { resolvePlayerSlugEntry } from "@/lib/playerSlug.server"
import { formatRomanNameForRanking } from "@/lib/ranking/formatRomanNameForRanking"
import { getProjectRoot } from "@/lib/projectRoot"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"

export interface NpbRosterPlayer {
  npb_player_id: string
  name_ja: string
  name_en: string
  /** 英字フル（Western order 例: Suguru Iwazaki）。個人ページ表示用 */
  name_en_full: string
  /** ランキング用略式（例: S.Iwazaki）。空ならフルから導出可 */
  name_en_short: string
  team: string
  team_code: string
  position: string
  uniform_no: string
  /** 投: R=右投, L=左投 */
  throw_hand: string
  /** 打: R=右打, L=左打, B=両打 */
  bat_hand: string
  /** 2026年新規支配下登録か */
  is_new_2026: string
}

let cachedRoster: NpbRosterPlayer[] | null = null

function getRosterPath(): string {
  const fromRoot = path.join(getProjectRoot(), "_data", "npb_roster_2026.csv")
  if (fs.existsSync(fromRoot)) return fromRoot
  const libDir = path.dirname(fileURLToPath(import.meta.url))
  return path.join(libDir, "..", "_data", "npb_roster_2026.csv")
}

/**
 * CSVをパースしてロスター配列を返す
 */
function parseRosterCsv(content: string): NpbRosterPlayer[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^\ufeff/, ""))
  const rows: NpbRosterPlayer[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, j) => {
      row[h] = values[j] ?? ""
    })
    rows.push({
      npb_player_id: row.npb_player_id ?? "",
      name_ja: row.name_ja ?? "",
      name_en: row.name_en ?? "",
      name_en_full: row.name_en_full ?? "",
      name_en_short: row.name_en_short ?? "",
      team: row.team ?? "",
      team_code: row.team_code ?? "",
      position: row.position ?? "",
      uniform_no: row.uniform_no ?? "",
      throw_hand: row.throw_hand ?? "",
      bat_hand: row.bat_hand ?? "",
      is_new_2026: row.is_new_2026 ?? "0",
    })
  }
  return rows
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
    } else if (inQuotes) {
      current += c
    } else if (c === ",") {
      result.push(current)
      current = ""
    } else {
      current += c
    }
  }
  result.push(current)
  return result
}

/**
 * 2026年NPB選手名簿を取得（キャッシュあり）
 */
export function getNpbRoster2026(): NpbRosterPlayer[] {
  if (cachedRoster) return cachedRoster
  const p = getRosterPath()
  try {
    const content = fs.readFileSync(p, "utf-8")
    cachedRoster = parseRosterCsv(content)
    return cachedRoster
  } catch {
    return []
  }
}

/** 個人ページ等: フル英字（name_en_full → 従来 name_en） */
export function rosterEnglishFull(p: NpbRosterPlayer): string {
  const a = (p.name_en_full ?? "").trim()
  if (a) return a
  return (p.name_en ?? "").trim()
}

/** ランキング用: name_en_short → なければフルから略式を導出 */
export function rosterEnglishShortForRanking(p: NpbRosterPlayer): string {
  const s = (p.name_en_short ?? "").trim()
  if (s) return s
  const full = rosterEnglishFull(p)
  if (!full) return ""
  return formatRomanNameForRanking(full, isJapaneseNpbListedNameJa(p.name_ja) ? { nameJa: p.name_ja } : undefined)
}

/**
 * 選手名（日本語）から利き手を取得
 */
export function getPlayerHandedness(nameJa: string): {
  throwHand: "R" | "L" | ""
  batHand: "R" | "L" | "B" | ""
} {
  const roster = getNpbRoster2026()
  const p = roster.find((r) => r.name_ja === nameJa || r.name_ja.replace(/\s/g, "") === nameJa.replace(/\s/g, ""))
  if (!p) return { throwHand: "", batHand: "" }
  const throwHand = (p.throw_hand === "R" || p.throw_hand === "L" ? p.throw_hand : "") as "R" | "L" | ""
  const batHand = (p.bat_hand === "R" || p.bat_hand === "L" || p.bat_hand === "B" ? p.bat_hand : "") as "R" | "L" | "B" | ""
  return { throwHand, batHand }
}

/**
 * NPB player_id から利き手を取得
 */
export function getPlayerHandednessById(npbPlayerId: string): {
  throwHand: "R" | "L" | ""
  batHand: "R" | "L" | "B" | ""
} {
  const roster = getNpbRoster2026()
  const p = roster.find((r) => r.npb_player_id === String(npbPlayerId))
  if (!p) return { throwHand: "", batHand: "" }
  const throwHand = (p.throw_hand === "R" || p.throw_hand === "L" ? p.throw_hand : "") as "R" | "L" | ""
  const batHand = (p.bat_hand === "R" || p.bat_hand === "L" || p.bat_hand === "B" ? p.bat_hand : "") as "R" | "L" | "B" | ""
  return { throwHand, batHand }
}

/**
 * 2026年新規登録選手一覧
 */
export function getNewPlayers2026(): NpbRosterPlayer[] {
  return getNpbRoster2026().filter((r) => r.is_new_2026 === "1")
}

/** 名簿の日本語名から「Ｓ．ファビアン」「Ｈ．メヒア」等の別表記キーを列挙 */
export function rosterJaNameLookupKeys(nameJa: string): string[] {
  const c = rosterNameMatchKey(nameJa)
  const keys = new Set<string>([c, compactPlayerName(nameJa)])
  const noInitial = c
    .replace(/^[\uFF21-\uFF3A\uFF41-\uFF5A][．.]/u, "")
    .replace(/^[A-Za-z][.]/u, "")
  if (noInitial) keys.add(noInitial)
  return [...keys]
}

/** 個人ページの playerId（数値＝NPB または Yahoo 橋渡し後の NPB、日本語名・英字名）から名簿行を解決 */
export function findRosterPlayerByPublicId(raw: string): NpbRosterPlayer | null {
  const roster = getNpbRoster2026()
  let id = (raw || "").trim()
  if (!id) return null
  try {
    id = decodeURIComponent(id).normalize("NFC")
  } catch {
    id = raw.trim()
  }
  if (/^\d+$/.test(id)) {
    const directNpbMatch = roster.find((r) => r.npb_player_id === id)
    if (directNpbMatch) return directNpbMatch
    const lookupId = resolveNpbPlayerIdFromPublicId(id)
    return roster.find((r) => r.npb_player_id === lookupId) ?? null
  }
  const slugEntry = resolvePlayerSlugEntry(id)
  if (slugEntry) {
    return roster.find((r) => r.npb_player_id === slugEntry.npbPlayerId) ?? null
  }
  const key = rosterNameMatchKey(id)
  const direct = roster.find((r) => rosterNameMatchKey(r.name_ja) === key)
  if (direct) return direct
  const byAltJa = roster.find((r) => rosterJaNameLookupKeys(r.name_ja).includes(key))
  if (byAltJa) return byAltJa
  const en = id.toLowerCase().replace(/\s+/g, " ").trim()
  if (en.length >= 2) {
    const byEn = roster.find((r) => {
      const cands = [
        (r.name_en || "").toLowerCase().trim(),
        (r.name_en_full || "").toLowerCase().trim(),
        (r.name_en_short || "").toLowerCase().trim(),
      ]
      return cands.includes(en)
    })
    if (byEn) return byEn
  }
  return null
}

/**
 * Yahoo 数値 ID だけでは橋渡しに無い選手向けに、canonical の日本語表示名で名簿を再照会する。
 * 投手のみデータに載る・外国籍の「Ｘ．苗字」表記差で ID 照合が外れる場合のフォールバック。
 */
export function findRosterPlayerByPublicIdOrJaName(
  yahooId: string,
  jaHint: string,
): NpbRosterPlayer | null {
  const byId = findRosterPlayerByPublicId(yahooId)
  if (byId) return byId
  const hint = (jaHint || "").trim()
  if (!hint || /^\d+$/.test(hint)) return null
  return findRosterPlayerByPublicId(hint)
}

/**
 * canonical の `yahooPlayersMentioned` 等の日本語ヒントで名簿行を列挙する。
 * `teamFullName` 指定時はその球団のみ（対左右の投手腕解決で同姓別球団の混同を防ぐ）。
 */
export function findRosterPlayersMatchingJaHint(
  jaHint: string,
  opts?: { teamFullName?: string },
): NpbRosterPlayer[] {
  const hint = (jaHint || "").trim()
  if (!hint || /^\d+$/.test(hint)) return []
  const key = rosterNameMatchKey(hint)
  if (!key) return []

  const teamFilter = String(opts?.teamFullName ?? "").trim()
  let roster = getNpbRoster2026()
  if (teamFilter) roster = roster.filter((r) => String(r.team ?? "").trim() === teamFilter)

  const seen = new Set<string>()
  const matches: NpbRosterPlayer[] = []
  for (const r of roster) {
    const id = String(r.npb_player_id ?? "").trim()
    if (!id || seen.has(id)) continue
    const direct = rosterNameMatchKey(r.name_ja) === key
    const alt = rosterJaNameLookupKeys(r.name_ja).includes(key)
    if (!direct && !alt) continue
    seen.add(id)
    matches.push(r)
  }
  return matches
}

/** 候補がちょうど1人のときだけ投球腕を返す（2人以上は推測しない） */
export function throwHandFromUniqueRosterPlayers(players: NpbRosterPlayer[]): "R" | "L" | "" {
  if (players.length !== 1) return ""
  const th = getPlayerHandednessById(players[0]!.npb_player_id).throwHand
  return th === "R" || th === "L" ? th : ""
}
