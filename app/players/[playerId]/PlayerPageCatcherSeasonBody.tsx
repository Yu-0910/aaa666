"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import DerivedPipelineEmptyNotice from "@/app/components/DerivedPipelineEmptyNotice"
import {
  PaRoundPitchTypeChart,
  PitchTypeVsHandSplitBlock,
} from "@/app/components/PitchTypeSplitViewsSection"
import { buildPitchTypeColorMap } from "@/app/components/PitchTypeSplitStackedBarSection"
import { formatEra, formatRankingStatDisplay } from "@/lib/formatStat"
import { resolvePaRoundPitchTypeSplits } from "@/lib/pitcherSeasonPocUi"
import {
  buildCatcherPaRoundPitchTypePayload,
  hasCatcherPaRoundVsHandData,
} from "@/lib/catcherPaRoundPitchTypesUi"
import { slashRate3FromCounts } from "@/lib/battingRateFormat"
import { buildCatcherPitcherSeasonTotals } from "@/lib/catcherPitcherSplits"
import type { CatcherSeasonDerivedState } from "@/lib/catcherSeasonDerivedTypes"
import {
  formatBabipAgainstFromCounts,
  formatGoAoFromBattedBallOuts,
  formatPbPer9FromCounts,
  formatObpAgainstFromCounts,
  formatSlgAgainstFromCounts,
} from "@/lib/catcherPitchingMetrics"
import { playerPageHref } from "@/lib/playerPageHref"

type GamePitchTypeRow = {
  pitch_type: string
  pitches: number
  pct: number
}

type GamePitchTypesData = {
  rows: GamePitchTypeRow[]
} | null

function CatcherPaRoundRowLabel({ keyName }: { keyName: string }) {
  if (keyName === "5") {
    return (
      <>
        5巡目
        <br />
        ～
      </>
    )
  }
  return <>{`${keyName}巡目`}</>
}

/** 巡目別球種一覧の左ラベル（12px の 8 割） */
const CATCHER_PA_ROUND_ROW_LABEL_CLASS =
  "pa-round-pitch-row-label text-gray-200 font-black tabular-nums leading-tight"

export type PlayerPageCatcherSeasonBodyProps = {
  tb: string
  sectionStripeColor: string
  derived: CatcherSeasonDerivedState
  gamePitchTypes: GamePitchTypesData
}

export function PlayerPageCatcherSeasonBody({
  tb,
  sectionStripeColor,
  derived,
  gamePitchTypes,
}: PlayerPageCatcherSeasonBodyProps) {
  const [paRoundVsHandPanels, setPaRoundVsHandPanels] = useState({
    leftOpen: false,
    rightOpen: false,
  })

  const togglePaRoundVsHandPanel = useCallback((side: "left" | "right") => {
    setPaRoundVsHandPanels((prev) => {
      const key = side === "left" ? "leftOpen" : "rightOpen"
      return { ...prev, [key]: !prev[key] }
    })
  }, [])

  return (
                  <div className="w-full mb-7">
                    <DerivedPipelineEmptyNotice
                      variant="catcher"
                      show={(derived.appearances?.gamesAsCatcher ?? 0) === 0}
                    />
                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: `6px solid ${sectionStripeColor}`,
                        fontWeight: 900,
                      }}
                    >
                      基本成績
                    </h2>

                    {(() => {
                      const na = "—"
                      const games = derived.appearances?.gamesAsCatcher ?? 0

                      const ipToOuts = (ip: string | null | undefined): number => {
                        const t = String(ip ?? "").trim()
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
                      const outsToIp = (outs: number): string => {
                        if (outs <= 0) return "0"
                        const w = Math.floor(outs / 3)
                        const f = outs % 3
                        return f === 0 ? String(w) : `${w}.${f}`
                      }
                      const pctRanking = (
                        num: number,
                        den: number,
                        label: string,
                      ): string =>
                        den > 0 ? formatRankingStatDisplay(label, (num / den) * 100) : na
                      const avg = (h: number, ab: number): string =>
                        ab > 0 ? slashRate3FromCounts(h, ab) : na

                      const rows = derived.pitchers ?? []
                      const pitching =
                        derived.seasonTotals ??
                        (rows.length > 0 ? buildCatcherPitcherSeasonTotals(rows) : null)
                      const sum = rows.reduce(
                        (a, r) => {
                          a.bf += r.bf ?? 0
                          a.ab += r.ab ?? 0
                          a.h += r.h ?? 0
                          a.hr += r.hr ?? 0
                          a.so += r.so ?? 0
                          a.bb += r.bb ?? 0
                          a.hbp += r.hbp ?? 0
                          a.outs += r.ipOuts ?? ipToOuts(r.ip)
                          a.wins += r.wins ?? 0
                          a.losses += r.losses ?? 0
                          a.qsCount += r.qsCount ?? 0
                          return a
                        },
                        {
                          bf: 0,
                          ab: 0,
                          h: 0,
                          hr: 0,
                          so: 0,
                          bb: 0,
                          hbp: 0,
                          outs: 0,
                          wins: 0,
                          losses: 0,
                          qsCount: 0,
                        }
                      )

                      // seasonTotals.er を優先。無い旧データは ERA×回数から推定
                      const estErSum = pitching?.er ?? rows.reduce((acc, r) => {
                        const outs = (r.ipOuts ?? ipToOuts(r.ip)) || 0
                        const era = r.era
                        if (era == null || outs <= 0) return acc
                        return acc + (era * outs) / 27
                      }, 0)
                      const outsForRates = pitching?.ipOuts ?? sum.outs
                      const eraAgg =
                        pitching?.era ?? (outsForRates > 0 ? (estErSum * 27) / outsForRates : null)
                      const whipAgg =
                        pitching?.whip ??
                        (outsForRates > 0 ? (sum.h + sum.bb) / (outsForRates / 3) : null)
                      const againstCounts = pitching
                        ? {
                            bf: pitching.bf,
                            h: pitching.h,
                            hr: pitching.hr,
                            so: pitching.so,
                            bb: pitching.bb,
                            hbp: pitching.hbp,
                          }
                        : {
                            bf: sum.bf,
                            h: sum.h,
                            hr: sum.hr,
                            so: sum.so,
                            bb: sum.bb,
                            hbp: sum.hbp,
                          }
                      const pitchesVal =
                        (derived.defenseBasic?.pitches ?? 0) > 0
                          ? String(derived.defenseBasic!.pitches)
                          : na
                      const goAoVal = (() => {
                        const bbOut = derived.defenseBasic?.battedBallOuts
                        if (!bbOut) return na
                        return formatGoAoFromBattedBallOuts(bbOut.ground, bbOut.air)
                      })()
                      const csPctVal =
                        derived.defenseBasic?.csPct != null
                          ? `${derived.defenseBasic.csPct.toFixed(1)}%`
                          : na
                      const pbPer9Val =
                        outsForRates > 0
                          ? formatPbPer9FromCounts(derived.defenseBasic?.pb ?? 0, outsForRates)
                          : na

                      const hasStartingSummary = derived.startingSummary != null
                      const starterStarts = derived.startingSummary?.starts ?? 0
                      const starterWins = derived.startingSummary?.teamWins ?? 0
                      const starterLosses = derived.startingSummary?.teamLosses ?? 0
                      const starterDraws = derived.startingSummary?.teamDraws ?? 0
                      const starterWinPct = hasStartingSummary
                        ? formatRankingStatDisplay("勝率", derived.startingSummary?.teamWinPct)
                        : na
                      const qsCount = derived.startingSummary?.qsCount ?? 0
                      const qsPct =
                        derived.startingSummary?.qsPct != null
                          ? formatRankingStatDisplay("QS率", derived.startingSummary.qsPct)
                          : na
                      const hqsPct =
                        derived.startingSummary?.hqsPct != null
                          ? formatRankingStatDisplay("HQS率", derived.startingSummary.hqsPct)
                          : na

                      // 1段あたり7指標（指定ラベルは維持）
                      const row1 = [
                        hasStartingSummary ? starterWinPct : na, // 勝率＝スタメン試合のチーム勝率
                        String(games),
                        hasStartingSummary ? String(starterStarts) : na, // 先発＝スタメン捕手回数
                        hasStartingSummary ? String(starterWins) : na, // 勝利＝スタメン試合のチーム勝利
                        hasStartingSummary ? String(starterLosses) : na, // 敗戦＝スタメン試合のチーム敗戦
                        hasStartingSummary ? String(starterDraws) : na, // 引分＝スタメン試合のチーム引分
                        avg(pitching?.h ?? sum.h, pitching?.ab ?? sum.ab),
                        hasStartingSummary ? String(qsCount) : na, // QS（回数）
                      ]
                      const row2 = [
                        eraAgg == null ? na : formatEra(eraAgg),
                        outsToIp(outsForRates),
                        (pitching?.bf ?? sum.bf) ? String(pitching?.bf ?? sum.bf) : na,
                        pitchesVal,
                        (pitching?.h ?? sum.h) ? String(pitching?.h ?? sum.h) : na,
                        pctRanking(pitching?.so ?? sum.so, pitching?.bf ?? sum.bf, "K％"),
                        whipAgg != null ? formatRankingStatDisplay("WHIP", whipAgg) : na,
                      ]
                      const row3 = [
                        (pitching?.hr ?? sum.hr) ? String(pitching?.hr ?? sum.hr) : na,
                        (pitching?.so ?? sum.so) ? String(pitching?.so ?? sum.so) : na,
                        (pitching?.bb ?? sum.bb) ? String(pitching?.bb ?? sum.bb) : na,
                        pitching != null ? String(pitching.ibb) : na,
                        (pitching?.hbp ?? sum.hbp) ? String(pitching?.hbp ?? sum.hbp) : na,
                        pitching != null ? String(Math.round(pitching.er)) : na,
                        hasStartingSummary ? qsPct : na, // QS率（母数＝スタメン捕手回数）
                      ]
                      const catcherBasicExtra = [
                        hasStartingSummary ? hqsPct : na, // HQS率（母数＝スタメン捕手回数）
                        sum.bf > 0 ? formatBabipAgainstFromCounts(againstCounts) : na,
                        sum.bf > 0 ? formatObpAgainstFromCounts(againstCounts) : na,
                        sum.bf > 0 ? formatSlgAgainstFromCounts(againstCounts) : na,
                        goAoVal,
                        csPctVal,
                        pbPer9Val,
                      ]
                      return (
                        <>
                          <div className="player-page-table-shell overflow-hidden overflow-x-auto mb-4">
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
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">
                                    勝率
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    試合
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    先発
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    勝利
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    敗戦
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    引分
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    被打率
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    QS
                                  </th>
                                </tr>
                                <tr
                                  style={{
                                    backgroundColor: "rgba(255,255,255,0.03)",
                                    borderTop: "1px solid #333",
                                  }}
                                >
                                  {row1.map((cell, i) => (
                                    <td
                                      key={i}
                                      className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div className="player-page-table-shell overflow-hidden overflow-x-auto mb-4">
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
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">
                                    防御率
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    回数
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    被打者
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    投球数
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    被安
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    K%
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    WHIP
                                  </th>
                                </tr>
                                <tr
                                  style={{
                                    backgroundColor: "rgba(255,255,255,0.03)",
                                    borderTop: "1px solid #333",
                                  }}
                                >
                                  {row2.map((cell, i) => (
                                    <td
                                      key={i}
                                      className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div className="player-page-table-shell overflow-hidden overflow-x-auto mb-4">
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
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">
                                    被本
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    三振
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    四球
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    故意四
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    死球
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    失点
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    QS率
                                  </th>
                                </tr>
                                <tr
                                  style={{
                                    backgroundColor: "rgba(255,255,255,0.03)",
                                    borderTop: "1px solid #333",
                                  }}
                                >
                                  {row3.map((cell, i) => (
                                    <td
                                      key={i}
                                      className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div className="player-page-table-shell overflow-hidden overflow-x-auto mb-4">
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
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">
                                    HQS率
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    被BABIP
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    被出塁率
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    被長打率
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    GO/AO
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    盗塁阻止率
                                  </th>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">
                                    PB/9
                                  </th>
                                </tr>
                                <tr
                                  style={{
                                    backgroundColor: "rgba(255,255,255,0.03)",
                                    borderTop: "1px solid #333",
                                  }}
                                >
                                  {catcherBasicExtra.map((cell, i) => (
                                    <td
                                      key={i}
                                      className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* 巡目別の球種一覧（スタメン時）— 左/右で対左・対右を展開 */}
                          <div className="mb-12">
                            {(() => {
                              const payload = buildCatcherPaRoundPitchTypePayload(
                                derived.paRoundPitchTypes,
                                derived.paRoundPitchTypesVsL,
                                derived.paRoundPitchTypesVsR,
                              )
                              const gameFallback = gamePitchTypes?.rows?.length
                                ? gamePitchTypes.rows
                                : null
                              const paRoundSplits = resolvePaRoundPitchTypeSplits(
                                payload,
                                null,
                                gameFallback,
                              )
                              const paRoundVsLSplits = resolvePaRoundPitchTypeSplits(
                                payload,
                                null,
                                null,
                                "byPaRoundPitchTypesVsL",
                              )
                              const paRoundVsRSplits = resolvePaRoundPitchTypeSplits(
                                payload,
                                null,
                                null,
                                "byPaRoundPitchTypesVsR",
                              )
                              const hasVsL = paRoundVsLSplits != null
                              const hasVsR = paRoundVsRSplits != null
                              const sidePanelPilot = hasCatcherPaRoundVsHandData(
                                derived.paRoundPitchTypesVsL,
                                derived.paRoundPitchTypesVsR,
                              )
                              const paRoundColorMap =
                                paRoundSplits?.length ? buildPitchTypeColorMap(paRoundSplits) : null

                              return (
                                <PitchTypeVsHandSplitBlock
                                  tb={tb}
                                  sectionStripeColor={sectionStripeColor}
                                  title="巡目別の球種一覧（スタメン時）"
                                  titleVsL="対左"
                                  titleVsR="対右"
                                  sidePanelPilot={sidePanelPilot}
                                  hasVsLSplits={hasVsL}
                                  hasVsRSplits={hasVsR}
                                  hintText="左・右を押すと対左／対右の巡目別球種一覧を表示します"
                                  toggleAriaLabel="巡目別球種の対左右表示切替"
                                  leftTitle="巡目別の球種一覧（対左打者）を表示"
                                  rightTitle="巡目別の球種一覧（対右打者）を表示"
                                  leftOpen={paRoundVsHandPanels.leftOpen}
                                  rightOpen={paRoundVsHandPanels.rightOpen}
                                  onLeftToggle={() => togglePaRoundVsHandPanel("left")}
                                  onRightToggle={() => togglePaRoundVsHandPanel("right")}
                                  chartRevealAnimate
                                  renderBaseChart={() => (
                                    <PaRoundPitchTypeChart
                                      splits={paRoundSplits}
                                      rowLabelClassName={CATCHER_PA_ROUND_ROW_LABEL_CLASS}
                                      renderRowLabel={(_, key) => (
                                        <CatcherPaRoundRowLabel keyName={key} />
                                      )}
                                    />
                                  )}
                                  renderVsLChart={(stagger, generation) => (
                                    <PaRoundPitchTypeChart
                                      splits={paRoundVsLSplits}
                                      staggerRowReveal={stagger}
                                      revealGeneration={generation}
                                      baseColorMap={paRoundColorMap}
                                      rowLabelClassName={CATCHER_PA_ROUND_ROW_LABEL_CLASS}
                                      renderRowLabel={(_, key) => (
                                        <CatcherPaRoundRowLabel keyName={key} />
                                      )}
                                    />
                                  )}
                                  renderVsRChart={(stagger, generation) => (
                                    <PaRoundPitchTypeChart
                                      splits={paRoundVsRSplits}
                                      staggerRowReveal={stagger}
                                      revealGeneration={generation}
                                      baseColorMap={paRoundColorMap}
                                      rowLabelClassName={CATCHER_PA_ROUND_ROW_LABEL_CLASS}
                                      renderRowLabel={(_, key) => (
                                        <CatcherPaRoundRowLabel keyName={key} />
                                      )}
                                    />
                                  )}
                                />
                              )
                            })()}
                          </div>

                          {/* 投手別成績（最大15人。投手ページの「捕手別の投球成績」をトレース） */}
                          <h2
                            className={`${tb} mb-4 pl-4 mt-8`}
                            style={{
                              borderLeft: `6px solid ${sectionStripeColor}`,
                              fontWeight: 900,
                            }}
                          >
                            投手別成績
                          </h2>
                          <div className="overflow-x-auto overflow-y-hidden mb-0">
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
                                <col style={{ width: "65px" }} />
                                <col style={{ width: "50px" }} />
                                <col style={{ width: "45px" }} />
                                <col style={{ width: "45px" }} />
                                <col style={{ width: "51px" }} />
                                <col style={{ width: "51px" }} />
                                <col style={{ width: "51px" }} />
                                <col style={{ width: "45px" }} />
                              </colgroup>
                              <thead>
                                <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                                  <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                    投手
                                  </th>
                                  <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                    防御率
                                  </th>
                                  <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                    勝‐敗
                                  </th>
                                  <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                    回数
                                  </th>
                                  <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                    K-BB％
                                  </th>
                                  <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                    K％
                                  </th>
                                  <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                    WHIP
                                  </th>
                                  <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                    QS％
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {(derived.pitchers?.length ? derived.pitchers.slice(0, 15) : []).length ? (
                                  derived.pitchers.slice(0, 15).map((row, ri) => (
                                    <tr
                                      key={`${row.pitcherNpbId}-${ri}`}
                                      style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                                    >
                                      <td
                                        className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                        style={{ backgroundColor: "#1a1a1a" }}
                                      >
                                        {row.pitcherNpbId ? (
                                          <Link
                                            href={playerPageHref({
                                              npbPlayerId: row.pitcherNpbId,
                                              name: row.pitcherName,
                                            })}
                                            className="hover:text-[#FFFF44] transition-colors"
                                          >
                                            {row.pitcherName}
                                          </Link>
                                        ) : (
                                          row.pitcherName
                                        )}
                                      </td>
                                      <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                        {row.era == null ? "—" : formatEra(row.era)}
                                      </td>
                                      <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                        {row.wl || "—"}
                                      </td>
                                      <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                        {row.ip || "—"}
                                      </td>
                                      <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                        {row.kBbPct != null
                                          ? formatRankingStatDisplay("K-BB％", row.kBbPct)
                                          : "—"}
                                      </td>
                                      <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                        {row.kPct != null
                                          ? formatRankingStatDisplay("K％", row.kPct)
                                          : "—"}
                                      </td>
                                      <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                        {row.whip != null
                                          ? formatRankingStatDisplay("WHIP", row.whip)
                                          : "—"}
                                      </td>
                                      <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                        {row.qsPct != null
                                          ? formatRankingStatDisplay("QS率", row.qsPct)
                                          : "—"}
                                      </td>
                                    </tr>
                                  ))
                                ) : (
                                  Array.from({ length: 15 }, (_, i) => (
                                    <tr key={`na-${i}`} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                      <td
                                        className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                        style={{ backgroundColor: "#1a1a1a" }}
                                      >
                                        —
                                      </td>
                                      {Array.from({ length: 7 }, () => "—").map((v, j) => (
                                        <td
                                          key={j}
                                          className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                        >
                                          {v}
                                        </td>
                                      ))}
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )
                    })()}
                  </div>
  )
}
