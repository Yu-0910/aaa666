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
 *   - splits.byStadium: 試合ごとの pitchingLines を Phase0 日程（stadiumByGameId）の球場名で合算（Phase13 打撃と同一）
 *   - splits.byOpponentTeam: 試合ごとの pitchingLines を対戦相手チーム名（scoreboard）で合算
 *   - splits.byDayNight: 試合ごとの pitchingLines を Phase0/raw_sportsnavi 開始時刻（yahoo_game_meta 補完）で合算
 *   - splits.byHomeAway: 試合ごとの pitchingLines を scoreboard 先攻/後攻（空なら試合前情報補完）で合算
 *   - splits.byPaRoundPitchTypes: 巡目別球種（pitchEvents 球種割合）
 *   - splits.byPaRoundPitchTypesVsL / VsR: 巡目別球種（対左打者／対右打者。vsHand と同じ打者・投手腕換算）
 *   - splits.byCount: カウント別投球成績（0-0〜3-2、phase16 と同じ最終球直前 B-S）
 *   - splits.byCountPitchTypes: カウント別球種（0-0〜3-2、Phase 32）
 *   - splits.byCountPitchTypesVsL / VsR: カウント別球種（対左打者／対右打者）
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
import { loadScheduleStadiumByGameId } from "../lib/loadScheduleStadiumByGameId"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"
import { loadDayNightByGameId } from "../lib/loadDayNightByGameId"
import { getNpbRoster2026 } from "../lib/npbRoster"
import {
  effectiveVsHandBucketForPitcherSplit,
  resolveBatHandJaForBatter,
} from "../lib/yahooGame/batterHandFromCanonical"
import { parseRosterCsv, type RosterRow } from "../lib/yahooGame/rosterCsv"
import { buildEstimatedErByPaId } from "../lib/yahooGame/estimatedErByPaIdFromTextPbp"
import { injectTeamsFromTextPbpIfMissing } from "../lib/yahooGame/inferTeamsFromTextPbp"
import { teamsRoughlyMatch } from "../lib/yahooGame/startingCatcherFromCanonical"
import {
  addPitchToCountPitchTypesAcc,
  buildPitcherCountPitchTypesRows,
  emptyPitcherCountPitchTypesAcc,
  ensurePitcherCountPitchTypesAcc,
  type PitcherCountPitchTypesByNpb,
} from "../lib/yahooGame/pitcherCountPitchTypesAgg"
import {
  countBeforePitchAtIndex,
  isValidPitchCountKey,
  ORDERED_PITCH_COUNT_KEYS,
  pitchCountKeyForPlateAppearance,
} from "../lib/yahooGame/pitchCountSim"
import { sortPitchEventsByPitchIndex } from "../lib/yahooGame/sortPitchEventsByPitchIndex"
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

function parseArgs(): { year: string; onlyNpbIds: string[] | null } {
  const args = process.argv.slice(2)
  let year = "2026"
  let onlyNpbIds: string[] | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    } else if (args[i] === "--only-npb-ids" && args[i + 1]) {
      onlyNpbIds = String(args[i + 1])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    }
  }
  return { year, onlyNpbIds }
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
  hqsCount: number
  sqsCount: number
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
    hqsCount: 0,
    sqsCount: 0,
    winCount: 0,
    lossCount: 0,
    saveCount: 0,
  }
}

/** scoreboard 先攻/後攻（空なら試合前情報補完）から投手所属側のホーム/ビジターを推定 */
function pitcherHomeAwayInGame(
  doc: CanonicalGameDocument,
  pitcherTeam: string,
): "home" | "away" | null {
  const board = doc.game.scoreboard ?? []
  if (board.length < 2) return null
  const visitorName = (board[0].teamName ?? "").trim()
  const homeName = (board[1].teamName ?? "").trim()
  if (!visitorName || !homeName) return null
  if (teamsRoughlyMatch(pitcherTeam, homeName)) return "home"
  if (teamsRoughlyMatch(pitcherTeam, visitorName)) return "away"
  return null
}

/** scoreboard の先攻/後攻から、投手所属チームに対する対戦相手名を返す（teamsRoughlyMatch で突合） */
function opponentTeamName(canonical: CanonicalGameDocument, pitcherTeam: string): string {
  const board = canonical.game.scoreboard ?? []
  if (board.length < 2) return ""
  const visitorName = (board[0].teamName ?? "").trim()
  const homeName = (board[1].teamName ?? "").trim()
  if (!visitorName || !homeName) return ""
  if (teamsRoughlyMatch(pitcherTeam, homeName)) return visitorName
  if (teamsRoughlyMatch(pitcherTeam, visitorName)) return homeName
  return ""
}

function main(): void {
  const { year, onlyNpbIds } = parseArgs()
  const rosterPath = join(projectRoot, "_data", "npb_roster_2026.csv")
  if (!existsSync(rosterPath)) {
    console.error("[phase_pitcher_poc1] missing roster:", rosterPath)
    process.exit(1)
  }
  const roster = parseRosterCsv(readFileSync(rosterPath, "utf8"))
  const rosterForBatHand = getNpbRoster2026()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year })
  if (docs.length === 0) {
    console.error("[phase_pitcher_poc1] no canonical games under _data/scraped_games/canonical/")
    process.exit(1)
  }
  const targetNpbIds = onlyNpbIds ? [...onlyNpbIds] : null
  const targetNpbIdSet = targetNpbIds ? new Set(targetNpbIds) : null

  /** gameId -> scoreboard 補完済み canonical（Phase13 / Phase6 と同一） */
  const enrichedDocByGameId = new Map<string, CanonicalGameDocument>()
  function enrichedDoc(base: CanonicalGameDocument): CanonicalGameDocument {
    const gid = String(base.gameId ?? "").trim()
    let cached = enrichedDocByGameId.get(gid)
    if (!cached) {
      cached = injectTeamsFromTextPbpIfMissing(base)
      enrichedDocByGameId.set(gid, cached)
    }
    return cached
  }

  /** gameId -> 球場名（Phase0 日程 + canonical 補完。Phase13 打撃球場別と同一） */
  const stadiumByGameId = loadScheduleStadiumByGameId(year, projectRoot)
  const canonicalIds = new Set(docs.map((d) => String(d.gameId ?? "").trim()))
  let missingStadium = 0
  for (const gid of canonicalIds) {
    if (gid && !stadiumByGameId.has(gid)) missingStadium++
  }
  console.log(
    `[phase_pitcher_poc1] stadiumByGameId: ${stadiumByGameId.size} entries, canonical games missing stadium: ${missingStadium}/${canonicalIds.size}`,
  )
  if (missingStadium > 0) {
    console.warn(
      "[phase_pitcher_poc1] WARN: 球場未設定の試合があります。Phase0 日程の再取得、または canonical の対戦表記を確認してください。",
    )
  }
  /** gameId -> デー/ナイター（yahoo_game_meta + raw_sportsnavi 開始時刻。欠落は「未設定」） */
  const dayNightByGameId = loadDayNightByGameId(
    year,
    projectRoot,
    docs.map((d) => String(d.gameId ?? "").trim()),
  )
  const canonicalIdsForDn = new Set(docs.map((d) => String(d.gameId ?? "").trim()))
  let missingDayNight = 0
  for (const gid of canonicalIdsForDn) {
    if (gid && dayNightByGameId.get(gid) === "未設定") missingDayNight++
  }
  if (missingDayNight > 0) {
    console.warn(
      `[phase_pitcher_poc1] WARN: デー/ナイター未設定の試合: ${missingDayNight}/${canonicalIdsForDn.size}（raw_sportsnavi 再取得を確認）`,
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
      if (targetNpbIdSet && !targetNpbIdSet.has(npb)) continue
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
    const stadiumKey = stadiumByGameId.get(String(doc.gameId ?? "").trim()) ?? "未設定"
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
    const docEnriched = enrichedDoc(doc)
    const mergedLines = mergePitchingLines(doc.domain?.pitchingLines ?? [])
    for (const m of mergedLines.values()) {
      const npb = npbByYahooPitcherId.get(m.yahooPlayerId)
      if (!npb || !byNpb.has(npb)) continue
      const pitcherRow = byNpb.get(npb)!
      const opp = opponentTeamName(docEnriched, pitcherRow.team)
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

  /** pitchingLines をホーム/ビジター別に合算（1 試合あたり games++、QS は 6 回以上かつ自責 3 以下） */
  const homeAwayPitchByNpb = new Map<string, Map<string, StadiumLineAgg>>()
  function ensureHomeAwayLineAgg(npb: string, haKey: string): StadiumLineAgg {
    let m = homeAwayPitchByNpb.get(npb)
    if (!m) {
      m = new Map()
      homeAwayPitchByNpb.set(npb, m)
    }
    let a = m.get(haKey)
    if (!a) {
      a = emptyStadiumLineAgg()
      m.set(haKey, a)
    }
    return a
  }

  let missingHomeAway = 0
  for (const doc of docs) {
    const docEnriched = enrichedDoc(doc)
    const mergedLines = mergePitchingLines(doc.domain?.pitchingLines ?? [])
    for (const m of mergedLines.values()) {
      const npb = npbByYahooPitcherId.get(m.yahooPlayerId)
      if (!npb || !byNpb.has(npb)) continue
      const pitcherRow = byNpb.get(npb)!
      const haKey = pitcherHomeAwayInGame(docEnriched, pitcherRow.team)
      if (!haKey) {
        missingHomeAway++
        continue
      }
      const a = ensureHomeAwayLineAgg(npb, haKey)
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
  if (missingHomeAway > 0) {
    console.warn(
      `[phase_pitcher_poc1] WARN: ホーム/ビジター未判定の pitchingLines 行: ${missingHomeAway}（scoreboard 補完後もチーム不一致）`,
    )
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
    h2: number
    h3: number
    hr: number
    tb: number
    so: number
    bb: number
    hbp: number
    outs: number
    /** 自責点（近似）: textPlayByPlay のスコア差分から推定。エラー絡みは未補正。 */
    er: number
  }
  const emptyPaAgg = (): PaAgg => ({
    bf: 0,
    ab: 0,
    h: 0,
    h2: 0,
    h3: 0,
    hr: 0,
    tb: 0,
    so: 0,
    bb: 0,
    hbp: 0,
    outs: 0,
    er: 0,
  })

  const vsHand = new Map<string, { vsR: PaAgg; vsL: PaAgg; vsB: PaAgg; vsUnknown: PaAgg }>()
  const bySit = new Map<string, Map<string, PaAgg>>()
  const byCount = new Map<string, Map<string, PaAgg>>()
  const byInn = new Map<string, Map<number, PaAgg>>()
  const byPaRound = new Map<string, Map<string, PaAgg>>()
  const byPaRoundPitchTypes = new Map<string, Map<string, Map<string, number>>>()
  const byPaRoundPitchTypesVsL = new Map<string, Map<string, Map<string, number>>>()
  const byPaRoundPitchTypesVsR = new Map<string, Map<string, Map<string, number>>>()
  const byCountPitchTypes: PitcherCountPitchTypesByNpb = new Map()
  const byCountPitchTypesVsL: PitcherCountPitchTypesByNpb = new Map()
  const byCountPitchTypesVsR: PitcherCountPitchTypesByNpb = new Map()
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
  function ensureCount(npb: string) {
    let m = byCount.get(npb)
    if (!m) {
      m = new Map()
      byCount.set(npb, m)
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
  function applyGamePaRoundReconcileFromPitchingLines(
    doc: CanonicalGameDocument,
    inferredByNpb: Map<string, PaAgg>,
    lastRoundKeyByNpb: Map<string, string>,
    inferredErByRoundByNpb: Map<string, Map<string, number>>,
  ): void {
    const mergedLines = mergePitchingLines(doc.domain?.pitchingLines ?? [])
    for (const line of mergedLines.values()) {
      const npb = npbByYahooPitcherId.get(line.yahooPlayerId) ?? null
      if (!npb || !byNpb.has(npb)) continue
      const inferred = inferredByNpb.get(npb) ?? emptyPaAgg()
      const abOfficial = Math.max(0, line.bf - line.bb - line.hbp)
      const officialEr = Math.max(0, line.er)
      const deltas = {
        bf: line.bf - inferred.bf,
        ab: abOfficial - inferred.ab,
        h: line.h - inferred.h,
        hr: line.hr - inferred.hr,
        so: line.so - inferred.so,
        bb: line.bb - inferred.bb,
        hbp: line.hbp - inferred.hbp,
        outs: line.outs - inferred.outs,
      }
      const erDelta = officialEr - inferred.er
      if (Object.values(deltas).every((n) => n === 0) && erDelta === 0) continue

      const roundKey = lastRoundKeyByNpb.get(npb) ?? (line.bf > 0 ? "1" : "5")
      const pm = ensurePaRound(npb)
      const agg = pm.get(roundKey) ?? emptyPaAgg()
      agg.bf += deltas.bf
      agg.ab += deltas.ab
      agg.h += deltas.h
      agg.hr += deltas.hr
      agg.so += deltas.so
      agg.bb += deltas.bb
      agg.hbp += deltas.hbp
      agg.outs += deltas.outs
      if (erDelta >= 0) {
        agg.er += erDelta
      } else {
        // 実況スコア差分は失策絡みの失点も含むため、公式自責点より過大になることがある。
        // 負の残差を最後の巡目へ直接載せず、この試合で推定ERを付けた巡目から
        // 後ろ順に差し引く。各巡目のERは必ず0以上に保つ。
        let remaining = -erDelta
        const gameErByRound = inferredErByRoundByNpb.get(npb) ?? new Map<string, number>()
        for (const key of ["5", "4", "3", "2", "1"]) {
          if (remaining <= 0) break
          const gameEr = Math.max(0, gameErByRound.get(key) ?? 0)
          if (gameEr <= 0) continue
          const roundAgg = pm.get(key)
          if (!roundAgg) continue
          const reduction = Math.min(remaining, gameEr, Math.max(0, roundAgg.er))
          roundAgg.er -= reduction
          remaining -= reduction
        }
      }
      pm.set(roundKey, agg)
    }
  }
  function ensurePaRoundPitchTypes(npb: string) {
    let m = byPaRoundPitchTypes.get(npb)
    if (!m) {
      m = new Map()
      byPaRoundPitchTypes.set(npb, m)
    }
    return m
  }
  function ensurePaRoundPitchTypesVsL(npb: string) {
    let m = byPaRoundPitchTypesVsL.get(npb)
    if (!m) {
      m = new Map()
      byPaRoundPitchTypesVsL.set(npb, m)
    }
    return m
  }
  function ensurePaRoundPitchTypesVsR(npb: string) {
    let m = byPaRoundPitchTypesVsR.get(npb)
    if (!m) {
      m = new Map()
      byPaRoundPitchTypesVsR.set(npb, m)
    }
    return m
  }

  const PA_ROUND_PITCH_TYPE_KEYS = ["1", "2", "3", "4", "5"] as const
  function paRoundPitchTypeLabel(k: (typeof PA_ROUND_PITCH_TYPE_KEYS)[number]): string {
    return k === "1"
      ? "1巡目"
      : k === "2"
        ? "2巡目"
        : k === "3"
          ? "3巡目"
          : k === "4"
            ? "4巡目"
            : "5巡目以上"
  }
  function buildPaRoundPitchTypesRows(
    rm: Map<string, Map<string, number>> | undefined,
  ): NonNullable<PitcherSeasonPocPayload["splits"]["byPaRoundPitchTypes"]> {
    return PA_ROUND_PITCH_TYPE_KEYS.map((k) => {
      const tm = rm?.get(k)
      const pitchesTotal = [...(tm?.values() ?? [])].reduce((s, n) => s + n, 0)
      if (!tm || pitchesTotal <= 0) return null
      const rows = [...tm.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([pitchType, pitches]) => ({
          pitch_type: pitchType,
          pitches,
          pct: Math.round((pitches / pitchesTotal) * 1000) / 10,
        }))
      return { key: k, label: paRoundPitchTypeLabel(k), pitches_total: pitchesTotal, rows }
    }).filter((row): row is NonNullable<typeof row> => row != null)
  }

  const ibbByNpb = new Map<string, number>()

  for (const doc of docs) {
    const pas = [...(doc.domain?.plateAppearances ?? [])].sort(comparePlateAppearances)
    const erByPaId = buildEstimatedErByPaId(doc)
    const bfInGameByNpb = new Map<string, number>()
    const inferredPaRoundByNpb = new Map<string, PaAgg>()
    const lastPaRoundKeyByNpb = new Map<string, string>()
    const inferredErByRoundByNpb = new Map<string, Map<string, number>>()

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

      // カウント別投球成績（phase16 打撃と同じ最終球直前 B-S + 四球寄せ）
      {
        const ck = pitchCountKeyForPlateAppearance(pa.pitchEvents, res)
        if (ck) {
          const cm = ensureCount(npb)
          const agg = cm.get(ck) ?? emptyPaAgg()
          addPitcherPaCount(agg, res)
          agg.outs += outsAdded
          agg.er += erDelta
          cm.set(ck, agg)
        }
      }

      const bid = (pa.yahooBatterId ?? "").trim()
      const batJa = bid ? resolveBatHandJaForBatter(doc, bid, rosterForBatHand) : ""

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
            const pt = (e.pitchTypeJa ?? "").trim() || "不明"

            const rm = ensurePaRoundPitchTypes(eNpb)
            const tm = rm.get(key0) ?? new Map<string, number>()
            tm.set(pt, (tm.get(pt) ?? 0) + 1)
            rm.set(key0, tm)

            const pitcherThrowRaw = (
              rosterForBatHand.find((r) => r.npb_player_id === eNpb)?.throw_hand ?? ""
            ).toUpperCase()
            const pitcherThrow: "R" | "L" | "" =
              pitcherThrowRaw === "R" || pitcherThrowRaw === "L" ? pitcherThrowRaw : ""
            const bats = effectiveVsHandBucketForPitcherSplit(batJa, pitcherThrow)
            if (bats === "L") {
              const rmL = ensurePaRoundPitchTypesVsL(eNpb)
              const tmL = rmL.get(key0) ?? new Map<string, number>()
              tmL.set(pt, (tmL.get(pt) ?? 0) + 1)
              rmL.set(key0, tmL)
            } else if (bats === "R") {
              const rmR = ensurePaRoundPitchTypesVsR(eNpb)
              const tmR = rmR.get(key0) ?? new Map<string, number>()
              tmR.set(pt, (tmR.get(pt) ?? 0) + 1)
              rmR.set(key0, tmR)
            }
          }
        }
      }

      // カウント別球種（Phase 32）: 各球を投球直前 B-S に帰属。四球寄せは使わない。
      {
        const ev = pa.pitchEvents ?? []
        if (ev.length > 0) {
          const sorted = sortPitchEventsByPitchIndex(ev)
          for (let i = 0; i < sorted.length; i++) {
            const e = sorted[i]!
            const ePid = String(e.yahooPitcherId ?? "").trim() || pid
            const eNpb = npbByYahooPitcherId.get(ePid) ?? null
            if (!eNpb || !byNpb.has(eNpb)) continue
            const ck = countBeforePitchAtIndex(sorted, i)
            if (!ck || !isValidPitchCountKey(ck)) continue
            const acc = ensurePitcherCountPitchTypesAcc(byCountPitchTypes, eNpb)
            addPitchToCountPitchTypesAcc(acc, ck, e.pitchTypeJa)

            const pitcherThrowRaw = (
              rosterForBatHand.find((r) => r.npb_player_id === eNpb)?.throw_hand ?? ""
            ).toUpperCase()
            const pitcherThrow: "R" | "L" | "" =
              pitcherThrowRaw === "R" || pitcherThrowRaw === "L" ? pitcherThrowRaw : ""
            const bats = effectiveVsHandBucketForPitcherSplit(batJa, pitcherThrow)
            if (bats === "L") {
              const accL = ensurePitcherCountPitchTypesAcc(byCountPitchTypesVsL, eNpb)
              addPitchToCountPitchTypesAcc(accL, ck, e.pitchTypeJa)
            } else if (bats === "R") {
              const accR = ensurePitcherCountPitchTypesAcc(byCountPitchTypesVsR, eNpb)
              addPitchToCountPitchTypesAcc(accR, ck, e.pitchTypeJa)
            }
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
        const inferred = inferredPaRoundByNpb.get(npb) ?? emptyPaAgg()
        addPitcherPaCount(inferred, res)
        inferred.outs += outsAdded
        inferred.er += erDelta
        inferredPaRoundByNpb.set(npb, inferred)
        lastPaRoundKeyByNpb.set(npb, key)
        const gameErByRound = inferredErByRoundByNpb.get(npb) ?? new Map<string, number>()
        gameErByRound.set(key, (gameErByRound.get(key) ?? 0) + erDelta)
        inferredErByRoundByNpb.set(npb, gameErByRound)
      }

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

    applyGamePaRoundReconcileFromPitchingLines(
      doc,
      inferredPaRoundByNpb,
      lastPaRoundKeyByNpb,
      inferredErByRoundByNpb,
    )

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
      e.hqsCount = f.hqsCount
      e.sqsCount = f.sqsCount
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
    const haMap = homeAwayPitchByNpb.get(npb) ?? new Map<string, StadiumLineAgg>()
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
    const byHomeAwayRows: PitcherSeasonPocStadiumRow[] = (["home", "away"] as const).flatMap((k) => {
      const a = haMap.get(k)
      if (!a || (a.outs <= 0 && a.bf <= 0)) return []
      const row = mapStadiumRow(k, a)
      return [{ ...row, label: k === "home" ? "ホーム" : "アウェー" }]
    })
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
      h2: number
      h3: number
      bb: number
      ab: number
      tb: number
      er: number
    }): { ipOuts: number; ip: string; er: number; era: number | null; whip: number | null; isop: string } => {
      const ipOuts = a.outs
      const ip = outsToIpDisplay(ipOuts)
      const er = a.er
      const isop =
        a.ab > 0
          ? (() => {
              const s = ((Math.max(0, a.tb) - Math.max(0, a.h)) / a.ab).toFixed(3)
              return s.startsWith("0") ? s.slice(1) : s
            })()
          : ".000"
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
        isop,
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
        hqsCount: seasonAggByNpb.get(npb)?.hqsCount ?? 0,
        sqsCount: seasonAggByNpb.get(npb)?.sqsCount ?? 0,
        hqsRate: (() => {
          const gs = seasonAggByNpb.get(npb)?.gamesStarted ?? 0
          const hc = seasonAggByNpb.get(npb)?.hqsCount ?? 0
          return gs > 0 ? hc / gs : null
        })(),
        sqsRate: (() => {
          const gs = seasonAggByNpb.get(npb)?.gamesStarted ?? 0
          const sc = seasonAggByNpb.get(npb)?.sqsCount ?? 0
          return gs > 0 ? sc / gs : null
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
        byCount: ORDERED_PITCH_COUNT_KEYS.map((k) => {
          const cm = byCount.get(npb)
          const a = cm?.get(k)
          if (!a || a.bf === 0) return null
          return {
            key: k,
            label: k,
            ...a,
            avg: fmtAvg(a.ab, a.h),
            ...enrichSplit(a),
          }
        }).filter((row): row is NonNullable<typeof row> => row != null),
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
        byPaRoundPitchTypes: buildPaRoundPitchTypesRows(byPaRoundPitchTypes.get(npb)),
        byPaRoundPitchTypesVsL: buildPaRoundPitchTypesRows(byPaRoundPitchTypesVsL.get(npb)),
        byPaRoundPitchTypesVsR: buildPaRoundPitchTypesRows(byPaRoundPitchTypesVsR.get(npb)),
        byCountPitchTypes: buildPitcherCountPitchTypesRows(
          byCountPitchTypes.get(npb) ?? emptyPitcherCountPitchTypesAcc(),
        ),
        byCountPitchTypesVsL: buildPitcherCountPitchTypesRows(
          byCountPitchTypesVsL.get(npb) ?? emptyPitcherCountPitchTypesAcc(),
        ),
        byCountPitchTypesVsR: buildPitcherCountPitchTypesRows(
          byCountPitchTypesVsR.get(npb) ?? emptyPitcherCountPitchTypesAcc(),
        ),
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
        byHomeAway: byHomeAwayRows,
        byDayNight: byDayNightRows,
        byCatcher: existing?.splits?.byCatcher ?? [],
      },
    }

    const negativePaRoundEr = payload.splits.byPaRound.find((row) => row.er < 0)
    if (negativePaRoundEr) {
      throw new Error(
        `[phase_pitcher_poc1] negative pa-round ER: npb=${npb} round=${negativePaRoundEr.key} er=${negativePaRoundEr.er}`,
      )
    }

    writeJsonFileWithRetrySync(join(outDir, `npb_${npb}.json`), payload)
  }

  console.log(`[phase_pitcher_poc1] wrote ${byNpb.size} files → ${outDir}`)
}

main()
