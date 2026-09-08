"use client"

import { useEffect, useMemo, useState } from "react"
import PitcherSeasonPitchTypesTable from "@/app/components/PitcherSeasonPitchTypesTable"
import { PlayerPageProfileTableBlock } from "@/app/players/[playerId]/PlayerPageProfileTableBlock"
import type { ProfileMergedPayload } from "@/app/players/[playerId]/playerPageShared"
import { formatSlashStatDisplay } from "@/lib/battingRateFormat"
import {
  PA_ROUND_ORDERED_KEYS,
  pitcherPocBasicRow1,
  pitcherPocBasicRow2,
  pitcherPocBasicRow3,
  pitcherPocCatcherRows,
  pitcherPocCountRows,
  pitcherPocDayNightRows,
  pitcherPocHandCells,
  pitcherPocHomeAwayRows,
  pitcherPocInningRow,
} from "@/lib/pitcherSeasonPocUi"
import type { PitcherSeasonPocPayload, PitcherSeasonPocPitchTypesSplitRow } from "@/lib/pitcherSeasonPocTypes"
import { matchupOpponentDisplayNameJa } from "@/lib/playerNameNormalize"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"
import type { PlayerProfileMergedPayload } from "@/lib/playerProfileMergedServer"
import type { PlayerMatchupDerived } from "@/lib/playerMatchupTypes"
import type { PitcherSeasonPitchTypesPayload } from "@/lib/yahooGame/pitcherSeasonPitchTypes"

type BoardPlayer = {
  publicId: string
  nameJa: string
  teamCode: string
  teamName: string
  opponentTeamCode: string
  opponentTeamName: string
  homeAway: "home" | "away"
  dayNight: "day" | "night"
  gameDateJst: string
  profileMerged: PlayerProfileMergedPayload | null
}

type DerivedEnvelope<T> = {
  hasData: boolean
  payload: T | null
}

type PitcherCardState = {
  seasonPitching: PitcherSeasonPocPayload | null
  seasonPitchTypes: PitcherSeasonPitchTypesPayload | null
  matchup: PlayerMatchupDerived | null
}

const BASIC_ROW_1_HEADERS = ["防御率", "試合", "先発", "救援", "勝利", "敗戦", "S", "HP", "被打率", "QS"]
const BASIC_ROW_2_HEADERS = ["完投", "完封", "無四球", "勝率", "回数", "被打者", "投球数", "P/IP", "被安", "K%"]
const BASIC_ROW_3_HEADERS = ["被本", "奪三振", "四球", "敬遠", "死球", "暴投", "失点", "自責", "WHIP", "QS率"]
const HAND_HEADERS = ["被打率", "打数", "被安打", "K-BB%", "K%", "BB%", "被本"]
const PA_ROUND_RESULT_HEADERS = ["被打率", "打数", "被安打", "K-BB%", "K%", "BB%", "被本"]
const INNING_HEADERS = ["防御率", "打数", "K-BB%", "K%", "BB%", "WHIP", "被打率", "被本"]
const CATCHER_HEADERS = ["防御率", "勝敗", "回数", "K-BB%", "K%", "WHIP", "QS%"]
const HOME_AWAY_HEADERS = ["防御率", "勝敗", "回数", "K-BB%", "K%", "WHIP", "被打率"]
const DAY_NIGHT_HEADERS = ["防御率", "勝敗", "回数", "K-BB%", "K%", "WHIP", "QS%"]
const MATCHUP_HEADERS = ["打数", "安打", "本塁打", "三振", "打率", "OPS"]
const DEFAULT_STATE: PitcherCardState = {
  seasonPitching: null,
  seasonPitchTypes: null,
  matchup: null,
}

function SectionTitle({
  stripeColor,
  title,
}: {
  stripeColor: string
  title: string
}) {
  return (
    <h3
      className="mb-2 mt-0 text-[11px] font-black tracking-[0.08em] text-white"
      style={{
        borderLeft: `5px solid ${stripeColor}`,
        paddingLeft: "0.55rem",
      }}
    >
      {title}
    </h3>
  )
}

function CompactTable({
  headers,
  rows,
  firstHeader = "項目",
}: {
  headers: string[]
  rows: Array<{ label: string; cells: string[] }>
  firstHeader?: string
}) {
  return (
    <div className="overflow-hidden rounded border border-[#3d3d3d]">
      <table className="w-full border-collapse text-[10px] leading-tight text-white">
        <thead>
          <tr className="bg-[#ffff44] text-black">
            <th className="border border-[#3d3d3d] px-1 py-1 text-left font-black">{firstHeader}</th>
            {headers.map((header) => (
              <th key={header} className="border border-[#3d3d3d] px-1 py-1 text-center font-black">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="bg-[#121212]">
              <th className="border border-[#3d3d3d] px-1 py-1 text-left font-bold text-[#f4f4f4]">
                {row.label}
              </th>
              {row.cells.map((cell, index) => (
                <td key={`${row.label}-${index}`} className="border border-[#3d3d3d] px-1 py-1 text-center font-black tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function profileTableProps(profileMerged: PlayerProfileMergedPayload | null) {
  const profile = profileMerged?.profile ?? {}
  const faDisplay =
    typeof profileMerged?.faEstimate?.domesticFa === "object" &&
    profileMerged?.faEstimate?.domesticFa != null &&
    "displayValue" in profileMerged.faEstimate.domesticFa
      ? String(profileMerged.faEstimate.domesticFa.displayValue ?? "")
      : ""
  return {
    mergedBirthRaw: String(profile.birth_date_raw ?? ""),
    mergedProDebut: String(profile.pro_debut_raw ?? ""),
    mergedCareer: String(profile.career_raw ?? ""),
    mergedSalaryTotalPlain: String(profileMerged?.career_total_salary_display ?? ""),
    mergedFaDisplay: faDisplay,
    profileMerged: (profileMerged ?? {
      npb_player_id: "",
      name_ja: "",
    }) as ProfileMergedPayload,
  }
}

function splitSummaryRows(rows: PitcherSeasonPocPitchTypesSplitRow[] | null | undefined) {
  return (rows ?? []).map((row) => ({
    label: row.label,
    cells: [
      String(row.pitches_total || "—"),
      row.rows
        .slice(0, 4)
        .map((pitch) => `${pitch.pitch_type} ${pitch.pct.toFixed(1)}%`)
        .join(" / ") || "—",
    ],
  }))
}

function paRoundResultRows(payload: PitcherSeasonPocPayload | null) {
  const byKey = new Map((payload?.splits.byPaRound ?? []).map((row) => [row.key, row]))
  return PA_ROUND_ORDERED_KEYS.map((key) => {
    const row = byKey.get(key)
    if (!row || row.bf <= 0) {
      return { label: key === "5" ? "5巡目+" : `${key}巡目`, cells: Array.from({ length: 7 }, () => "—") }
    }
    return {
      label: key === "5" ? "5巡目+" : `${key}巡目`,
      cells: [
        row.avg ?? "—",
        String(row.ab),
        String(row.h),
        `${(((row.so - row.bb) / row.bf) * 100).toFixed(1)}%`,
        `${((row.so / row.bf) * 100).toFixed(1)}%`,
        `${((row.bb / row.bf) * 100).toFixed(1)}%`,
        String(row.hr),
      ],
    }
  })
}

function inningRows(payload: PitcherSeasonPocPayload | null) {
  return Array.from({ length: 9 }, (_, index) => {
    const inning = index + 1
    return {
      label: `${inning}回`,
      cells: payload ? pitcherPocInningRow(payload, inning) : Array.from({ length: 8 }, () => "—"),
    }
  })
}

function relevantHomeAwayRows(payload: PitcherSeasonPocPayload | null, homeAway: "home" | "away") {
  const label = homeAway === "home" ? "ホーム" : "アウェー"
  const row = payload ? pitcherPocHomeAwayRows(payload).find((item) => item.label === label) : null
  return [{ label, cells: row ? [row.era, row.wl, row.ip, row.k_bb_pct, row.k_pct, row.whip, row.avg] : Array.from({ length: 7 }, () => "—") }]
}

function relevantDayNightRows(payload: PitcherSeasonPocPayload | null, dayNight: "day" | "night") {
  const label = dayNight === "day" ? "デー" : "ナイター"
  const row = payload ? pitcherPocDayNightRows(payload).find((item) => item.label === label) : null
  return [{ label, cells: row ? [row.era, row.wl, row.ip, row.k_bb_pct, row.k_pct, row.whip, row.qs_pct] : Array.from({ length: 7 }, () => "—") }]
}

function matchupRows(payload: PlayerMatchupDerived | null, opponentTeamCode: string) {
  const team = payload?.teams.find((item) => item.teamCode === opponentTeamCode)
  return (team?.opponents ?? []).map((row) => ({
    label: matchupOpponentDisplayNameJa(row.opponentName),
    cells: [
      String(row.ab),
      String(row.h),
      String(row.hr),
      String(row.so),
      row.avg ? formatSlashStatDisplay(row.avg) : "—",
      row.ops ? formatSlashStatDisplay(row.ops) : "—",
    ],
  }))
}

function usePitcherCardData(player: BoardPlayer): PitcherCardState {
  const [state, setState] = useState<PitcherCardState>(DEFAULT_STATE)

  useEffect(() => {
    let cancelled = false
    const year = encodeURIComponent("2026")
    const encoded = encodeURIComponent(player.publicId)

    Promise.all([
      fetch(`/api/players/${encoded}/season-pitching?year=${year}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/players/${encoded}/season-pitch-types?year=${year}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/players/${encoded}/matchup-pitching?year=${year}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([seasonPitching, seasonPitchTypes, matchup]) => {
        if (cancelled) return
        setState({
          seasonPitching: (seasonPitching as DerivedEnvelope<PitcherSeasonPocPayload> | null)?.payload ?? null,
          seasonPitchTypes: (seasonPitchTypes as DerivedEnvelope<PitcherSeasonPitchTypesPayload> | null)?.payload ?? null,
          matchup: (matchup as DerivedEnvelope<PlayerMatchupDerived> | null)?.payload ?? null,
        })
      })
      .catch(() => {
        if (!cancelled) setState(DEFAULT_STATE)
      })

    return () => {
      cancelled = true
    }
  }, [player.publicId])

  return state
}

function PitcherCard({ player }: { player: BoardPlayer }) {
  const stripeColor = rankingTeamStripeColor(player.teamCode)
  const { seasonPitching, seasonPitchTypes, matchup } = usePitcherCardData(player)
  const handRows = useMemo(() => {
    const vsHand = seasonPitching?.splits.vsHand
    return [
      { label: "対左", cells: vsHand?.vsL ? pitcherPocHandCells(vsHand.vsL) : Array.from({ length: 7 }, () => "—") },
      { label: "対右", cells: vsHand?.vsR ? pitcherPocHandCells(vsHand.vsR) : Array.from({ length: 7 }, () => "—") },
    ]
  }, [seasonPitching])
  const catcherRows = useMemo(
    () => (seasonPitching ? pitcherPocCatcherRows(seasonPitching) : [{ label: "—", cells: Array.from({ length: 7 }, () => "—") }]),
    [seasonPitching],
  )
  const countRows = useMemo(
    () => (seasonPitching ? pitcherPocCountRows(seasonPitching) : []),
    [seasonPitching],
  )
  const paRoundPitchRows = useMemo(
    () => splitSummaryRows(seasonPitching?.splits.byPaRoundPitchTypes),
    [seasonPitching],
  )
  const countPitchRows = useMemo(
    () => splitSummaryRows(seasonPitching?.splits.byCountPitchTypes),
    [seasonPitching],
  )
  const opponentMatchupRows = useMemo(
    () => matchupRows(matchup, player.opponentTeamCode),
    [matchup, player.opponentTeamCode],
  )

  return (
    <article
      className="rounded-xl border border-[#2c2c2c] bg-[#0b0b0b] p-4 shadow-[0_14px_40px_rgba(0,0,0,0.35)]"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(255,255,255,0.02), transparent 22%), radial-gradient(circle at top right, rgba(255,255,68,0.08), transparent 26%)",
      }}
    >
      <div className="mb-3 flex items-end justify-between gap-3 border-b border-[#2f2f2f] pb-3">
        <div>
          <p className="text-[22px] font-black leading-none text-white">{player.nameJa}</p>
          <p className="mt-1 text-[11px] font-semibold tracking-[0.12em] text-[#bdbdbd]">
            {player.teamName} vs {player.opponentTeamName} / {player.homeAway === "home" ? "ホーム" : "ビジター"} / {player.dayNight === "night" ? "ナイター" : "デー"}
          </p>
        </div>
        <div
          className="rounded-full px-3 py-1 text-[10px] font-black tracking-[0.14em] text-black"
          style={{ backgroundColor: stripeColor }}
        >
          {player.gameDateJst}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <section>
            <SectionTitle stripeColor={stripeColor} title="名前" />
            <div className="rounded border border-[#3d3d3d] bg-[#111] px-3 py-2 text-[18px] font-black text-white">
              {player.nameJa}
            </div>
          </section>

          <section>
            <SectionTitle stripeColor={stripeColor} title="プロフィール表" />
            <PlayerPageProfileTableBlock
              {...profileTableProps(player.profileMerged)}
              tableClassName="text-[11px]"
              showFinancialFields={false}
            />
          </section>

          <section>
            <SectionTitle stripeColor={stripeColor} title="基本成績" />
            <div className="space-y-2">
              <CompactTable
                headers={BASIC_ROW_1_HEADERS}
                rows={[{ label: "基本1", cells: seasonPitching ? pitcherPocBasicRow1(seasonPitching) : Array.from({ length: 10 }, () => "—") }]}
              />
              <CompactTable
                headers={BASIC_ROW_2_HEADERS}
                rows={[{ label: "基本2", cells: seasonPitching ? pitcherPocBasicRow2(seasonPitching) : Array.from({ length: 10 }, () => "—") }]}
              />
              <CompactTable
                headers={BASIC_ROW_3_HEADERS}
                rows={[{ label: "基本3", cells: seasonPitching ? pitcherPocBasicRow3(seasonPitching) : Array.from({ length: 10 }, () => "—") }]}
              />
            </div>
          </section>

          <section>
            <SectionTitle stripeColor={stripeColor} title="左右別" />
            <CompactTable headers={HAND_HEADERS} rows={handRows} />
          </section>

          <section>
            <SectionTitle stripeColor={stripeColor} title="投球データ" />
            <PitcherSeasonPitchTypesTable rows={seasonPitchTypes?.rows ?? []} compactOverlay />
          </section>

          <section>
            <SectionTitle stripeColor={stripeColor} title="巡目別の球種一覧" />
            <CompactTable headers={["総投球数", "上位球種"]} rows={paRoundPitchRows.length ? paRoundPitchRows : [{ label: "—", cells: ["—", "—"] }]} />
          </section>
        </div>

        <div className="space-y-4">
          <section>
            <SectionTitle stripeColor={stripeColor} title="カウント別の球種一覧" />
            <CompactTable headers={["総投球数", "上位球種"]} rows={countPitchRows.length ? countPitchRows : [{ label: "—", cells: ["—", "—"] }]} />
          </section>

          <section>
            <SectionTitle stripeColor={stripeColor} title="巡目別の成績" />
            <CompactTable headers={PA_ROUND_RESULT_HEADERS} rows={paRoundResultRows(seasonPitching)} />
          </section>

          <section>
            <SectionTitle stripeColor={stripeColor} title="イニング別" />
            <CompactTable headers={INNING_HEADERS} rows={inningRows(seasonPitching)} />
          </section>

          <section>
            <SectionTitle stripeColor={stripeColor} title="捕手別" />
            <CompactTable headers={CATCHER_HEADERS} rows={catcherRows} />
          </section>

          <section>
            <SectionTitle stripeColor={stripeColor} title="ホームアンドビジターの成績" />
            <CompactTable headers={HOME_AWAY_HEADERS} rows={relevantHomeAwayRows(seasonPitching, player.homeAway)} />
          </section>

          <section>
            <SectionTitle stripeColor={stripeColor} title="デーアンドナイターの成績" />
            <CompactTable headers={DAY_NIGHT_HEADERS} rows={relevantDayNightRows(seasonPitching, player.dayNight)} />
          </section>

          <section>
            <SectionTitle stripeColor={stripeColor} title={`対戦成績一覧（対${player.opponentTeamName}）`} />
            <CompactTable
              headers={MATCHUP_HEADERS}
              rows={opponentMatchupRows.length ? opponentMatchupRows : [{ label: "—", cells: Array.from({ length: 6 }, () => "—") }]}
              firstHeader="打者"
            />
          </section>

          <section>
            <SectionTitle stripeColor={stripeColor} title="カウント別" />
            <CompactTable headers={["被打率", "打数", "安打", "単打", "二塁打", "三塁打", "本塁打"]} rows={countRows.length ? countRows : [{ label: "—", cells: Array.from({ length: 7 }, () => "—") }]} />
          </section>
        </div>
      </div>
    </article>
  )
}

export default function CompactProbablesBoard({ players }: { players: BoardPlayer[] }) {
  return (
    <main className="min-h-screen bg-[#050505] px-4 py-6 text-white">
      <div className="mx-auto max-w-[2200px]">
        <header className="mb-6 rounded-2xl border border-[#242424] bg-[#0d0d0d] p-5">
          <p className="text-[12px] font-bold tracking-[0.18em] text-[#ffff88]">COMPACT BOARD</p>
          <h1 className="mt-1 text-[28px] font-black leading-tight">予告先発6人 スクショ用まとめ</h1>
          <p className="mt-2 text-[12px] leading-relaxed text-[#bfbfbf]">
            2026-09-02 セ・リーグ予告先発。個人ページの縦積みではなく、左右2カラムで圧縮表示しています。
          </p>
        </header>

        <div className="grid gap-5 2xl:grid-cols-2">
          {players.map((player) => (
            <PitcherCard key={player.publicId} player={player} />
          ))}
        </div>
      </div>
    </main>
  )
}
