/**
 * 投手個人ページ計画 Phase 1（PoC）: canonical から投手別の派生 JSON を一括生成する。
 *
 * 入力: `loadCanonicalGamesMergedForDerivedPipeline`（Phase11 と同一: 一球マージ済み canonical）
 * 名簿: `_data/npb_roster_2026.csv`
 *
 * 出力:
 *   _data/derived/player_season_pitching_poc/{year}/npb_{npbPlayerId}.json
 *
 * 内容:
 *   - basic: コア実績は aggregatePitchingSeasonByYahooPlayer（mergePitchingLinesInGame 起点／phase19 と同一）を
 *     NPB 単位に合算。名簿で npb_player_id に紐付けた行
 *     加えて試合単位集計: 先発/救援回数、ホールド数、完投・完封（単独登板かつ 27 outs 以上の参考値）、
 *     故意四（一球ログの敬遠/故意四球）、先発ベースの QS 回数・QS 率、登板数
 *   - splits.vsHand / bySituation / byInning: plateAppearances から対象投手（yahooPitcherId）で集計
 *     （左右はスタメン → yahooPlayersMentioned + 名簿 bat_hand: resolveBatHandJaForBatter。
 *      両打者は投手の投球腕に応じて右打／左打に換算: 左投→右打側、右投→左打側）
 *   - splits.byStadium: 試合ごとの pitchingLines を yahoo_game_meta の球場名で合算
 *   - splits.byOpponentTeam: 試合ごとの pitchingLines を対戦相手チーム名（scoreboard）で合算
 *   - splits.byDayNight: 試合ごとの pitchingLines を yahoo_game_meta のデー/ナイターで合算
 *
 * 使い方:
 *   npx tsx scripts/phase_pitcher_poc1_build_from_canonical.ts --year 2026
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument, PlateAppearance, PitchingLine } from "../lib/yahooGame/types"
import { yahooPitcherIdForVsHandFromPa } from "../lib/yahooGame/yahooPitcherIdForVsHandFromPa"
import { isStrikeoutResultJa } from "../lib/yahooGame/paOutcomeResultJa"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  aggregatePitchingSeasonByYahooPlayer,
  foldYahooPitchingAggIntoNpb,
  sumPitchingSeasonAggYahoo,
  type PitchingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalPitchingSeasonAgg"
import { pitchingSeasonRowStatsFromAgg } from "../lib/yahooGame/pitchingRowMetricsFromAgg"
import { addPitcherPaCount, fmtAvg, lastPitchResult } from "../lib/yahooGame/pitcherPaResultCommon"
import { classifyBattedBallOutForGoAo } from "../lib/yahooGame/pitcherGoAoFromResult"
import {
  comparePlateAppearances,
  npbForYahooPitcher,
  parsePaId,
  resolveNpbForPitcherLine,
  teamForYahooPlayerId,
} from "../lib/yahooGame/pitcherPocHelpers"
import { isIntentionalWalkResultText } from "../lib/baseballWalkResult"
import {
  applyPlayResult,
  classifySituationAtPaStart,
  emptyGameState,
} from "../lib/yahooGame/paSituationSim"
import { getNpbRoster2026 } from "../lib/npbRoster"
import {
  effectiveVsHandBucketForPitcherSplit,
  resolveBatHandJaForBatter,
} from "../lib/yahooGame/batterHandFromCanonical"
import { parseRosterCsv, type RosterRow } from "../lib/yahooGame/rosterCsv"
import type {
  PitcherSeasonPocPayload,
  PitcherSeasonPocStadiumRow,
} from "../lib/pitcherSeasonPocTypes"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

type YahooGameMetaV1 = {
  schemaVersion: "yahoo-npb-game-meta-v1"
  gameId: string
  fetchedAt?: string
  meta?: {
    gameDateYmd?: string | null
    startTimeLocal?: string | null
    stadiumName?: string | null
    dayNight?: { kind?: "day" | "night" } | null
    scoreboardTeamOrder?: Array<{ role?: "visitor" | "home"; teamName?: string }>
    titleHomeTeamName?: string | null
    titleVisitorTeamName?: string | null
  }
}

function loadYahooGameMeta(projectRoot: string, gameId: string): YahooGameMetaV1 | null {
  const p = join(projectRoot, "_data", "yahoo_game_meta", `${gameId}.json`)
  if (!existsSync(p)) return null
  try {
    const raw = readFileSync(p, "utf8")
    const j = JSON.parse(raw) as YahooGameMetaV1
    if (j?.schemaVersion !== "yahoo-npb-game-meta-v1" || j.gameId !== gameId) return null
    return j
  } catch {
    return null
  }
}

function teamsRoughlyInclude(a: string, b: string): boolean {
  const x = (a || "").replace(/\s+/g, "").trim()
  const y = (b || "").replace(/\s+/g, "").trim()
  if (!x || !y) return false
  return x.includes(y) || y.includes(x)
}

function loadExistingPitcherPocPayload(
  outDir: string,
  npbPlayerId: string
): PitcherSeasonPocPayload | null {
  const p = join(outDir, `npb_${npbPlayerId}.json`)
  if (!existsSync(p)) return null
  try {
    const raw = readFileSync(p, "utf8")
    const j = JSON.parse(raw) as PitcherSeasonPocPayload
    if (j?.schemaVersion !== "phase-pitcher-poc-season-v1" || j.npbPlayerId !== npbPlayerId) return null
    return j
  } catch {
    return null
  }
}

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    }
  }
  return { year }
}

function ipToOuts(ip: string | undefined): number {
  if (!ip) return 0
  const t = ip.trim()
  if (!t) return 0
  if (t.includes(".")) {
    const [w, frac] = t.split(".")
    const whole = parseInt(w, 10) || 0
    const f = parseInt(frac ?? "0", 10) || 0
    return whole * 3 + Math.min(2, f)
  }
  const n = parseInt(t, 10)
  return Number.isFinite(n) ? n * 3 : 0
}

function outsToIpDisplay(outs: number): string {
  if (outs <= 0) return "0"
  const w = Math.floor(outs / 3)
  const f = outs % 3
  if (f === 0) return String(w)
  return `${w}.${f}`
}

function outsAddedFromPaResult(rawResult: string): 0 | 1 | 2 {
  const r = (rawResult ?? "").trim()
  if (!r) return 0
  if (/併殺/.test(r)) return 2
  if (/犠打|送りバント|投犠打|犠飛/.test(r)) return 1
  if (isStrikeoutResultJa(r)) return 1
  // 凡退扱い（エラー等を含む。公式のアウト数と一致しない場合あり）
  if (
    /飛|ゴロ|直|封殺|失策|エラー|野選|犠|振り逃げ/.test(r) &&
    !/本塁打|ホームラン|HR|三塁打|二塁打|安打|ヒット|四球|敬遠|死球/.test(r)
  ) {
    return 1
  }
  return 0
}

function halfKeyFromPaId(paId: string): string | null {
  const parts = (paId ?? "").split("-")
  if (parts.length < 4) return null
  const inning = parts[parts.length - 3]
  const halfStr = parts[parts.length - 2]
  if (halfStr !== "表" && halfStr !== "裏") return null
  return `${inning}-${halfStr}`
}

function compareHalfKeys(a: string, b: string): number {
  const [ia, ta] = a.split("-")
  const [ib, tb] = b.split("-")
  const nia = parseInt(ia, 10) || 0
  const nib = parseInt(ib, 10) || 0
  if (nia !== nib) return nia - nib
  if (ta === tb) return 0
  return ta === "表" ? -1 : 1
}

type MergedPitching = {
  yahooPlayerId: string
  playerName: string
  outs: number
  bf: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  bk: number
  r: number
  er: number
  pitches: number
  decision: PitchingLine["decision"]
}

function mergePitchingLines(lines: PitchingLine[]): Map<string, MergedPitching> {
  const byYahoo = new Map<string, MergedPitching>()
  for (const pl of lines) {
    const yid = (pl.yahooPlayerId ?? "").trim()
    if (!yid) continue
    const bf = pl.bf
    const ip = pl.ip
    if (bf == null && !ip) continue

    let m = byYahoo.get(yid)
    if (!m) {
      m = {
        yahooPlayerId: yid,
        playerName: pl.playerName,
        outs: 0,
        bf: 0,
        h: 0,
        hr: 0,
        so: 0,
        bb: 0,
        hbp: 0,
        bk: 0,
        r: 0,
        er: 0,
        pitches: 0,
        decision: null,
      }
      byYahoo.set(yid, m)
    }
    m.outs += ipToOuts(pl.ip)
    m.bf += pl.bf ?? 0
    m.h += pl.h ?? 0
    m.hr += pl.hr ?? 0
    m.so += pl.so ?? 0
    m.bb += pl.bb ?? 0
    m.hbp += pl.hbp ?? 0
    m.bk += pl.bk ?? 0
    m.r += pl.r ?? 0
    m.er += pl.er ?? 0
    m.pitches += pl.pitches ?? 0
    if (pl.decision === "win") m.decision = "win"
    else if (pl.decision === "loss" && m.decision !== "win") m.decision = "loss"
    else if (pl.decision === "save" && !m.decision) m.decision = "save"
    else if (pl.decision === "hold" && !m.decision) m.decision = "hold"
  }
  return byYahoo
}

type SeasonAgg = {
  gamesStarted: number
  gamesInRelief: number
  holds: number
  completeGames: number
  shutouts: number
  qsCount: number
  winCount: number
  lossCount: number
  saveCount: number
}

function emptySeasonAgg(): SeasonAgg {
  return {
    gamesStarted: 0,
    gamesInRelief: 0,
    holds: 0,
    completeGames: 0,
    shutouts: 0,
    qsCount: 0,
    winCount: 0,
    lossCount: 0,
    saveCount: 0,
  }
}

/** scoreboard の2チームから、投手側名簿 team 文字列に対する対戦相手を推定 */
function opponentTeamName(canonical: CanonicalGameDocument, pitcherTeam: string): string {
  const board = canonical.game.scoreboard ?? []
  if (board.length < 2) return ""
  const names = board.map((r) => (r.teamName ?? "").trim()).filter(Boolean)
  if (names.length !== 2) return ""
  const h = pitcherTeam || ""
  const isHiroshima = h.includes("広島") || h.includes("カープ")
  const isChunichi = h.includes("中日")
  if (isHiroshima) return names.find((n) => n.includes("中日")) ?? ""
  if (isChunichi) return names.find((n) => n.includes("広島") || n.includes("カープ")) ?? ""
  return names[0] === h ? names[1]! : names[0]!
}

function main(): void {
  const { year } = parseArgs()
  const rosterPath = join(projectRoot, "_data", "npb_roster_2026.csv")
  if (!existsSync(rosterPath)) {
    console.error("[phase_pitcher_poc1] missing roster:", rosterPath)
    process.exit(1)
  }
  const roster = parseRosterCsv(readFileSync(rosterPath, "utf8"))
  const rosterForBatHand = getNpbRoster2026()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  if (docs.length === 0) {
    console.error("[phase_pitcher_poc1] no canonical games under _data/scraped_games/canonical/")
    process.exit(1)
  }

  /** gameId -> 球場名（yahoo_game_meta。無ければ「未設定」） */
  const stadiumByGameId = new Map<string, string>()
  /** gameId -> デー/ナイター（メタ欠落は「未設定」） */
  const dayNightByGameId = new Map<string, "day" | "night" | "未設定">()
  for (const doc of docs) {
    const meta = loadYahooGameMeta(projectRoot, doc.gameId)
    const name = (meta?.meta?.stadiumName ?? "").trim()
    stadiumByGameId.set(doc.gameId, name || "未設定")
    const dk = meta?.meta?.dayNight?.kind
    dayNightByGameId.set(
      doc.gameId,
      dk === "day" || dk === "night" ? dk : "未設定",
    )
  }

  /** npb -> accumulate across games */
  const byNpb = new Map<
    string,
    {
      yahooPitcherIds: Set<string>
      playerName: string
      team: string
      gameIds: Set<string>
      merged: MergedPitching
    }
  >()

  /**
   * yahooPitcherId -> npbPlayerId
   *
   * plateAppearances 側の yahooPitcherId を毎回 roster 照合し直すと、
   * doc の揺れ（domain 欠け / pitchingLines 不完全など）で取りこぼしが起きやすい。
   * まず pitchingLines 側で確定した対応表を作り、打席ループではそれを参照する。
   */
  const npbByYahooPitcherId = new Map<string, string>()

  for (const doc of docs) {
    const mergedLines = mergePitchingLines(doc.domain?.pitchingLines ?? [])
    for (const m of mergedLines.values()) {
      const lineLike: PitchingLine = {
        yahooPlayerId: m.yahooPlayerId,
        playerName: m.playerName,
        ip: outsToIpDisplay(m.outs),
        bf: m.bf,
        h: m.h,
        hr: m.hr,
        so: m.so,
        bb: m.bb,
        hbp: m.hbp,
        bk: m.bk,
        r: m.r,
        er: m.er,
        pitches: m.pitches,
        decision: m.decision,
        inferredFrom: "stats_row_v0",
      }
      const hit = resolveNpbForPitcherLine(roster, doc, lineLike)
      if (!hit) {
        console.warn(
          `[phase_pitcher_poc1] skip yahoo pitcher ${m.yahooPlayerId} (${m.playerName}) — no npb match`,
        )
        continue
      }
      const npb = hit.npbPlayerId
      let row = byNpb.get(npb)
      if (!row) {
        row = {
          yahooPitcherIds: new Set(),
          playerName: m.playerName,
          team: hit.team,
          gameIds: new Set(),
          merged: {
            yahooPlayerId: m.yahooPlayerId,
            playerName: m.playerName,
            outs: 0,
            bf: 0,
            h: 0,
            hr: 0,
            so: 0,
            bb: 0,
            hbp: 0,
            bk: 0,
            r: 0,
            er: 0,
            pitches: 0,
            decision: null,
          },
        }
        byNpb.set(npb, row)
      }
      row.yahooPitcherIds.add(m.yahooPlayerId)
      npbByYahooPitcherId.set(m.yahooPlayerId, npb)
      row.gameIds.add(doc.gameId)
      row.merged.outs += m.outs
      row.merged.bf += m.bf
      row.merged.h += m.h
      row.merged.hr += m.hr
      row.merged.so += m.so
      row.merged.bb += m.bb
      row.merged.hbp += m.hbp
      row.merged.bk += m.bk
      row.merged.r += m.r
      row.merged.er += m.er
      row.merged.pitches += m.pitches
      if (m.decision === "win") row.merged.decision = "win"
      else if (m.decision === "loss" && row.merged.decision !== "win") row.merged.decision = "loss"
      else if (m.decision === "save" && !row.merged.decision) row.merged.decision = "save"
      else if (m.decision === "hold" && !row.merged.decision) row.merged.decision = "hold"
    }
  }

  /** pitchingLines を球場別に合算（1 試合=1 登板行あたり games++、QS は 6 回以上かつ自責 3 以下） */
  type StadiumLineAgg = {
    outs: number
    bf: number
    h: number
    hr: number
    so: number
    bb: number
    hbp: number
    bk: number
    r: number
    er: number
    pitches: number
    wins: number
    losses: number
    games: number
    qsCount: number
  }
  const emptyStadiumLineAgg = (): StadiumLineAgg => ({
    outs: 0,
    bf: 0,
    h: 0,
    hr: 0,
    so: 0,
    bb: 0,
    hbp: 0,
    bk: 0,
    r: 0,
    er: 0,
    pitches: 0,
    wins: 0,
    losses: 0,
    games: 0,
    qsCount: 0,
  })
  const stadiumPitchByNpb = new Map<string, Map<string, StadiumLineAgg>>()
  function ensureStadiumLineAgg(npb: string, stadiumKey: string): StadiumLineAgg {
    let m = stadiumPitchByNpb.get(npb)
    if (!m) {
      m = new Map()
      stadiumPitchByNpb.set(npb, m)
    }
    let a = m.get(stadiumKey)
    if (!a) {
      a = emptyStadiumLineAgg()
      m.set(stadiumKey, a)
    }
    return a
  }

  for (const doc of docs) {
    const stadiumKey = stadiumByGameId.get(doc.gameId) ?? "未設定"
    const mergedLines = mergePitchingLines(doc.domain?.pitchingLines ?? [])
    for (const m of mergedLines.values()) {
      const npb = npbByYahooPitcherId.get(m.yahooPlayerId)
      if (!npb || !byNpb.has(npb)) continue
      const a = ensureStadiumLineAgg(npb, stadiumKey)
      a.outs += m.outs
      a.bf += m.bf
      a.h += m.h
      a.hr += m.hr
      a.so += m.so
      a.bb += m.bb
      a.hbp += m.hbp
      a.bk += m.bk
      a.r += m.r
      a.er += m.er
      a.pitches += m.pitches
      a.games += 1
      if (m.outs >= 18 && m.er <= 3) a.qsCount += 1
      if (m.decision === "win") a.wins += 1
      else if (m.decision === "loss") a.losses += 1
    }
  }

  /** pitchingLines を対戦相手別に合算（1 試合あたり games++、QS は 6 回以上かつ自責 3 以下） */
  const opponentPitchByNpb = new Map<string, Map<string, StadiumLineAgg>>()
  function ensureOpponentLineAgg(npb: string, oppKey: string): StadiumLineAgg {
    let m = opponentPitchByNpb.get(npb)
    if (!m) {
      m = new Map()
      opponentPitchByNpb.set(npb, m)
    }
    let a = m.get(oppKey)
    if (!a) {
      a = emptyStadiumLineAgg()
      m.set(oppKey, a)
    }
    return a
  }

  for (const doc of docs) {
    const mergedLines = mergePitchingLines(doc.domain?.pitchingLines ?? [])
    for (const m of mergedLines.values()) {
      const npb = npbByYahooPitcherId.get(m.yahooPlayerId)
      if (!npb || !byNpb.has(npb)) continue
      const pitcherRow = byNpb.get(npb)!
      const opp = opponentTeamName(doc, pitcherRow.team)
      const oppKey = (opp || "").trim() || "未設定"
      const a = ensureOpponentLineAgg(npb, oppKey)
      a.outs += m.outs
      a.bf += m.bf
      a.h += m.h
      a.hr += m.hr
      a.so += m.so
      a.bb += m.bb
      a.hbp += m.hbp
      a.bk += m.bk
      a.r += m.r
      a.er += m.er
      a.pitches += m.pitches
      a.games += 1
      if (m.outs >= 18 && m.er <= 3) a.qsCount += 1
      if (m.decision === "win") a.wins += 1
      else if (m.decision === "loss") a.losses += 1
    }
  }

  /** pitchingLines をデー/ナイター別に合算（1 試合あたり games++、QS は 6 回以上かつ自責 3 以下） */
  const dayNightPitchByNpb = new Map<string, Map<string, StadiumLineAgg>>()
  function ensureDayNightLineAgg(npb: string, dnKey: string): StadiumLineAgg {
    let m = dayNightPitchByNpb.get(npb)
    if (!m) {
      m = new Map()
      dayNightPitchByNpb.set(npb, m)
    }
    let a = m.get(dnKey)
    if (!a) {
      a = emptyStadiumLineAgg()
      m.set(dnKey, a)
    }
    return a
  }

  for (const doc of docs) {
    const dnKey = dayNightByGameId.get(doc.gameId) ?? "未設定"
    const mergedLines = mergePitchingLines(doc.domain?.pitchingLines ?? [])
    for (const m of mergedLines.values()) {
      const npb = npbByYahooPitcherId.get(m.yahooPlayerId)
      if (!npb || !byNpb.has(npb)) continue
      const a = ensureDayNightLineAgg(npb, dnKey)
      a.outs += m.outs
      a.bf += m.bf
      a.h += m.h
      a.hr += m.hr
      a.so += m.so
      a.bb += m.bb
      a.hbp += m.hbp
      a.bk += m.bk
      a.r += m.r
      a.er += m.er
      a.pitches += m.pitches
      a.games += 1
      if (m.outs >= 18 && m.er <= 3) a.qsCount += 1
      if (m.decision === "win") a.wins += 1
      else if (m.decision === "loss") a.losses += 1
    }
  }

  /** PA splits: npb -> maps */
  type PaAgg = {
    bf: number
    ab: number
    h: number
    hr: number
    so: number
    bb: number
    hbp: number
    outs: number
    /** 自責点（近似）: textPlayByPlay のスコア差分から推定。エラー絡みは未補正。 */
    er: number
  }
  const emptyPaAgg = (): PaAgg => ({ bf: 0, ab: 0, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, outs: 0, er: 0 })

  function isPaLikePlayByPlayLine(line: string): boolean {
    const s = (line ?? "").trim()
    if (!s) return false
    // 明示的に「打席の結果」ではないメモ類
    if (s.startsWith("－")) return false
    if (/けん制|コーチマウンド|タイム|守備交代|投手交代|代打|代走|盗塁|暴投|ボーク/.test(s)) return false
    // 典型的な打席結果
    return /アウト|ヒット|安打|二塁打|三塁打|本塁打|ホームラン|四球|敬遠|死球|三振|併殺|犠打|犠飛/.test(s)
  }

  function parseInningHalfFromSectionTitle(t: string): { inning: number; half: "表" | "裏" } | null {
    const s = (t ?? "").trim()
    const m = s.match(/^(\d+)回(表|裏)$/)
    if (!m) return null
    const inning = parseInt(m[1] ?? "", 10)
    const half = (m[2] ?? "") as "表" | "裏"
    if (!Number.isFinite(inning) || inning <= 0) return null
    return { inning, half }
  }

  function scoreBeforeHalf(
    scoreboard: Array<{ innings?: string[]; teamName?: string }>,
    battingIndex: 0 | 1,
    inning: number
  ): number {
    const inn = scoreboard?.[battingIndex]?.innings ?? []
    const end = Math.max(0, Math.min(inn.length, inning - 1))
    let sum = 0
    for (let i = 0; i < end; i++) {
      const n = parseInt(String(inn[i] ?? "0").replace(/[^\d]/g, ""), 10)
      if (Number.isFinite(n)) sum += n
    }
    return sum
  }

  function buildEstimatedErByPaId(doc: CanonicalGameDocument): Map<string, number> {
    const out = new Map<string, number>()
    const scoreboard = doc.game?.scoreboard ?? []
    if (scoreboard.length < 2) return out

    const pas = [...(doc.domain?.plateAppearances ?? [])].sort(comparePlateAppearances)
    const pasByHalf = new Map<string, PlateAppearance[]>()
    for (const pa of pas) {
      const hk = halfKeyFromPaId(pa.paId)
      if (!hk) continue
      const list = pasByHalf.get(hk) ?? []
      list.push(pa)
      pasByHalf.set(hk, list)
    }

    const mark0 = ((scoreboard[0]?.teamName ?? "").trim()[0] ?? "").trim()
    const mark1 = ((scoreboard[1]?.teamName ?? "").trim()[0] ?? "").trim()
    const markToIdx = new Map<string, 0 | 1>()
    if (mark0) markToIdx.set(mark0, 0)
    if (mark1) markToIdx.set(mark1, 1)

    const sections = doc.game?.textPlayByPlay ?? []
    for (const sec of sections) {
      const parsed = parseInningHalfFromSectionTitle(sec.sectionTitle)
      if (!parsed) continue
      const hk = `${parsed.inning}-${parsed.half}`
      const paList = pasByHalf.get(hk) ?? []
      if (paList.length === 0) continue

      const battingIndex: 0 | 1 = parsed.half === "表" ? 0 : 1
      let prevBattingScore = scoreBeforeHalf(scoreboard, battingIndex, parsed.inning)

      let paIdx = 0
      for (const rawLine of sec.lines ?? []) {
        const line = (rawLine ?? "").trim()
        if (!line) continue

        // スコア表記（例: "広 0-1 中"）から打撃側の得点増分を推定
        let delta = 0
        const m = line.match(/([^\s])\s*(\d+)-(\d+)\s*([^\s])/)
        if (m) {
          const aMark = (m[1] ?? "").trim()
          const bMark = (m[4] ?? "").trim()
          const aScore = parseInt(m[2] ?? "0", 10) || 0
          const bScore = parseInt(m[3] ?? "0", 10) || 0
          const aIdx = markToIdx.get(aMark) ?? null
          const bIdx = markToIdx.get(bMark) ?? null
          const battingScore =
            battingIndex === aIdx ? aScore : battingIndex === bIdx ? bScore : null
          if (battingScore != null) {
            delta = Math.max(0, battingScore - prevBattingScore)
            prevBattingScore = battingScore
          }
        }

        if (!isPaLikePlayByPlayLine(line)) continue
        const pa = paList[paIdx]
        if (!pa) break
        if (delta > 0) out.set(pa.paId, (out.get(pa.paId) ?? 0) + delta)
        paIdx += 1
      }
    }

    return out
  }

  const vsHand = new Map<string, { vsR: PaAgg; vsL: PaAgg; vsB: PaAgg; vsUnknown: PaAgg }>()
  const bySit = new Map<string, Map<string, PaAgg>>()
  const byInn = new Map<string, Map<number, PaAgg>>()
  const byPaRound = new Map<string, Map<string, PaAgg>>()
  const byPaRoundPitchTypes = new Map<string, Map<string, Map<string, number>>>()
  const goAoByNpb = new Map<string, { go: number; ao: number }>()

  function addGoAo(npb: string, kind: ReturnType<typeof classifyBattedBallOutForGoAo>) {
    if (kind === "none") return
    const cur = goAoByNpb.get(npb) ?? { go: 0, ao: 0 }
    if (kind === "ground") cur.go += 1
    else cur.ao += 1
    goAoByNpb.set(npb, cur)
  }

  function ensureHand(npb: string) {
    let h = vsHand.get(npb)
    if (!h) {
      h = { vsR: emptyPaAgg(), vsL: emptyPaAgg(), vsB: emptyPaAgg(), vsUnknown: emptyPaAgg() }
      vsHand.set(npb, h)
    }
    return h
  }
  function ensureSit(npb: string) {
    let m = bySit.get(npb)
    if (!m) {
      m = new Map()
      bySit.set(npb, m)
    }
    return m
  }
  function ensureInn(npb: string) {
    let m = byInn.get(npb)
    if (!m) {
      m = new Map()
      byInn.set(npb, m)
    }
    return m
  }
  function ensurePaRound(npb: string) {
    let m = byPaRound.get(npb)
    if (!m) {
      m = new Map()
      byPaRound.set(npb, m)
    }
    return m
  }
  function ensurePaRoundPitchTypes(npb: string) {
    let m = byPaRoundPitchTypes.get(npb)
    if (!m) {
      m = new Map()
      byPaRoundPitchTypes.set(npb, m)
    }
    return m
  }

  const ibbByNpb = new Map<string, number>()

  for (const doc of docs) {
    const pas = [...(doc.domain?.plateAppearances ?? [])].sort(comparePlateAppearances)
    const erByPaId = buildEstimatedErByPaId(doc)
    const bfInGameByNpb = new Map<string, number>()

    for (const pa of pas) {
      const pid = yahooPitcherIdForVsHandFromPa(pa)
      if (!pid) continue
      const npb = npbByYahooPitcherId.get(pid) ?? null
      if (!npb || !byNpb.has(npb)) continue

      const res = lastPitchResult(pa)
      const erDelta = erByPaId.get(pa.paId) ?? 0
      if (isIntentionalWalkResultText(res)) {
        ibbByNpb.set(npb, (ibbByNpb.get(npb) ?? 0) + 1)
      }
      const outsAdded = outsAddedFromPaResult(res)
      addGoAo(npb, classifyBattedBallOutForGoAo(res))

      // 巡目別の球種投球数: 各球はその球の投手 ID に帰す（打席途中交代で先発の球が後任に丸ごと載らないようにする）。
      // 巡目キーは「その投手にとこの打席が始まる前の BF 順」から決める（下の BF 加算より前）。
      {
        const ev = pa.pitchEvents ?? []
        if (ev.length > 0) {
          for (const e of ev) {
            const ePid = String(e.yahooPitcherId ?? "").trim() || pid
            const eNpb = npbByYahooPitcherId.get(ePid) ?? null
            if (!eNpb || !byNpb.has(eNpb)) continue
            const idx0 = bfInGameByNpb.get(eNpb) ?? 0
            const round0 = Math.min(5, Math.floor(idx0 / 9) + 1)
            const key0 = String(round0)
            const rm = ensurePaRoundPitchTypes(eNpb)
            const tm = rm.get(key0) ?? new Map<string, number>()
            const pt = (e.pitchTypeJa ?? "").trim() || "不明"
            tm.set(pt, (tm.get(pt) ?? 0) + 1)
            rm.set(key0, tm)
          }
        }
      }

      // 巡目別（1〜5巡目以上）: 1試合内の BF 順（概算）で 9 人ごとに巡目を進める。
      // （打者側の打順循環を厳密に追わず、投手側の被打撃を「何巡目か」の目安として扱う）
      {
        const idx = bfInGameByNpb.get(npb) ?? 0
        bfInGameByNpb.set(npb, idx + 1)
        const round = Math.min(5, Math.floor(idx / 9) + 1)
        const key = String(round)
        const pm = ensurePaRound(npb)
        const agg = pm.get(key) ?? emptyPaAgg()
        addPitcherPaCount(agg, res)
        agg.outs += outsAdded
        agg.er += erDelta
        pm.set(key, agg)
      }

      const bid = (pa.yahooBatterId ?? "").trim()
      const batJa = bid ? resolveBatHandJaForBatter(doc, bid, rosterForBatHand) : ""
      const pitcherThrowRaw = (
        rosterForBatHand.find((r) => r.npb_player_id === npb)?.throw_hand ?? ""
      ).toUpperCase()
      const pitcherThrow: "R" | "L" | "" =
        pitcherThrowRaw === "R" || pitcherThrowRaw === "L" ? pitcherThrowRaw : ""
      const bats = effectiveVsHandBucketForPitcherSplit(batJa, pitcherThrow)
      const hand = ensureHand(npb)
      if (bats === "L") {
        addPitcherPaCount(hand.vsL, res)
        hand.vsL.outs += outsAdded
        hand.vsL.er += erDelta
      } else if (bats === "R") {
        addPitcherPaCount(hand.vsR, res)
        hand.vsR.outs += outsAdded
        hand.vsR.er += erDelta
      } else {
        addPitcherPaCount(hand.vsUnknown, res)
        hand.vsUnknown.outs += outsAdded
        hand.vsUnknown.er += erDelta
      }

      const parsed = parsePaId(pa.paId)
      if (parsed) {
        const im = ensureInn(npb)
        const innAgg = im.get(parsed.inning) ?? emptyPaAgg()
        addPitcherPaCount(innAgg, res)
        innAgg.outs += outsAdded
        innAgg.er += erDelta
        im.set(parsed.inning, innAgg)
      }
    }

    const halfGroups = new Map<string, PlateAppearance[]>()
    for (const pa of pas) {
      const hk = halfKeyFromPaId(pa.paId)
      if (!hk) continue
      const list = halfGroups.get(hk) ?? []
      list.push(pa)
      halfGroups.set(hk, list)
    }
    const sortedHalfKeys = [...halfGroups.keys()].sort(compareHalfKeys)
    for (const hk of sortedHalfKeys) {
      let state = emptyGameState()
      const groupPas = halfGroups.get(hk) ?? []
      for (const pa of groupPas) {
        const pid = yahooPitcherIdForVsHandFromPa(pa)
        if (!pid) continue
        const npb = npbByYahooPitcherId.get(pid) ?? null
        if (!npb || !byNpb.has(npb)) continue
        const res = lastPitchResult(pa)
        const { detail, risp } = classifySituationAtPaStart(state.b)
        const sm = ensureSit(npb)
        const add = (key: string) => {
          const agg = sm.get(key) ?? emptyPaAgg()
          addPitcherPaCount(agg, res)
          agg.outs += outsAddedFromPaResult(res)
          agg.er += erByPaId.get(pa.paId) ?? 0
          sm.set(key, agg)
        }
        add(detail)
        if (risp) add("risp")
        // 非得点圏: 2・3塁走者なし（ランナーなし・1塁のみ）。noRispRunner だけだと無走者が漏れる。
        if (!risp) add("no_risp")
        state = applyPlayResult(state, res)
      }
    }
  }

  /** 先発/QS/セーブ等: canonicalPitchingSeasonAgg（phase19 と同一） */
  const yahooSeasonFull = aggregatePitchingSeasonByYahooPlayer(docs)
  const yahooOnlyAgg = new Map(
    [...yahooSeasonFull.entries()].map(([yid, { agg }]) => [yid, agg] as const),
  )
  const folded = foldYahooPitchingAggIntoNpb(
    yahooOnlyAgg,
    npbByYahooPitcherId,
    new Set(byNpb.keys()),
  )
  const seasonAggByNpb = new Map<string, SeasonAgg>()
  for (const npb of byNpb.keys()) {
    const f = folded.get(npb)
    const e = emptySeasonAgg()
    if (f) {
      e.gamesStarted = f.gamesStarted
      e.gamesInRelief = f.gamesInRelief
      e.qsCount = f.qsCount
      e.holds = f.holds
      e.winCount = f.winCount
      e.lossCount = f.lossCount
      e.saveCount = f.saveCount
      e.completeGames = f.completeGames
      e.shutouts = f.shutouts
    }
    seasonAggByNpb.set(npb, e)
  }

  const outDir = join(projectRoot, "_data", "derived", "player_season_pitching_poc", year)
  mkdirSync(outDir, { recursive: true })
  // Phase 6 などが後付けで splits/byCatcher 等を付与するため、ここでは全削除しない。
  // 個別投手のファイルは「同一 npbId の既存 JSON から引き継げるものは引き継いだ上で上書き」する。

  const eraFrom = (er: number, outs: number) => {
    if (outs <= 0) return null
    return (er * 27) / outs
  }
  const whipFrom = (h: number, bb: number, outs: number) => {
    if (outs <= 0) return null
    const ip = outs / 3
    return (h + bb) / ip
  }

  for (const [npb, row] of byNpb) {
    /** pitchingLines 合算は aggregatePitchingSeasonByYahooPlayer（phase19 と同一）を正とする */
    const aggsForNpb: PitchingSeasonAggYahoo[] = [...row.yahooPitcherIds]
      .map((yid) => yahooOnlyAgg.get(yid))
      .filter((a): a is PitchingSeasonAggYahoo => a != null)
    const coreAgg = sumPitchingSeasonAggYahoo(aggsForNpb)
    const rankingStats = pitchingSeasonRowStatsFromAgg(coreAgg)
    const m = row.merged
    const ipStr = outsToIpDisplay(coreAgg.ipOuts)
    const primaryGameId = [...row.gameIds].sort()[0]
    const primaryDoc = docs.find((d) => d.gameId === primaryGameId) ?? docs[0]!
    const opp = opponentTeamName(primaryDoc, row.team)

    const meta = loadYahooGameMeta(projectRoot, primaryGameId)
    const metaHome =
      meta?.meta?.scoreboardTeamOrder?.find((x) => x.role === "home")?.teamName ??
      meta?.meta?.titleHomeTeamName ??
      ""
    const metaAway =
      meta?.meta?.scoreboardTeamOrder?.find((x) => x.role === "visitor")?.teamName ??
      meta?.meta?.titleVisitorTeamName ??
      ""
    const homeAway =
      teamsRoughlyInclude(row.team, metaHome)
        ? "home"
        : teamsRoughlyInclude(row.team, metaAway)
          ? "away"
          : null
    const dayNight = meta?.meta?.dayNight?.kind ?? null

    const sitMap = bySit.get(npb) ?? new Map()
    const sitOrder = [
      "none",
      "r1",
      "r2",
      "r3",
      "r12",
      "r13",
      "r23",
      "loaded",
      "risp",
      "no_risp",
    ]
    const sitLabels: Record<string, string> = {
      none: "無し",
      r1: "1塁",
      r2: "2塁",
      r3: "3塁",
      r12: "1・2塁",
      r13: "1・3塁",
      r23: "2・3塁",
      loaded: "満塁",
      risp: "得点圏",
      no_risp: "非得点圏",
    }

    const hand = vsHand.get(npb)
    const innMap = byInn.get(npb) ?? new Map()
    const stMap = stadiumPitchByNpb.get(npb) ?? new Map<string, StadiumLineAgg>()
    const oppMap = opponentPitchByNpb.get(npb) ?? new Map<string, StadiumLineAgg>()
    const dnMap = dayNightPitchByNpb.get(npb) ?? new Map<string, StadiumLineAgg>()
    const mapStadiumRow = (key: string, a: StadiumLineAgg): PitcherSeasonPocStadiumRow => {
      const era = eraFrom(a.er, a.outs)
      const whip = whipFrom(a.h, a.bb, a.outs)
      return {
        key,
        label: key,
        ipOuts: a.outs,
        ip: outsToIpDisplay(a.outs),
        bf: a.bf,
        h: a.h,
        hr: a.hr,
        so: a.so,
        bb: a.bb,
        hbp: a.hbp,
        bk: a.bk,
        r: a.r,
        er: a.er,
        pitches: a.pitches,
        era: era != null ? Number(era.toFixed(2)) : null,
        whip: whip != null ? Number(whip.toFixed(3)) : null,
        wins: a.wins,
        losses: a.losses,
        games: a.games,
        qsCount: a.qsCount,
      }
    }
    const byStadiumRows: PitcherSeasonPocStadiumRow[] = [...stMap.entries()]
      .filter(([, a]) => a.outs > 0 || a.bf > 0)
      .sort((x, y) => x[0].localeCompare(y[0], "ja"))
      .map(([key, a]) => mapStadiumRow(key, a))
    const byOpponentTeamRows: PitcherSeasonPocStadiumRow[] = [...oppMap.entries()]
      .filter(([, a]) => a.outs > 0 || a.bf > 0)
      .sort((x, y) => x[0].localeCompare(y[0], "ja"))
      .map(([key, a]) => mapStadiumRow(key, a))
    const byDayNightRows: PitcherSeasonPocStadiumRow[] = (["day", "night"] as const).flatMap((k) => {
      const a = dnMap.get(k)
      if (!a || (a.outs <= 0 && a.bf <= 0)) return []
      const row = mapStadiumRow(k, a)
      return [{ ...row, label: k === "day" ? "デー" : "ナイター" }]
    })

    const existing = loadExistingPitcherPocPayload(outDir, npb)
    const enrichSplit = (a: {
      outs: number
      h: number
      bb: number
      er: number
    }): { ipOuts: number; ip: string; er: number; era: number | null; whip: number | null } => {
      const ipOuts = a.outs
      const ip = outsToIpDisplay(ipOuts)
      const er = a.er
      const era = ipOuts > 0 ? (er * 27) / ipOuts : null
      const whip = (() => {
        if (ipOuts <= 0) return null
        const ipNum = ipOuts / 3
        return ipNum > 0 ? (a.h + a.bb) / ipNum : null
      })()
      return {
        ipOuts,
        ip,
        er,
        era: era != null ? Number(era.toFixed(2)) : null,
        whip: whip != null ? Number(whip.toFixed(3)) : null,
      }
    }

    const payload: PitcherSeasonPocPayload = {
      schemaVersion: "phase-pitcher-poc-season-v1",
      seasonYear: year,
      npbPlayerId: npb,
      yahooPitcherIds: [...row.yahooPitcherIds].sort(),
      playerName: row.playerName,
      team: row.team,
      generatedAt: new Date().toISOString(),
      source: {
        canonicalGames: [...row.gameIds].sort(),
        note: "1 試合または少数試合の合算。公式記録の代替ではない。",
        catcherNote: existing?.source?.catcherNote,
      },
      basic: {
        ip: ipStr,
        ipOuts: coreAgg.ipOuts,
        /** phase19 の pitchingSeasonRowStatsFromAgg と同一の未丸め値に toFixed したもの */
        era:
          coreAgg.ipOuts > 0
            ? Number((rankingStats.era as number).toFixed(2))
            : null,
        bf: coreAgg.bf,
        h: coreAgg.h,
        hr: coreAgg.hr,
        so: coreAgg.so,
        bb: coreAgg.bb,
        hbp: coreAgg.hbp,
        bk: coreAgg.bk,
        r: coreAgg.r,
        er: coreAgg.er,
        pitches: coreAgg.np,
        decision: m.decision ?? null,
        whip:
          coreAgg.ipOuts > 0
            ? Number((rankingStats.whip as number).toFixed(3))
            : null,
        /** BF−BB−HBP 近似（犠打・犠飛を除かないため公式被打率と一致しない場合あり） */
        avgAgainstApprox: fmtAvg(Math.max(0, coreAgg.bf - coreAgg.bb - coreAgg.hbp), coreAgg.h),
        battedBallOuts: (() => {
          const o = goAoByNpb.get(npb)
          if (!o || (o.go === 0 && o.ao === 0)) return undefined
          return { ground: o.go, air: o.ao }
        })(),
        gamesAppeared: coreAgg.gameIds.size,
        gamesStarted: seasonAggByNpb.get(npb)?.gamesStarted ?? 0,
        gamesInRelief: seasonAggByNpb.get(npb)?.gamesInRelief ?? 0,
        holds: seasonAggByNpb.get(npb)?.holds ?? 0,
        completeGames: seasonAggByNpb.get(npb)?.completeGames ?? 0,
        shutouts: seasonAggByNpb.get(npb)?.shutouts ?? 0,
        intentionalWalks: ibbByNpb.get(npb) ?? 0,
        qsCount: seasonAggByNpb.get(npb)?.qsCount ?? 0,
        qsRate: (() => {
          const gs = seasonAggByNpb.get(npb)?.gamesStarted ?? 0
          const qc = seasonAggByNpb.get(npb)?.qsCount ?? 0
          return gs > 0 ? qc / gs : null
        })(),
        winCount: seasonAggByNpb.get(npb)?.winCount ?? 0,
        lossCount: seasonAggByNpb.get(npb)?.lossCount ?? 0,
        saveCount: seasonAggByNpb.get(npb)?.saveCount ?? 0,
      },
      opponentTeamName: opp,
      gameMeta: meta
        ? {
            sourceGameId: meta.gameId,
            fetchedAt: meta.fetchedAt,
            homeAway,
            dayNight,
            stadiumName: meta.meta?.stadiumName ?? null,
            startTimeLocal: meta.meta?.startTimeLocal ?? null,
            gameDateYmd: meta.meta?.gameDateYmd ?? null,
          }
        : undefined,
      splits: {
        vsHand: hand
          ? {
              vsR: { ...hand.vsR, avg: fmtAvg(hand.vsR.ab, hand.vsR.h), ...enrichSplit(hand.vsR) },
              vsL: { ...hand.vsL, avg: fmtAvg(hand.vsL.ab, hand.vsL.h), ...enrichSplit(hand.vsL) },
              vsB: { ...hand.vsB, avg: fmtAvg(hand.vsB.ab, hand.vsB.h), ...enrichSplit(hand.vsB) },
              vsUnknown: {
                ...hand.vsUnknown,
                avg: fmtAvg(hand.vsUnknown.ab, hand.vsUnknown.h),
                ...enrichSplit(hand.vsUnknown),
              },
            }
          : null,
        bySituation: sitOrder
          .map((k) => {
            const a = sitMap.get(k)
            if (!a || a.bf === 0) return null
            return {
              key: k,
              label: sitLabels[k] ?? k,
              ...a,
              avg: fmtAvg(a.ab, a.h),
              ...enrichSplit(a),
            }
          })
          .filter(Boolean),
        byPaRound: (["1", "2", "3", "4", "5"] as const)
          .map((k) => {
            const pm = byPaRound.get(npb)
            const a = pm?.get(k)
            if (!a || a.bf === 0) return null
            const label =
              k === "1"
                ? "1巡目"
                : k === "2"
                  ? "2巡目"
                  : k === "3"
                    ? "3巡目"
                    : k === "4"
                      ? "4巡目"
                      : "5巡目以上"
            return {
              key: k,
              label,
              ...a,
              avg: fmtAvg(a.ab, a.h),
              ...enrichSplit(a),
            }
          })
          .filter((row): row is NonNullable<typeof row> => row != null),
        byPaRoundPitchTypes: (["1", "2", "3", "4", "5"] as const)
          .map((k) => {
            const rm = byPaRoundPitchTypes.get(npb)
            const tm = rm?.get(k)
            const pitchesTotal = [...(tm?.values() ?? [])].reduce((s, n) => s + n, 0)
            if (!tm || pitchesTotal <= 0) return null
            const label =
              k === "1"
                ? "1巡目"
                : k === "2"
                  ? "2巡目"
                  : k === "3"
                    ? "3巡目"
                    : k === "4"
                      ? "4巡目"
                      : "5巡目以上"
            const rows = [...tm.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([pitchType, pitches]) => ({
                pitch_type: pitchType,
                pitches,
                pct: Math.round((pitches / pitchesTotal) * 1000) / 10,
              }))
            return { key: k, label, pitches_total: pitchesTotal, rows }
          })
          .filter((row): row is NonNullable<typeof row> => row != null),
        byInning: [...innMap.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([inn, a]) => ({
            inning: inn,
            ...a,
            avg: fmtAvg(a.ab, a.h),
            ...enrichSplit(a),
          })),
        byStadium: byStadiumRows,
        byOpponentTeam: byOpponentTeamRows,
        byDayNight: byDayNightRows,
        byCatcher: existing?.splits?.byCatcher ?? [],
      },
    }

    writeFileSync(join(outDir, `npb_${npb}.json`), JSON.stringify(payload, null, 2), "utf8")
  }

  console.log(`[phase_pitcher_poc1] wrote ${byNpb.size} files → ${outDir}`)
}

main()
