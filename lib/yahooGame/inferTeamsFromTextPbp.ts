/**
 * Phase 28 用のヘルパー: canonical の `game.scoreboard` と `game.teams` が空でも、
 * `textPlayByPlay[0]` の "試合前情報" 文字列からチーム名・スタメン情報を抽出する。
 *
 * canonical の現行ビルダーは scoreboard / teams を空配列のまま生成し、
 * チーム情報は試合前情報テキスト ("先攻:X..." / "後攻:Y...") にしか含まれていない。
 * Phase 28 はチーム判定なしには R/L 振り分けができないため、ここでテキストから
 * 軽量パースする。
 */
import type {
  CanonicalGameDocument,
  BattingLine,
  PitchingLine,
  LineupPlayer,
  ScoreboardTeamLine,
  TeamBlock,
} from "./types"
import { findRosterPlayerByPublicId } from "../npbRoster"

const TEAM_FULL_NAMES = [
  "千葉ロッテマリーンズ",
  "福岡ソフトバンクホークス",
  "北海道日本ハムファイターズ",
  "東京ヤクルトスワローズ",
  "阪神タイガース",
  "横浜DeNAベイスターズ",
  "広島東洋カープ",
  "読売ジャイアンツ",
  "中日ドラゴンズ",
  "オリックス・バファローズ",
  "埼玉西武ライオンズ",
  "東北楽天ゴールデンイーグルス",
]

/** チーム略称→正式名のマップ（試合前情報テキストの "先攻:X" の X 形式に対応） */
const TEAM_SHORT_TO_FULL: Record<string, string> = {
  "ロッテ": "千葉ロッテマリーンズ",
  "ソフトバンク": "福岡ソフトバンクホークス",
  "日本ハム": "北海道日本ハムファイターズ",
  "ヤクルト": "東京ヤクルトスワローズ",
  "阪神": "阪神タイガース",
  "DeNA": "横浜DeNAベイスターズ",
  "横浜DeNA": "横浜DeNAベイスターズ",
  "ベイスターズ": "横浜DeNAベイスターズ",
  "広島": "広島東洋カープ",
  "カープ": "広島東洋カープ",
  "巨人": "読売ジャイアンツ",
  "読売": "読売ジャイアンツ",
  "中日": "中日ドラゴンズ",
  "オリックス": "オリックス・バファローズ",
  "西武": "埼玉西武ライオンズ",
  "楽天": "東北楽天ゴールデンイーグルス",
  "イーグルス": "東北楽天ゴールデンイーグルス",
}

function compactName(s: string): string {
  return String(s ?? "").replace(/\s/g, "").replace(/　/g, "").trim()
}

function resolveTeamFullName(short: string): string {
  const s = compactName(short)
  if (!s) return ""
  // 既に正式名と一致したらそのまま
  if (TEAM_FULL_NAMES.includes(s)) return s
  // 略称マップ
  if (TEAM_SHORT_TO_FULL[s]) return TEAM_SHORT_TO_FULL[s]!
  // 部分一致（"DeNA" → "横浜DeNAベイスターズ" 等）
  for (const full of TEAM_FULL_NAMES) {
    if (full.includes(s)) return full
  }
  return ""
}

export interface PregameInfo {
  visitorFullName: string
  homeFullName: string
  /** 先攻側のスターティングラインアップ名（"周東" 等の苗字 best-effort） */
  visitorLineupNames: string[]
  homeLineupNames: string[]
  /** 先攻側の先発投手名（best-effort） */
  visitorStarterName: string
  homeStarterName: string
}

/** 試合前情報テキストを軽量パースする。失敗時は null。 */
export function parsePregameInfoFromTextPbp(doc: CanonicalGameDocument): PregameInfo | null {
  const sections = doc.game?.textPlayByPlay ?? []
  const pre = sections.find((s) => String((s as { sectionTitle?: string })?.sectionTitle ?? "") === "試合前情報")
  if (!pre) return null
  const lines = Array.isArray((pre as { lines?: string[] }).lines) ? (pre as { lines: string[] }).lines : []
  const text = lines.join(" ")
  if (!text) return null

  // "先攻:Xのスターティングラインアップは1番: ... 後攻:Yのスターティングラインアップは1番: ..."
  // X / Y は略称（"ロッテ" 等）。"の" の直前まで貪欲にとる。
  const m = text.match(/先攻:(.+?)のスターティングラインアップは(.+?)後攻:(.+?)のスターティングラインアップは(.+?)$/u)
  if (!m) return null
  const visitorShort = m[1]?.trim() ?? ""
  const homeShort = m[3]?.trim() ?? ""
  const visitorLineupRaw = m[2] ?? ""
  const homeLineupRaw = m[4] ?? ""

  const parseLineup = (raw: string): string[] => {
    const out: string[] = []
    // "1番: 周東 (中)、2番: 近藤 (左)、..." を 「、」で分割
    for (const part of raw.split(/、/)) {
      // "1番: 周東 (中)" → 苗字 "周東"
      const mm = part.match(/^\s*\d+番[:：]\s*([^\s(（]+)/u)
      if (mm?.[1]) out.push(compactName(mm[1]))
    }
    return out
  }
  const visitorLineupNames = parseLineup(visitorLineupRaw)
  const homeLineupNames = parseLineup(homeLineupRaw)

  // 先発投手名抽出: "先発ピッチャーは Xが（中6日で）Y、Zが（中7日で）W"
  // X/Y は略称＋投手名。"先攻が先" とは限らない（"ソフトバンクが上沢、ロッテが種市" のように home/visitor の順は固定でない）
  let visitorStarterName = ""
  let homeStarterName = ""
  const starterText = lines[0] ?? ""
  // 簡易: "<チーム略称>(?:が中\d+日で)? <投手名>" を全件取り、それを visitor / home に割り当てる
  const starterRegex = /([^\s、,]+?)が(?:中\d+日で\s*)?([^\s、,]+)/gu
  const starters: Array<{ teamShort: string; pitcher: string }> = []
  for (const sm of starterText.matchAll(starterRegex)) {
    const teamShort = compactName(sm[1] ?? "")
    const pitcher = compactName(sm[2] ?? "")
    if (!teamShort || !pitcher) continue
    if (resolveTeamFullName(teamShort)) starters.push({ teamShort, pitcher })
  }
  for (const st of starters) {
    const full = resolveTeamFullName(st.teamShort)
    if (!full) continue
    if (full === resolveTeamFullName(visitorShort)) visitorStarterName = st.pitcher
    if (full === resolveTeamFullName(homeShort)) homeStarterName = st.pitcher
  }

  return {
    visitorFullName: resolveTeamFullName(visitorShort),
    homeFullName: resolveTeamFullName(homeShort),
    visitorLineupNames,
    homeLineupNames,
    visitorStarterName,
    homeStarterName,
  }
}

/**
 * 試合前情報から推定されるチーム情報を canonical に注入したコピーを返す。
 * `scoreboard` と `teams` が既に埋まっている場合は元の doc を返す。
 *
 * 解決経路（優先順）:
 * 1) 試合前情報テキスト "先攻:X..." / "後攻:Y..." をパース（visitor / home が確定）
 * 2) (1) が失敗したら、battingLines + pitchingLines の playerId 群を roster で照合し、
 *    出現頻度の上位 2 チームを visitor / home として採用（順序は不確定なので後段で
 *    PA 半回などから補正可能）。
 *
 * teams[].startingLineup は battingLines / pitchingLines の playerName を name → yahooPlayerId
 * のマップとして使い、ラインアップ名と苗字一致した場合のみ player を入れる（best-effort）。
 */
export function injectTeamsFromTextPbpIfMissing(doc: CanonicalGameDocument): CanonicalGameDocument {
  const board = doc.game?.scoreboard ?? []
  const teams = doc.game?.teams ?? []
  if (board.length >= 2 && teams.length >= 2) return doc
  let pre = parsePregameInfoFromTextPbp(doc)
  if (!pre || !pre.visitorFullName || !pre.homeFullName) {
    // フォールバック: 試合に登場した batter/pitcher の roster.team を頻度集計し、上位 2 チームを採用
    const teamCount = new Map<string, number>()
    const bumpFromYid = (yid: string): void => {
      const id = String(yid ?? "").trim()
      if (!id) return
      const r = findRosterPlayerByPublicId(id)
      const t = String(r?.team ?? "").trim()
      if (!t) return
      teamCount.set(t, (teamCount.get(t) ?? 0) + 1)
    }
    for (const bl of doc.domain?.battingLines ?? []) bumpFromYid(String(bl.yahooPlayerId ?? ""))
    for (const pl of doc.domain?.pitchingLines ?? []) bumpFromYid(String(pl.yahooPlayerId ?? ""))
    const top = [...teamCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
    if (top.length >= 2) {
      // 順序は不確定だが、Phase 28 が必要とする「visitor/home の正式名 2 つ」が確実に得られる。
      pre = {
        visitorFullName: top[0]![0],
        homeFullName: top[1]![0],
        visitorLineupNames: [],
        homeLineupNames: [],
        visitorStarterName: "",
        homeStarterName: "",
      }
    } else {
      return doc
    }
  }

  const battingLines: BattingLine[] = doc.domain?.battingLines ?? []
  const pitchingLines: PitchingLine[] = doc.domain?.pitchingLines ?? []
  // 苗字 → yahooPlayerId のマップ。同姓は最初の 1 件で打ち切り（簡易）。
  const surnameToId = new Map<string, string>()
  const addByName = (name: string, yid: string): void => {
    if (!yid) return
    const trimmed = String(name ?? "").trim()
    if (!trimmed) return
    const compact = compactName(trimmed)
    if (compact && !surnameToId.has(compact)) surnameToId.set(compact, yid)
    // canonical の表示は "周東 佑京" 形式。先頭トークン（苗字）を採用。
    const tokens = trimmed.split(/\s+/u)
    if (tokens.length > 0) {
      const surname = compactName(tokens[0] ?? "")
      if (surname && !surnameToId.has(surname)) surnameToId.set(surname, yid)
    }
    // 外国籍（"Ｆ．レイエス" → "レイエス"、"H.メヒア" → "メヒア"）の接頭辞除去
    const cleaned = compact
      .replace(/^[Ａ-Ｚ][．・]/u, "")
      .replace(/^[A-Z][.\u30FB]/u, "")
    if (cleaned && cleaned !== compact && !surnameToId.has(cleaned)) {
      surnameToId.set(cleaned, yid)
    }
  }
  for (const bl of battingLines) addByName(String(bl.playerName ?? ""), String(bl.yahooPlayerId ?? ""))
  for (const pl of pitchingLines) addByName(String(pl.playerName ?? ""), String(pl.yahooPlayerId ?? ""))

  const buildLineup = (surnames: string[], starterName: string): LineupPlayer[] => {
    const out: LineupPlayer[] = []
    for (let i = 0; i < surnames.length; i++) {
      const sn = surnames[i] ?? ""
      const yid = surnameToId.get(sn) ?? ""
      if (!yid) continue
      out.push({
        battingOrder: String(i + 1),
        fieldingPosition: "",
        playerName: sn,
        yahooPlayerId: yid,
      })
    }
    const starterYid = starterName ? surnameToId.get(starterName) ?? "" : ""
    if (starterYid && !out.some((p) => p.yahooPlayerId === starterYid)) {
      out.push({
        battingOrder: "9",
        fieldingPosition: "投",
        playerName: starterName,
        yahooPlayerId: starterYid,
      })
    }
    return out
  }

  const newScoreboard: ScoreboardTeamLine[] = board.length >= 2
    ? (board as ScoreboardTeamLine[])
    : [
        { teamName: pre.visitorFullName, yahooTeamId: null, innings: [] },
        { teamName: pre.homeFullName, yahooTeamId: null, innings: [] },
      ]
  const newTeams: TeamBlock[] = teams.length >= 2
    ? (teams as TeamBlock[])
    : [
        {
          yahooTeamId: null,
          teamName: pre.visitorFullName,
          startingLineup: buildLineup(pre.visitorLineupNames, pre.visitorStarterName),
        },
        {
          yahooTeamId: null,
          teamName: pre.homeFullName,
          startingLineup: buildLineup(pre.homeLineupNames, pre.homeStarterName),
        },
      ]

  return {
    ...doc,
    game: {
      ...doc.game,
      scoreboard: newScoreboard,
      teams: newTeams,
    },
  } as CanonicalGameDocument
}
