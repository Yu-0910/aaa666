"use client"

import type React from "react"
import { CareerHighStatGrid } from "@/app/components/player/CareerHighStatGrid"
import CareerBattingTableRankingStyle from "@/app/components/player/CareerBattingTableRankingStyle"
import { SectionLoadingSpinner } from "@/components/ui/spinner"
import { formatCareerHighBattingHeading } from "@/lib/playerCareerHighBatting"
import { formatCareerHighPitchingHeading } from "@/lib/playerCareerHighPitching"
import { CAREER_TABLE_SCALE_MULTIPLIER } from "@/lib/playerCareerPitchingTablePilot"
import {
  PITCHING_STAT_COLUMNS,
  careerAgeAtYear,
  careerYearLabel,
  formatCareerCell,
  formatSalaryManFromRow,
  type CareerDisplayRow,
} from "@/lib/playerCareerMergedDisplay"
import {
  battingColsLeft,
  battingColsRight,
  careerTd,
  careerTh,
  careerYearTd,
  pitchingColsLeft,
  pitchingColsRight,
  type ProfileMergedPayload,
} from "./playerPageShared"

const CAREER_HIGH_TAB_GRID_CLASS = "career-high-tab-stat-grid"

function careerHighTabGridClassName(className?: string): string {
  return [CAREER_HIGH_TAB_GRID_CLASS, className].filter(Boolean).join(" ")
}

function CareerTableScaleWrap({
  scaleMultiplier,
  children,
  className,
}: {
  scaleMultiplier: number
  children: React.ReactNode
  className?: string
}) {
  if (scaleMultiplier === 1) {
    return className ? <div className={className}>{children}</div> : <>{children}</>
  }
  return (
    <div className={className} style={{ zoom: scaleMultiplier }}>
      {children}
    </div>
  )
}

export type PlayerPageCareerSectionProps = {
  showSeasonCareerTabs: boolean
  statsTab: "season" | "career"
  pitcherCareerPitchingTightLayout: boolean
  pitcherCareerPitchingTablePilot: boolean
  showCareerBattingSection: boolean
  profileMergedSettled: boolean
  profileMerged: ProfileMergedPayload
  showCareerPitchingRankingTable: boolean
  showLegacyPitchingCareerSection: boolean
  showSeasonCareerTabsPitcher: boolean
  pitcherCareerSubTab: "total" | "high"
  fielderCareerSubTab: "total" | "high"
  careerHighSectionH2Class: string
  careerBattingSectionH2Style: React.CSSProperties
  careerHighBattingCards: Array<Record<string, unknown>>
  isMobile: boolean
  renderPitcherCareerSubTabBar: (inline: boolean, shellClass?: string) => React.ReactNode
  renderFielderCareerSubTabBar: (inline: boolean, shellClass?: string) => React.ReactNode
  pitcherCareerH2Class: string
  careerBattingTotalSectionH2Class: string
  mergedPitchingRowsForDisplay: CareerDisplayRow[]
  mergedBirthRaw: string
  careerHighPitching: { seasonYear: number | null; cards: Array<Record<string, unknown>> }
  fielderCareerH2Class: string
  useRankingStyleCareerBattingTable: boolean
  mergedBattingRowsForDisplay: CareerDisplayRow[]
  careerHighBattingYear: number | null
  tb: string
  sectionStripeColor: string
  /** 2026名簿外は通算表の年俸列と見出しの「／年俸」を非表示 */
  showSalaryColumn?: boolean
  /** 通算成績表の表・文字・数値スケール */
  careerTableScaleMultiplier?: number
  careerSubTabToContentGap?: React.CSSProperties["marginTop"]
  /** 打撃キャリアハイカードの追加クラス */
  careerHighBattingGridClassName?: string
  careerBattingTableClassName?: string
  careerBattingTableShellClassName?: string
}

export function PlayerPageCareerSection(props: PlayerPageCareerSectionProps) {
  const {
    showSeasonCareerTabs,
    statsTab,
    pitcherCareerPitchingTightLayout,
    pitcherCareerPitchingTablePilot,
    showCareerBattingSection,
    profileMergedSettled,
    profileMerged,
    showCareerPitchingRankingTable,
    showLegacyPitchingCareerSection,
    pitcherCareerSubTab,
    fielderCareerSubTab,
    careerHighSectionH2Class,
    careerBattingSectionH2Style,
    careerHighBattingCards,
    isMobile,
    renderPitcherCareerSubTabBar,
    renderFielderCareerSubTabBar,
    pitcherCareerH2Class,
    careerBattingTotalSectionH2Class,
    mergedPitchingRowsForDisplay,
    mergedBirthRaw,
    careerHighPitching,
    fielderCareerH2Class,
    useRankingStyleCareerBattingTable,
    mergedBattingRowsForDisplay,
    careerHighBattingYear,
    tb,
    sectionStripeColor,
    showSalaryColumn = false,
    careerTableScaleMultiplier = CAREER_TABLE_SCALE_MULTIPLIER,
    careerSubTabToContentGap,
    careerHighBattingGridClassName,
    careerBattingTableClassName,
    careerBattingTableShellClassName,
  } = props

  if (showSeasonCareerTabs && statsTab !== "career") return null

  const content = (
    <>
        {!pitcherCareerPitchingTablePilot && !showCareerBattingSection && (
          <>
        {/* Section Title */}
        <h2
          className={careerHighSectionH2Class}
          style={careerBattingSectionH2Style}
        >
          キャリアハイの打撃成績
        </h2>

        <CareerHighStatGrid
          cards={careerHighBattingCards}
          isMobile={isMobile}
          className={careerHighTabGridClassName(careerHighBattingGridClassName)}
        />
          </>
        )}

        {!profileMergedSettled && (
          <div className="mb-8">
            <SectionLoadingSpinner className="py-6" />
          </div>
        )}

        {profileMergedSettled && !profileMerged && (
          <div
            className="mb-8 max-w-3xl rounded border border-amber-600/50 bg-amber-950/35 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/95"
            role="status"
          >
            <p className="font-bold text-amber-200">通算データの読み込みに失敗しました</p>
            <p className="mt-1.5 text-[10px] text-amber-100/85">
              初回は API のコンパイルに時間がかかることがあります。数十秒待ってからページを再読み込みしてください。
              解消しない場合は{" "}
              <code className="rounded bg-black/35 px-1 py-0.5 text-[9px]">npm run player-profile:phase6:merge</code>
              を実行してください。
            </p>
          </div>
        )}

        {profileMergedSettled &&
          profileMerged &&
          !showCareerBattingSection &&
          !showCareerPitchingRankingTable &&
          !showLegacyPitchingCareerSection && (
          <div
            className="mb-8 max-w-3xl rounded border border-amber-600/50 bg-amber-950/35 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/95"
            role="status"
          >
            <p className="font-bold text-amber-200">通算成績データがありません</p>
            <p className="mt-1.5 text-[10px] text-amber-100/85">
              マスタ CSV に通算成績が無い選手です（年俸のみの場合があります）。
            </p>
          </div>
        )}

        {showCareerPitchingRankingTable && (
          <div>
            {!showSeasonCareerTabs && renderPitcherCareerSubTabBar(false)}
            {(!showSeasonCareerTabs || pitcherCareerSubTab === "total") && (
              <>
                <h2
                  className={
                    showSeasonCareerTabs ? pitcherCareerH2Class : careerBattingTotalSectionH2Class
                  }
                  style={careerBattingSectionH2Style}
                >
                  通算の投手成績／年俸
                </h2>
                <CareerBattingTableRankingStyle
                  rows={mergedPitchingRowsForDisplay}
                  birthRaw={mergedBirthRaw}
                  columns={PITCHING_STAT_COLUMNS}
                  rowKeyPrefix="career-pit"
                  showSalaryColumn={showSalaryColumn}
                  scaleMultiplier={careerTableScaleMultiplier}
                />
              </>
            )}
            {showSeasonCareerTabs && pitcherCareerSubTab === "high" && (
              <>
                <h2
                  className={
                    showSeasonCareerTabs ? pitcherCareerH2Class : careerHighSectionH2Class
                  }
                  style={careerBattingSectionH2Style}
                >
                  {formatCareerHighPitchingHeading(careerHighPitching.seasonYear)}
                </h2>
                <CareerHighStatGrid
                  cards={careerHighPitching.cards}
                  isMobile={isMobile}
                  className={CAREER_HIGH_TAB_GRID_CLASS}
                />
              </>
            )}
          </div>
        )}

        {showCareerBattingSection && (
          <div>
            {!showSeasonCareerTabs && renderFielderCareerSubTabBar(false)}
            {(!showSeasonCareerTabs || fielderCareerSubTab === "total") && (
              <>
        <h2
          className={
            showSeasonCareerTabs ? fielderCareerH2Class : careerBattingTotalSectionH2Class
          }
          style={careerBattingSectionH2Style}
        >
          通算の打撃成績／年俸
        </h2>

        {useRankingStyleCareerBattingTable ? (
          <CareerBattingTableRankingStyle
            rows={mergedBattingRowsForDisplay}
            birthRaw={mergedBirthRaw}
            showSalaryColumn={showSalaryColumn}
            scaleMultiplier={careerTableScaleMultiplier}
            tableClassName={careerBattingTableClassName}
            shellClassName={careerBattingTableShellClassName}
          />
        ) : (
        <CareerTableScaleWrap
          scaleMultiplier={careerTableScaleMultiplier}
          className={isMobile ? "mb-4 grid grid-cols-1 gap-4" : "mb-4 grid grid-cols-2 gap-4"}
        >
          <div className="player-page-table-shell rounded overflow-hidden min-w-0 overflow-x-auto">
            <table className="w-full text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "collapse", border: "1px solid #555", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                  <th className={careerTh}>年度</th>
                  <th className={careerTh}>年齢</th>
                  {battingColsLeft.map((col) => (
                    <th key={col.key} className={careerTh}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mergedBattingRowsForDisplay.map((stat, idx) => {
                  const isTotalRow = Boolean(stat.is_total) || stat.year === "通算"
                  return (
                  <tr
                    key={`bat-l-${idx}`}
                    style={{
                      backgroundColor: "rgba(255,255,255,0.03)",
                      ...(isTotalRow ? { borderTop: "2px solid #ffff44" } : {}),
                    }}
                  >
                    <td className={careerYearTd} style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                      {careerYearLabel(stat)}
                    </td>
                    <td className={careerTd}>{careerAgeAtYear(mergedBirthRaw, stat)}</td>
                    {battingColsLeft.map((col) => (
                      <td key={col.key} className={careerTd}>
                        {formatCareerCell(col, stat)}
                      </td>
                    ))}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="player-page-table-shell rounded overflow-hidden min-w-0 overflow-x-auto">
            <table className="w-full text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "collapse", border: "1px solid #555", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                  <th className={careerTh}>年度</th>
                  <th className={careerTh}>年齢</th>
                  {battingColsRight.map((col) => (
                    <th key={col.key} className={careerTh}>
                      {col.label}
                    </th>
                  ))}
                  {showSalaryColumn ? <th className={careerTh}>年俸（万）</th> : null}
                </tr>
              </thead>
              <tbody>
                {mergedBattingRowsForDisplay.map((stat, idx) => {
                  const isTotalRow = Boolean(stat.is_total) || stat.year === "通算"
                  return (
                  <tr
                    key={`bat-r-${idx}`}
                    style={{
                      backgroundColor: "rgba(255,255,255,0.03)",
                      ...(isTotalRow ? { borderTop: "2px solid #ffff44" } : {}),
                    }}
                  >
                    <td className={careerYearTd} style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                      {careerYearLabel(stat)}
                    </td>
                    <td className={careerTd}>{careerAgeAtYear(mergedBirthRaw, stat)}</td>
                    {battingColsRight.map((col) => (
                      <td key={col.key} className={careerTd}>
                        {formatCareerCell(col, stat)}
                      </td>
                    ))}
                    {showSalaryColumn ? (
                      <td className={careerTd}>{formatSalaryManFromRow(stat)}</td>
                    ) : null}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CareerTableScaleWrap>
        )}
              </>
            )}
            {showSeasonCareerTabs && fielderCareerSubTab === "high" && (
              <>
                <h2
                  className={fielderCareerH2Class}
                  style={careerBattingSectionH2Style}
                >
                  {formatCareerHighBattingHeading(careerHighBattingYear)}
                </h2>
                <CareerHighStatGrid
                  cards={careerHighBattingCards}
                  isMobile={isMobile}
                  className={careerHighTabGridClassName(careerHighBattingGridClassName)}
                />
              </>
            )}
          </div>
        )}

        {showLegacyPitchingCareerSection && (
          <>
        <h2
          className={`${tb} mb-6 pl-4`}
          style={{
            borderLeft: `6px solid ${sectionStripeColor}`,
            fontWeight: 900,
          }}
        >
          通算の投手成績／年俸
        </h2>

        <CareerTableScaleWrap
          scaleMultiplier={careerTableScaleMultiplier}
          className={isMobile ? "mb-12 grid grid-cols-1 gap-4" : "mb-12 grid grid-cols-2 gap-4"}
        >
          <div className="player-page-table-shell rounded overflow-hidden min-w-0 overflow-x-auto">
            <table className="w-full text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "collapse", border: "1px solid #555", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                  <th className={careerTh}>年度</th>
                  <th className={careerTh}>年齢</th>
                  {pitchingColsLeft.map((col) => (
                    <th key={col.key} className={careerTh}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mergedPitchingRowsForDisplay.map((stat, idx) => (
                  <tr key={`pit-l-${idx}`} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                    <td className={careerYearTd} style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                      {careerYearLabel(stat)}
                    </td>
                    <td className={careerTd}>{careerAgeAtYear(mergedBirthRaw, stat)}</td>
                    {pitchingColsLeft.map((col) => (
                      <td key={col.key} className={careerTd}>
                        {formatCareerCell(col, stat)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="player-page-table-shell rounded overflow-hidden min-w-0 overflow-x-auto">
            <table className="w-full text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "collapse", border: "1px solid #555", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                  <th className={careerTh}>年度</th>
                  <th className={careerTh}>年齢</th>
                  {pitchingColsRight.map((col) => (
                    <th key={col.key} className={careerTh}>
                      {col.label}
                    </th>
                  ))}
                  {showSalaryColumn ? <th className={careerTh}>年俸（万）</th> : null}
                </tr>
              </thead>
              <tbody>
                {mergedPitchingRowsForDisplay.map((stat, idx) => (
                  <tr key={`pit-r-${idx}`} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                    <td className={careerYearTd} style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                      {careerYearLabel(stat)}
                    </td>
                    <td className={careerTd}>{careerAgeAtYear(mergedBirthRaw, stat)}</td>
                    {pitchingColsRight.map((col) => (
                      <td key={col.key} className={careerTd}>
                        {formatCareerCell(col, stat)}
                      </td>
                    ))}
                    {showSalaryColumn ? (
                      <td className={careerTd}>{formatSalaryManFromRow(stat)}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CareerTableScaleWrap>
          </>
        )}
    </>
  )

  return showSeasonCareerTabs && careerSubTabToContentGap ? (
    <div style={{ marginTop: careerSubTabToContentGap }}>{content}</div>
  ) : (
    content
  )
}
