"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import PitcherSeasonPitchTypesTable from "@/app/components/PitcherSeasonPitchTypesTable"
import { PitchTypeSplitViewsSection } from "@/app/components/PitchTypeSplitViewsSection"
import { PlayerPageProfileTableBlock } from "@/app/players/[playerId]/PlayerPageProfileTableBlock"
import type { ProfileMergedPayload } from "@/app/players/[playerId]/playerPageShared"
import { formatSlashStatDisplay } from "@/lib/battingRateFormat"
import {
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
import type { PitcherSeasonPocPayload } from "@/lib/pitcherSeasonPocTypes"
import { matchupOpponentDisplayNameJa } from "@/lib/playerNameNormalize"
import {
  compareMatchupOpponentsByOpsDesc,
  PLAYER_MATCHUP_NAME_COLUMN_WIDTH_PX,
  PLAYER_MATCHUP_TABLE_COLUMNS,
} from "@/lib/playerMatchupSeasonTab"
import type { PlayerProfileMergedPayload } from "@/lib/playerProfileMergedServer"
import type { PlayerMatchupDerived } from "@/lib/playerMatchupTypes"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"
import type { PitcherSeasonPitchTypesPayload } from "@/lib/yahooGame/pitcherSeasonPitchTypes"

const PitchTypePieChart = dynamic(() => import("@/app/components/PitchTypePieChart"), { ssr: false })
const PitchTypeChartLegend = dynamic(
  () => import("@/app/components/PitchTypePieChart").then((module) => ({ default: module.PitchTypeChartLegend })),
  { ssr: false },
)

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

export type BoardMatchup = {
  gameId: string
  gameDateJst: string
  matchupLabel: string
  leftPlayer: BoardPlayer
  rightPlayer: BoardPlayer
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

const DEFAULT_STATE: PitcherCardState = {
  seasonPitching: null,
  seasonPitchTypes: null,
  matchup: null,
}

const SECTION_HEADING_CLASS = "text-[1.125rem]"
const SECTION_HEADING_SHELL = `${SECTION_HEADING_CLASS} mb-4 pl-4`

function PitcherSectionHeading({
  stripeColor,
  title,
  className = SECTION_HEADING_SHELL,
}: {
  stripeColor: string
  title: string
  className?: string
}) {
  return (
    <h2
      className={className}
      style={{
        borderLeft: `6px solid ${stripeColor}`,
        fontWeight: 900,
      }}
    >
      {title}
    </h2>
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

function PlayerContextTable({ player }: { player: BoardPlayer }) {
  const rows = [
    { label: "対戦カード", value: `${player.teamName} vs ${player.opponentTeamName}` },
    { label: "ホーム&ビジター", value: player.homeAway === "home" ? "ホーム" : "ビジター" },
    { label: "デー&ナイター", value: player.dayNight === "night" ? "ナイター" : "デー" },
    { label: "日付", value: player.gameDateJst },
  ]

  return (
    <div
      className="player-page-profile-table-shell rounded overflow-hidden"
      style={{ border: "1px solid #333333", borderRadius: "0.25rem" }}
    >
      <table className="player-page-profile-table-base w-full border-collapse" style={{ border: "0" }}>
        <tbody style={{ fontWeight: 900, lineHeight: 1.35, fontSize: "0.875rem" }}>
          {rows.map((row) => (
            <tr key={row.label}>
              <td
                className="px-2 py-1.5"
                style={{
                  backgroundColor: "#FFFF44",
                  color: "#000000",
                  border: "1px solid #333333",
                  width: "120px",
                  fontWeight: 900,
                }}
              >
                {row.label}
              </td>
              <td className="px-2 py-1.5" style={{ border: "1px solid #333333" }}>
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailedStatsTables({ payload }: { payload: PitcherSeasonPocPayload | null }) {
  const rows = [
    {
      headers: ["防御率", "試合", "先発", "救援", "勝利", "敗戦", "Ｓ", "ＨＰ", "被打率", "QS"],
      cells: payload ? pitcherPocBasicRow1(payload) : Array.from({ length: 10 }, () => "—"),
    },
    {
      headers: ["完投", "完封", "無四球", "勝率", "回数", "被打者", "投球数", "P/IP", "被安", "K%"],
      cells: payload ? pitcherPocBasicRow2(payload) : Array.from({ length: 10 }, () => "—"),
    },
    {
      headers: ["被本", "三振", "四球", "故意四", "死球", "暴投", "失点", "自責", "WHIP", "QS率"],
      cells: payload ? pitcherPocBasicRow3(payload) : Array.from({ length: 10 }, () => "—"),
    },
  ]

  return (
    <div className="space-y-4">
      {rows.map((row, index) => (
        <div key={index} className="player-page-table-shell overflow-hidden overflow-x-auto">
          <table
            className="text-xs"
            style={{
              fontVariantNumeric: "tabular-nums",
              borderCollapse: "collapse",
              border: "1px solid #555",
              width: "100%",
              tableLayout: "fixed",
            }}
          >
            <tbody>
              <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                {row.headers.map((header, headerIndex) => (
                  <th
                    key={header}
                    className={`px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500${
                      headerIndex === 0 ? " first:border-l-0" : ""
                    }`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
              <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                {row.cells.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={`px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500${
                      cellIndex === 0 ? " first:border-l-0" : ""
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function StandardSplitTable({
  firstHeader,
  headers,
  rows,
  firstColWidth,
  firstCellAlign = "text-left",
}: {
  firstHeader: string
  headers: string[]
  rows: Array<{ label: string; cells: string[] }>
  firstColWidth: string
  firstCellAlign?: "text-left" | "text-center"
}) {
  return (
    <div className="player-page-table-shell overflow-x-auto overflow-y-hidden">
      <table
        className="text-xs"
        style={{
          fontVariantNumeric: "tabular-nums",
          borderCollapse: "separate",
          borderSpacing: 0,
          border: "1px solid #555",
          width: "100%",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: firstColWidth }} />
          {headers.map((_, index) => (
            <col key={index} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
              {firstHeader}
            </th>
            {headers.map((header) => (
              <th
                key={header}
                className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row.label}-${rowIndex}`} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
              <td
                className={`px-1 py-1 ${firstCellAlign} latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]`}
                style={{ backgroundColor: "#1a1a1a" }}
              >
                {row.label}
              </td>
              {row.cells.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                >
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

function InningSplitTable({
  payload,
  inningCount,
}: {
  payload: PitcherSeasonPocPayload | null
  inningCount: number
}) {
  const rows = Array.from({ length: inningCount }, (_, index) => {
    const inning = index + 1
    return {
      label: `${inning}回`,
      cells: payload ? pitcherPocInningRow(payload, inning) : Array.from({ length: 8 }, () => "—"),
    }
  })

  return (
    <StandardSplitTable
      firstHeader="イニング"
      headers={["防御率", "打数", "K-BB％", "K％", "BB％", "WHIP", "被打率", "被本塁打"]}
      rows={rows}
      firstColWidth="58px"
      firstCellAlign="text-center"
    />
  )
}

function MatchupTable({
  payload,
  opponentTeamCode,
}: {
  payload: PlayerMatchupDerived | null
  opponentTeamCode: string
}) {
  const team = payload?.teams.find((item) => item.teamCode === opponentTeamCode)
  const rows = [...(team?.opponents ?? [])].sort(compareMatchupOpponentsByOpsDesc)

  return (
    <div className="player-page-table-shell overflow-x-auto overflow-y-hidden">
      <table
        className="text-xs"
        style={{
          fontVariantNumeric: "tabular-nums",
          borderCollapse: "separate",
          borderSpacing: 0,
          border: "1px solid #555",
          width: "100%",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: `${PLAYER_MATCHUP_NAME_COLUMN_WIDTH_PX}px` }} />
          {PLAYER_MATCHUP_TABLE_COLUMNS.map((column) => (
            <col key={column.key} style={{ width: "48px" }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
              打者
            </th>
            {PLAYER_MATCHUP_TABLE_COLUMNS.map((column) => (
              <th
                key={column.key}
                className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows.length ? rows : []).map((row) => (
            <tr key={row.opponentNpbId} style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "#f5f5f5" }}>
              <td
                className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                style={{ backgroundColor: "#1a1a1a" }}
              >
                {matchupOpponentDisplayNameJa(row.opponentName)}
              </td>
              <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{String(row.ab)}</td>
              <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{String(row.h)}</td>
              <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{String(row.hr)}</td>
              <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{String(row.so)}</td>
              <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                {row.avg != null ? formatSlashStatDisplay(row.avg) : "—"}
              </td>
              <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                {row.ops != null ? formatSlashStatDisplay(row.ops) : "—"}
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "#f5f5f5" }}>
              <td
                className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                style={{ backgroundColor: "#1a1a1a" }}
              >
                —
              </td>
              {PLAYER_MATCHUP_TABLE_COLUMNS.map((column) => (
                <td
                  key={column.key}
                  className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                >
                  —
                </td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

function PitchDataCharts({
  seasonPitching,
  seasonPitchTypes,
}: {
  seasonPitching: PitcherSeasonPocPayload | null
  seasonPitchTypes: PitcherSeasonPitchTypesPayload | null
}) {
  const rows = seasonPitchTypes?.rows ?? []
  const colorOrder = rows.map((row) => row.pitch_type)
  const toChart = (key: "pct_vs_left" | "pct_vs_right") =>
    rows
      .map((row) => ({
        pitch_type: row.pitch_type,
        pitches: row.pitches,
        pct: row[key] ?? 0,
      }))
      .filter((row) => row.pct > 0)
  const leftRows = toChart("pct_vs_left")
  const rightRows = toChart("pct_vs_right")
  const hand = seasonPitching?.splits.vsHand
  const centerStats = (value: NonNullable<typeof hand>["vsL"] | undefined) => {
    if (!value || value.bf <= 0) return undefined
    const cells = pitcherPocHandCells(value)
    return { avgAgainst: cells[0], kBbPct: cells[3] }
  }

  if (!leftRows.length && !rightRows.length) return null

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-start justify-center gap-2">
        {rightRows.length > 0 ? (
          <PitchTypePieChart
            title="対右"
            rows={rightRows}
            centerStats={centerStats(hand?.vsR)}
            pitchTypeColorOrder={colorOrder}
            compact
            sizeScale={0.78}
            isAnimationActive={false}
          />
        ) : null}
        {leftRows.length > 0 ? (
          <PitchTypePieChart
            title="対左"
            rows={leftRows}
            centerStats={centerStats(hand?.vsL)}
            pitchTypeColorOrder={colorOrder}
            compact
            sizeScale={0.78}
            isAnimationActive={false}
          />
        ) : null}
      </div>
      <PitchTypeChartLegend pitchTypes={colorOrder} pitchTypeColorOrder={colorOrder} className="mb-0" scale={0.82} />
    </div>
  )
}

function PitcherPanel({ player }: { player: BoardPlayer }) {
  const stripeColor = rankingTeamStripeColor(player.teamCode)
  const { seasonPitching, seasonPitchTypes, matchup } = usePitcherCardData(player)
  const inningCount = useMemo(() => {
    const fallback = 9
    const maxFromData =
      seasonPitching?.splits?.byInning?.reduce((max, row) => Math.max(max, row.inning ?? 0), 0) ?? 0
    return Math.min(18, Math.max(fallback, maxFromData))
  }, [seasonPitching])
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
  const homeAwayRows = useMemo(
    () =>
      seasonPitching
        ? pitcherPocHomeAwayRows(seasonPitching).map((row) => ({
            label: row.label,
            cells: [row.era, row.wl, row.ip, row.k_bb_pct, row.k_pct, row.whip, formatSlashStatDisplay(row.avg)],
          }))
        : (["ホーム", "アウェー"] as const).map((label) => ({
            label,
            cells: Array.from({ length: 7 }, () => "—"),
          })),
    [seasonPitching],
  )
  const dayNightRows = useMemo(
    () =>
      seasonPitching
        ? pitcherPocDayNightRows(seasonPitching).map((row) => ({
            label: row.label,
            cells: [row.era, row.wl, row.ip, row.k_bb_pct, row.k_pct, row.whip, row.qs_pct],
          }))
        : (["デー", "ナイター"] as const).map((label) => ({
            label,
            cells: Array.from({ length: 7 }, () => "—"),
          })),
    [seasonPitching],
  )
  const countRows = useMemo(
    () =>
      seasonPitching
        ? pitcherPocCountRows(seasonPitching).map((row) => ({ label: row.label, cells: row.cells }))
        : [{ label: "—", cells: Array.from({ length: 7 }, () => "—") }],
    [seasonPitching],
  )

  return (
    <article className="min-w-0 px-6 py-6">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="player-page-team-color-bar h-12 w-1.5 flex-shrink-0" style={{ backgroundColor: stripeColor }} />
          <div className="flex flex-col">
            <h1
              className="player-page-display-name text-[1.5rem] leading-tight"
              style={{
                textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
                fontWeight: 900,
              }}
            >
              {player.nameJa}
            </h1>
            <span className="player-page-roman-name text-sm leading-tight text-gray-400 mt-0.5">{player.teamName}</span>
          </div>
        </div>
      </div>

      <div className="player-season-tab-numerics">
        <div className="pitcher-season-career-high-numerics space-y-8">
          <section>
            <PitcherSectionHeading stripeColor={stripeColor} title="プロフィール" />
            <div className="space-y-4">
              <PlayerContextTable player={player} />
              <PlayerPageProfileTableBlock
                {...profileTableProps(player.profileMerged)}
                tableClassName="player-page-profile-table-base"
                showFinancialFields={false}
              />
            </div>
          </section>

          <section>
            <PitcherSectionHeading stripeColor={stripeColor} title="詳細成績" />
            <DetailedStatsTables payload={seasonPitching} />
          </section>

          <section>
            <PitcherSectionHeading stripeColor={stripeColor} title="左右別の投球成績" />
            <StandardSplitTable
              firstHeader="条件"
              headers={["被打率", "打数", "被安打", "K-BB％", "K％", "BB％", "被本"]}
              rows={handRows}
              firstColWidth="48px"
              firstCellAlign="text-center"
            />
          </section>

          <section>
            <PitcherSectionHeading stripeColor={stripeColor} title="投球データ" />
            <PitchDataCharts seasonPitching={seasonPitching} seasonPitchTypes={seasonPitchTypes} />
            <PitcherSeasonPitchTypesTable rows={seasonPitchTypes?.rows ?? []} />
          </section>

          <section>
            <PitchTypeSplitViewsSection
              tb={SECTION_HEADING_CLASS}
              sectionStripeColor={stripeColor}
              pitcherSeasonPocPayload={seasonPitching}
              seasonRows={seasonPitchTypes?.rows ?? null}
              gameRows={[]}
              countSplits={seasonPitching?.splits.byCountPitchTypes ?? null}
              sidePanelPilot={false}
              chartRevealAnimate={false}
            />
          </section>

          <section>
            <PitcherSectionHeading stripeColor={stripeColor} title="巡目別の投球成績" className={`${SECTION_HEADING_CLASS} mb-4 pl-4 mt-8`} />
            <StandardSplitTable
              firstHeader="巡目"
              headers={["被打率", "打数", "被安打", "K-BB％", "K％", "BB％", "被本"]}
              rows={["1", "2", "3", "4", "5"].map((key) => {
                const row = seasonPitching?.splits.byPaRound?.find((item) => item.key === key)
                if (!row || row.bf <= 0) {
                  return {
                    label: key === "5" ? "5巡目+" : `${key}巡目`,
                    cells: Array.from({ length: 7 }, () => "—"),
                  }
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
              })}
              firstColWidth="58px"
              firstCellAlign="text-center"
            />
          </section>

          <section>
            <PitcherSectionHeading stripeColor={stripeColor} title="イニング別の投球成績" className={`${SECTION_HEADING_CLASS} mb-4 pl-4 mt-8`} />
            <InningSplitTable payload={seasonPitching} inningCount={inningCount} />
          </section>

          <section>
            <PitcherSectionHeading stripeColor={stripeColor} title="捕手別の投球成績" className={`${SECTION_HEADING_CLASS} mb-4 pl-4 mt-8`} />
            <StandardSplitTable
              firstHeader="捕手"
              headers={["防御率", "勝‐敗", "回数", "K-BB％", "K％", "WHIP", "QS％"]}
              rows={catcherRows}
              firstColWidth="65px"
            />
          </section>

          <section>
            <PitcherSectionHeading stripeColor={stripeColor} title="ホーム&ビジター別の投球成績" className={`${SECTION_HEADING_CLASS} mb-4 pl-4 mt-8`} />
            <StandardSplitTable
              firstHeader="種別"
              headers={["防御率", "勝‐敗", "回数", "K-BB％", "K％", "WHIP", "被打率"]}
              rows={homeAwayRows}
              firstColWidth="65px"
            />
          </section>

          <section>
            <PitcherSectionHeading stripeColor={stripeColor} title="デー&ナイター別の投球成績" className={`${SECTION_HEADING_CLASS} mb-4 pl-4 mt-8`} />
            <StandardSplitTable
              firstHeader="種別"
              headers={["防御率", "勝‐敗", "回数", "K-BB％", "K％", "WHIP", "QS％"]}
              rows={dayNightRows}
              firstColWidth="65px"
            />
          </section>

          <section>
            <PitcherSectionHeading stripeColor={stripeColor} title="対戦成績" className={`${SECTION_HEADING_CLASS} mb-4 pl-4 mt-8`} />
            <MatchupTable payload={matchup} opponentTeamCode={player.opponentTeamCode} />
          </section>

          <section>
            <PitcherSectionHeading stripeColor={stripeColor} title="カウント別の投球成績" className={`${SECTION_HEADING_CLASS} mb-4 pl-4 mt-8`} />
            <StandardSplitTable
              firstHeader="カウント"
              headers={["被打率", "打数", "安打", "単打", "二塁打", "三塁打", "本塁打"]}
              rows={countRows}
              firstColWidth="72px"
            />
          </section>
        </div>
      </div>
    </article>
  )
}

function MatchupRow({ matchup }: { matchup: BoardMatchup }) {
  return (
    <section
      className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] border-t border-[#333333] bg-[rgba(255,255,255,0.02)]"
      aria-label={matchup.matchupLabel}
    >
      <PitcherPanel player={matchup.leftPlayer} />
      <div className="bg-[#333333]" aria-hidden />
      <PitcherPanel player={matchup.rightPlayer} />
    </section>
  )
}

export default function CompactProbablesBoard({ matchups }: { matchups: BoardMatchup[] }) {
  return (
    <main className="player-page-fonts pitcher-season-numerics-ui min-h-screen overflow-x-hidden bg-[#050505] text-white">
      <div className="mx-auto w-full max-w-[2000px] px-6 py-6">
        <header className="mb-6 border-b border-[#333333] pb-4">
          <h1 className="player-page-display-name text-[1.5rem] leading-tight" style={{ fontWeight: 900 }}>
            セ・リーグ予告先発
          </h1>
          <p className="mt-1 text-sm text-gray-400">2026-09-02 / 2列 × 3試合表示</p>
        </header>

        <div className="border border-[#333333]">
          {matchups.map((matchup) => (
            <MatchupRow key={matchup.gameId} matchup={matchup} />
          ))}
        </div>
      </div>
    </main>
  )
}
