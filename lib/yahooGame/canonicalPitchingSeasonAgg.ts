/**
 * canonical 試合群から Yahoo 投手 ID 単位のシーズン投球集計。
 * phase19（ランキング）と phase_pitcher_poc1（個人ページ）で同一ロジックを共有する。
 *
 * 母数は常に配置 canonical 試合の mergePitchingLinesInGame 起点の集計。
 * リーグ（CL/PL）は名簿 SSOT を優先しつつ、Yahoo1 人の総投球回などは上記と個人 JSON（NPB 合算）で一致させる。
 */

import type { CanonicalGameDocument, LineupPlayer, PitchingLine } from "./types"
import { findRosterPlayerByPublicId, findRosterPlayerByPublicIdOrJaName } from "@/lib/npbRoster"
import { collectStartersYahooIdsFromStatLines } from "./nf3PitcherMetricsFromCanonical"
import { inferPitcherTeamForNf3Line, teamForYahooPlayerId } from "./pitcherPocHelpers"
import { ipStringToOuts } from "../ranking/ipBaseball"

/** ランキング用チーム略称（CSV / 表示の共通マップ） */
export const CSV_TEAM_TO_RANKING_SHORT: Record<string, string> = {
  中日ドラゴンズ: "中日",
  広島東洋カープ: "広島",
  東京ヤクルトスワローズ: "ヤクルト",
  読売ジャイアンツ: "巨人",
  阪神タイガース: "阪神",
  横浜DeNAベイスターズ: "DeNA",
  オリックス・バファローズ: "オリックス",
  千葉ロッテマリーンズ: "ロッテ",
  北海道日本ハムファイターズ: "日本ハム",
  東北楽天ゴールデンイーグルス: "楽天",
  埼玉西武ライオンズ: "西武",
  福岡ソフトバンクホークス: "ソフトバンク",
}

const CL_TEAM_SHORT = new Set(["巨人", "阪神", "中日", "広島", "DeNA", "ヤクルト"])

export function rosterTeamToRankingShort(fullTeam: string): string {
  const t = String(fullTeam ?? "").trim()
  return CSV_TEAM_TO_RANKING_SHORT[t] ?? t
}

export function leagueBucketForTeamShort(short: string): "CL" | "PL" {
  const t = short.trim()
  if (!t) return "CL"
  return CL_TEAM_SHORT.has(t) ? "CL" : "PL"
}

function teamNameForYahooInDoc(doc: CanonicalGameDocument, yahooId: string): string {
  const fromLineup = teamForYahooPlayerId(doc, yahooId)
  if (fromLineup) return fromLineup
  for (const team of doc.game.teams ?? []) {
    const teamName = String(team.teamName ?? "").trim()
    for (const p of (team.startingLineup ?? []) as LineupPlayer[]) {
      if (String(p.yahooPlayerId ?? "").trim() === yahooId) return teamName
    }
  }
  return ""
}

/**
 * 投手ランキング用の CL/PL。名簿（Yahoo→NPB 解決含む）を最優先し、
 * 次に試合ドキュメント上のチーム名、日本語名簿ヒント、PA からの推定の順。
 */
export function resolvePitcherRankingLeagueBucket(
  yahooId: string,
  docs: CanonicalGameDocument[],
): "CL" | "PL" | null {
  const id = String(yahooId ?? "").trim()
  if (!id) return null

  const rosterById = findRosterPlayerByPublicId(id)
  if (rosterById?.team) {
    return leagueBucketForTeamShort(rosterTeamToRankingShort(rosterById.team))
  }

  for (const doc of docs) {
    const tn = teamNameForYahooInDoc(doc, id)
    if (tn) return leagueBucketForTeamShort(rosterTeamToRankingShort(tn))
  }

  let jaHint = ""
  outer: for (const doc of docs) {
    for (const pl of doc.domain.pitchingLines ?? []) {
      if (String(pl.yahooPlayerId ?? "").trim() !== id) continue
      const n = String(pl.playerName ?? "").trim()
      if (n) {
        jaHint = n
        break outer
      }
    }
  }
  const rosterByName = findRosterPlayerByPublicIdOrJaName(id, jaHint)
  if (rosterByName?.team) {
    return leagueBucketForTeamShort(rosterTeamToRankingShort(rosterByName.team))
  }

  for (const doc of docs) {
    const t = inferPitcherTeamForNf3Line(doc, id)
    if (t) return leagueBucketForTeamShort(rosterTeamToRankingShort(t))
  }

  return null
}

export type PitchingSeasonAggYahoo = {
  gameIds: Set<string>
  ipOuts: number
  bf: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  bk: number
  r: number
  er: number
  np: number
  w: number
  l: number
  hld: number
  sv: number
  gamesStarted: number
  gamesInRelief: number
  qsStarts: number
  hqsStarts: number
  sqsStarts: number
  completeGames: number
  shutouts: number
}

/** 複数 Yahoo 投手 ID（同一 NPB の名簿重複など）の PitchingSeasonAggYahoo を 1 つに足し合わせる */
export function sumPitchingSeasonAggYahoo(
  aggs: readonly PitchingSeasonAggYahoo[],
): PitchingSeasonAggYahoo {
  const out = emptyPitchingSeasonAggYahoo()
  for (const a of aggs) {
    for (const gid of a.gameIds) out.gameIds.add(gid)
    out.ipOuts += a.ipOuts
    out.bf += a.bf
    out.h += a.h
    out.hr += a.hr
    out.so += a.so
    out.bb += a.bb
    out.hbp += a.hbp
    out.bk += a.bk
    out.r += a.r
    out.er += a.er
    out.np += a.np
    out.w += a.w
    out.l += a.l
    out.hld += a.hld
    out.sv += a.sv
    out.gamesStarted += a.gamesStarted
    out.gamesInRelief += a.gamesInRelief
    out.qsStarts += a.qsStarts
    out.hqsStarts += a.hqsStarts
    out.sqsStarts += a.sqsStarts
    out.completeGames += a.completeGames
    out.shutouts += a.shutouts
  }
  return out
}

export function emptyPitchingSeasonAggYahoo(): PitchingSeasonAggYahoo {
  return {
    gameIds: new Set(),
    ipOuts: 0,
    bf: 0,
    h: 0,
    hr: 0,
    so: 0,
    bb: 0,
    hbp: 0,
    bk: 0,
    r: 0,
    er: 0,
    np: 0,
    w: 0,
    l: 0,
    hld: 0,
    sv: 0,
    gamesStarted: 0,
    gamesInRelief: 0,
    qsStarts: 0,
    hqsStarts: 0,
    sqsStarts: 0,
    completeGames: 0,
    shutouts: 0,
  }
}

function mergePitchingLinesInGame(lines: PitchingLine[]): PitchingLine | null {
  if (lines.length === 0) return null
  const withData = lines.filter((l) => (l.bf ?? 0) > 0 || ipStringToOuts(l.ip) > 0)
  const src = withData.length > 0 ? withData : lines
  const base: PitchingLine = { ...src[0] }
  for (let i = 1; i < src.length; i++) {
    const x = src[i]
    base.bf = (base.bf ?? 0) + (x.bf ?? 0)
    base.h = (base.h ?? 0) + (x.h ?? 0)
    base.hr = (base.hr ?? 0) + (x.hr ?? 0)
    base.so = (base.so ?? 0) + (x.so ?? 0)
    base.bb = (base.bb ?? 0) + (x.bb ?? 0)
    base.hbp = (base.hbp ?? 0) + (x.hbp ?? 0)
    base.bk = (base.bk ?? 0) + (x.bk ?? 0)
    base.r = (base.r ?? 0) + (x.r ?? 0)
    base.er = (base.er ?? 0) + (x.er ?? 0)
    base.pitches = (base.pitches ?? 0) + (x.pitches ?? 0)
    base.ip = mergeIpStrings(base.ip, x.ip)
    if ((x.playerName?.length ?? 0) > (base.playerName?.length ?? 0)) base.playerName = x.playerName
    if (!base.decision && x.decision) base.decision = x.decision
  }
  return base
}

function mergeIpStrings(a?: string, b?: string): string | undefined {
  const oa = ipStringToOuts(a)
  const ob = ipStringToOuts(b)
  const total = oa + ob
  if (total <= 0) return a || b
  const whole = Math.floor(total / 3)
  const rem = total % 3
  if (rem === 0) return String(whole)
  return `${whole}.${rem}`
}

/**
 * canonical 全試合を走査し、Yahoo 投手 ID ごとのシーズン合算とリーグ区分を返す。
 * QS/HQS/SQS・先発/救援・セーブ・完投・完封の数え方は phase_pitcher_poc1 相当。
 */
export function aggregatePitchingSeasonByYahooPlayer(
  docs: CanonicalGameDocument[]
): Map<string, { agg: PitchingSeasonAggYahoo; league: "CL" | "PL" }> {
  const byPlayer = new Map<string, PitchingSeasonAggYahoo>()

  for (const doc of docs) {
    const byId = new Map<string, PitchingLine[]>()
    for (const pl of doc.domain.pitchingLines ?? []) {
      const id = String(pl.yahooPlayerId ?? "").trim()
      if (!id) continue
      const arr = byId.get(id) ?? []
      arr.push(pl)
      byId.set(id, arr)
    }

    const starters = collectStartersYahooIdsFromStatLines(doc)

    const pitchersPerTeam = new Map<string, number>()
    for (const [pid, lines] of byId.entries()) {
      const merged = mergePitchingLinesInGame(lines)
      if (!merged) continue
      const outs = ipStringToOuts(merged.ip)
      if (outs === 0 && (merged.bf ?? 0) === 0) continue
      const tn = teamNameForYahooInDoc(doc, pid)
      if (tn) pitchersPerTeam.set(tn, (pitchersPerTeam.get(tn) ?? 0) + 1)
    }

    for (const [id, lines] of byId.entries()) {
      const merged = mergePitchingLinesInGame(lines)
      if (!merged) continue
      const outs = ipStringToOuts(merged.ip)
      if (outs === 0 && (merged.bf ?? 0) === 0) continue

      const agg = byPlayer.get(id) ?? emptyPitchingSeasonAggYahoo()
      agg.gameIds.add(doc.gameId)
      agg.ipOuts += outs
      agg.bf += merged.bf ?? 0
      agg.h += merged.h ?? 0
      agg.hr += merged.hr ?? 0
      agg.so += merged.so ?? 0
      agg.bb += merged.bb ?? 0
      agg.hbp += merged.hbp ?? 0
      agg.bk += merged.bk ?? 0
      agg.r += merged.r ?? 0
      agg.er += merged.er ?? 0
      agg.np += merged.pitches ?? 0
      if (merged.decision === "win") agg.w += 1
      else if (merged.decision === "loss") agg.l += 1
      else if (merged.decision === "hold") agg.hld += 1
      else if (merged.decision === "save") agg.sv += 1

      if (starters.has(id)) {
        agg.gamesStarted += 1
        const er = merged.er ?? 0
        if (outs >= 18 && er <= 3) agg.qsStarts += 1
        if (outs >= 21 && er <= 2) agg.hqsStarts += 1
        if (outs >= 24 && er <= 1) agg.sqsStarts += 1
      } else {
        agg.gamesInRelief += 1
      }

      const tn = teamNameForYahooInDoc(doc, id)
      if (tn) {
        const pc = pitchersPerTeam.get(tn) ?? 0
        if (pc === 1 && outs >= 27) {
          agg.completeGames += 1
          if ((merged.r ?? 0) === 0 && (merged.er ?? 0) === 0) agg.shutouts += 1
        }
      }

      byPlayer.set(id, agg)
    }
  }

  const out = new Map<string, { agg: PitchingSeasonAggYahoo; league: "CL" | "PL" }>()
  for (const [id, agg] of byPlayer.entries()) {
    const league = resolvePitcherRankingLeagueBucket(id, docs) ?? "CL"
    out.set(id, { agg, league })
  }
  return out
}

/**
 * NPB 選手 ID に紐づく Yahoo 投手の集計を合算（個人ページの seasonAggByNpb 用）。
 */
export function foldYahooPitchingAggIntoNpb(
  yahooAgg: Map<string, PitchingSeasonAggYahoo>,
  npbByYahooPitcherId: Map<string, string>,
  validNpbIds: Set<string>
): Map<
  string,
  {
    gamesStarted: number
    gamesInRelief: number
    qsCount: number
    holds: number
    winCount: number
    lossCount: number
    saveCount: number
    completeGames: number
    shutouts: number
  }
> {
  const byNpb = new Map<
    string,
    {
      gamesStarted: number
      gamesInRelief: number
      qsCount: number
      holds: number
      winCount: number
      lossCount: number
      saveCount: number
      completeGames: number
      shutouts: number
    }
  >()

  function ensure(npb: string) {
    let e = byNpb.get(npb)
    if (!e) {
      e = {
        gamesStarted: 0,
        gamesInRelief: 0,
        qsCount: 0,
        holds: 0,
        winCount: 0,
        lossCount: 0,
        saveCount: 0,
        completeGames: 0,
        shutouts: 0,
      }
      byNpb.set(npb, e)
    }
    return e
  }

  for (const [yid, agg] of yahooAgg.entries()) {
    const npb = npbByYahooPitcherId.get(yid)
    if (!npb || !validNpbIds.has(npb)) continue
    const e = ensure(npb)
    e.gamesStarted += agg.gamesStarted
    e.gamesInRelief += agg.gamesInRelief
    e.qsCount += agg.qsStarts
    e.holds += agg.hld
    e.winCount += agg.w
    e.lossCount += agg.l
    e.saveCount += agg.sv
    e.completeGames += agg.completeGames
    e.shutouts += agg.shutouts
  }

  return byNpb
}
