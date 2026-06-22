#!/usr/bin/env node
/**
 * app/players/[playerId]/page.tsx を分割（Vercel ビルド時間短縮）
 * 用法: node scripts/split_player_page.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const dir = path.join(root, 'app', 'players', '[playerId]')
const srcPath = path.join(dir, 'page.tsx')
const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/)

const slice = (from, to) => lines.slice(from - 1, to).join('\n')

// 1–101: imports (page.tsx 用は後で生成)
// 103–244: shared (types, helpers, constants)
const sharedBody = slice(103, 244)
  .replace(/^type ProfileMergedPayload/m, 'export type ProfileMergedPayload')
  .replace(/^function (pctOfBf|kMinusBbPctOfBf|parseBirthDateJa|calcAgeFromJaBirth|stripQueryHash|playerIdSegmentFromPathname)/gm, 'export function $1')
  .replace(/^const (teamColors|playerRomanNames|AOYAGI_NPB_ID|FIELDER_PILOT|battingCols|pitchingCols|careerTh|careerTd|careerYearTd)/gm, (m) => {
    if (m.startsWith('const { left: battingCols')) return 'export ' + m
    if (m.startsWith('const { left: pitchingCols')) return 'export ' + m
    return 'export ' + m
  })

const sharedImports = `import {
  careerAgeAtYear,
  careerYearLabel,
  formatCareerCell,
  formatSalaryManFromRow,
  splitBattingColumns,
  splitPitchingColumns,
} from "@/lib/playerCareerMergedDisplay"
`

const sharedPath = path.join(dir, 'playerPageShared.ts')
fs.writeFileSync(
  sharedPath,
  `${sharedImports}
${sharedBody}
`,
  'utf8',
)

// 246–4693: PlayerPageClient
const clientHeader = `"use client"

import type React from "react"

import Link from "next/link"
import Image from "next/image"
import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import SeasonStatsPilot from "@/app/components/SeasonStatsPilot"
import PitchDetailsPilot from "@/app/components/PitchDetailsPilot"
import type { ViewportLayout } from "@/lib/viewportLayout"
import { useClientPathname, useClientSearchString, useViewportLayout } from "@/hooks/useIsDesktop"
import { TopPageMobileDrawer } from "@/app/components/top/TopPageMobileDrawer"
import { SITE_TOP_HREF } from "@/lib/siteNavigation"
import {
  isFabianPlayerPage,
  isKikuchiPlayerPage,
  pathMatchesKikuchiPilot,
  resolveSeasonStatsPilotQueryId,
} from "@/lib/resolveSeasonPilotQueryId"
import { compactPlayerName, rosterNameMatchKey } from "@/lib/playerNameNormalize"
import {
  isFielderRegistrationPosition,
  isPitcherRegistrationPosition,
} from "@/lib/rosterPitcher"
import { MANUAL_YAHOO_TO_NPB } from "@/lib/yahooNpbBatterIdMap.manual"
import { rosterEnglishAliasKeys, rosterEnglishFullFromCsvRow } from "@/lib/rosterEnglishDisplay"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"
import { formatSlashStatDisplay, slashRate3FromCounts } from "@/lib/battingRateFormat"
import {
  enrichCareerPitchingRow,
  enrichCareerPitchingRows,
} from "@/lib/careerPitchingEnrich"
import type {
  PitcherSeasonPocPayload,
  PitcherSeasonPitchingApiResponse,
  PitcherSeasonPitchingPeriodApiResponse,
  PitcherSeasonPitchingPeriodPayload,
} from "@/lib/pitcherSeasonPocTypes"
import type { CatcherAppearancesApiResponse } from "@/app/api/players/[playerId]/catcher-appearances/route"
import type {
  CatcherPitchersApiResponse,
} from "@/app/api/players/[playerId]/catcher-pitchers/route"
import type { CatcherDefenseBasicApiResponse } from "@/app/api/players/[playerId]/catcher-defense-basic/route"
import type { CatcherStartingSummaryApiResponse } from "@/app/api/players/[playerId]/catcher-starting-summary/route"
import type { CatcherPaRoundPitchTypesApiResponse } from "@/app/api/players/[playerId]/catcher-pa-round-pitch-types/route"
import type { PitcherSeasonPitchTypesApiResponse } from "@/app/api/players/[playerId]/season-pitch-types/route"
import PitcherSeasonPitchTypesTable from "@/app/components/PitcherSeasonPitchTypesTable"
import type { PitcherSeasonPitchTypesPayload } from "@/lib/yahooGame/pitcherSeasonPitchTypes"
import {
  EMPTY_TEAM_VS_ROWS,
  pitcherPocBasicRow1,
  pitcherPocBasicRow2,
  pitcherPocBasicRow3,
  pitcherPocDayNightRows,
  pitcherPocHomeAwayRows,
  pitcherPocHandCells,
  pitcherPocCatcherRows,
  pitcherPocInningRow,
  pitcherPocMetricRow1,
  pitcherPocMetricRow2,
  pitcherPocMetricRow3,
  pitcherPocSituationRows,
  pitcherPocTeamVsRows,
  pitcherPocStadiumRows,
  EMPTY_STADIUM_VS_ROWS,
} from "@/lib/pitcherSeasonPocUi"
import { formatEra } from "@/lib/formatStat"
import { CareerHighStatGrid } from "@/app/components/player/CareerHighStatGrid"
import {
  buildCareerHighBattingCards,
  careerHighBattingSeasonYear,
  formatCareerHighBattingHeading,
} from "@/lib/playerCareerHighBatting"
import {
  buildCareerHighPitchingFromRows,
  formatCareerHighPitchingHeading,
} from "@/lib/playerCareerHighPitching"
import { DEFAULT_YAHOO_GAME_ID_HIROSHIMA_CHUNICHI_20260327, resolvePitcherPocYahooGameId } from "@/lib/yahooGame/pitcherPocDefaults"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"
import { unwrapPitcherZoneStatsApiJson } from "@/lib/api/unwrapPlayerDerivedPayload"
import { SectionLoadingSpinner } from "@/components/ui/spinner"
import DerivedPipelineEmptyNotice, {
  DerivedPipelineFielderHint,
} from "@/app/components/DerivedPipelineEmptyNotice"
import CareerBattingTableRankingStyle from "@/app/components/player/CareerBattingTableRankingStyle"
import { usesPitcherCareerPitchingTableFromRosterMatch } from "@/lib/playerCareerPitchingTablePilot"
import {
  appendCareerTotalRow,
  careerAgeAtYear,
  careerYearLabel,
  formatCareerCell,
  formatSalaryManFromRow,
  splitBattingColumns,
  PITCHING_STAT_COLUMNS,
  splitPitchingColumns,
  type CareerDisplayRow,
} from "@/lib/playerCareerMergedDisplay"
import {
  AOYAGI_NPB_ID,
  battingColsLeft,
  battingColsRight,
  careerTd,
  careerTh,
  careerYearTd,
  calcAgeFromJaBirth,
  FIELDER_PILOT_HEADING_SCALE,
  FIELDER_PILOT_SECTION_STRIPE_PX,
  kMinusBbPctOfBf,
  parseBirthDateJa,
  pctOfBf,
  pitchingColsLeft,
  pitchingColsRight,
  playerIdSegmentFromPathname,
  playerRomanNames,
  stripQueryHash,
  teamColors,
  type ProfileMergedPayload,
} from "./playerPageShared"
import { PlayerPagePitcherSeasonBody } from "./PlayerPagePitcherSeasonBody"
import { PlayerPageCareerSection } from "./PlayerPageCareerSection"

const PitchTypePieChart = dynamic(() => import("@/app/components/PitchTypePieChart"), { ssr: false })

`

// Replace renderPitcherSeasonBody block with component usage
let clientBody = slice(246, 4693)
clientBody = clientBody.replace(
  /^function PlayerPageClient/m,
  'export function PlayerPageClient',
)

// Remove old renderPitcherSeasonBody function (lines 1550-3321 relative to file = 1550-246+1 = 1305 to 3076 in clientBody)
// Easier: find and replace the function with component reference
const renderStart = clientBody.indexOf('  const renderPitcherSeasonBody = () => (')
const renderEnd = clientBody.indexOf('  return (\n    <div\n      className="player-page-fonts min-h-screen text-white"')
if (renderStart === -1 || renderEnd === -1) {
  console.error('Could not find renderPitcherSeasonBody boundaries')
  process.exit(1)
}
clientBody =
  clientBody.slice(0, renderStart) +
  '  const renderPitcherSeasonBody = () => (\n    <PlayerPagePitcherSeasonBody\n      tb={tb}\n      sectionStripeColor={sectionStripeColor}\n      pitcherSeasonSubTab={pitcherSeasonSubTab}\n      pitcherSeasonPocApiSettled={pitcherSeasonPocApiSettled}\n      pitcherSeasonPocPayload={pitcherSeasonPocPayload}\n      rosterMainReady={rosterMainReady}\n      pitcherSeasonPitchTypesPayload={pitcherSeasonPitchTypesPayload}\n      pitcherSeasonPitchTypesLoading={pitcherSeasonPitchTypesLoading}\n      gamePitchTypes={gamePitchTypes}\n      zoneStatsPayload={zoneStatsPayload}\n      zoneStatsLoading={zoneStatsLoading}\n      pitcherSeasonPitchingPeriodPayload={pitcherSeasonPitchingPeriodPayload}\n      pitcherPeriodMonthRows={pitcherPeriodMonthRows}\n      pitcherPeriodWeekRows={pitcherPeriodWeekRows}\n      layout={layout}\n      isMobile={isMobile}\n      seasonPilotPlayerId={seasonPilotPlayerId}\n      catcherAppearances={catcherAppearances}\n      catcherPitchers={catcherPitchers}\n      catcherDefenseBasic={catcherDefenseBasic}\n      catcherStartingSummary={catcherStartingSummary}\n      catcherPaRoundPitchTypes={catcherPaRoundPitchTypes}\n      showFielderSeasonPilotUi={showFielderSeasonPilotUi}\n      kikuchiSeasonDetailTab={kikuchiSeasonDetailTab}\n    />\n  )\n\n' +
  clientBody.slice(renderEnd)

// Replace inline career block with component
const careerStart = clientBody.indexOf('        {/* 通算成績 */}')
const careerEnd = clientBody.indexOf('      </main>', careerStart)
if (careerStart === -1 || careerEnd === -1) {
  console.error('Could not find career section boundaries')
  process.exit(1)
}
clientBody =
  clientBody.slice(0, careerStart) +
  `        <PlayerPageCareerSection
          showSeasonCareerTabs={showSeasonCareerTabs}
          statsTab={statsTab}
          pitcherCareerPitchingTightLayout={pitcherCareerPitchingTightLayout}
          pitcherCareerPitchingTablePilot={pitcherCareerPitchingTablePilot}
          showCareerBattingSection={showCareerBattingSection}
          profileMergedSettled={profileMergedSettled}
          profileMerged={profileMerged}
          showCareerPitchingRankingTable={showCareerPitchingRankingTable}
          showLegacyPitchingCareerSection={showLegacyPitchingCareerSection}
          pitcherCareerSubTab={pitcherCareerSubTab}
          fielderCareerSubTab={fielderCareerSubTab}
          careerHighSectionH2Class={careerHighSectionH2Class}
          careerBattingSectionH2Style={careerBattingSectionH2Style}
          careerHighBattingCards={careerHighBattingCards}
          isMobile={isMobile}
          renderPitcherCareerSubTabBar={renderPitcherCareerSubTabBar}
          renderFielderCareerSubTabBar={renderFielderCareerSubTabBar}
          pitcherCareerH2Class={pitcherCareerH2Class}
          careerBattingTotalSectionH2Class={careerBattingTotalSectionH2Class}
          mergedPitchingRowsForDisplay={mergedPitchingRowsForDisplay}
          mergedBirthRaw={mergedBirthRaw}
          careerHighPitching={careerHighPitching}
          fielderCareerH2Class={fielderCareerH2Class}
          useRankingStyleCareerBattingTable={useRankingStyleCareerBattingTable}
          mergedBattingRowsForDisplay={mergedBattingRowsForDisplay}
          careerHighBattingYear={careerHighBattingYear}
          tb={tb}
          sectionStripeColor={sectionStripeColor}
        />
` +
  clientBody.slice(careerEnd)

const clientPath = path.join(dir, 'PlayerPageClient.tsx')
fs.writeFileSync(clientPath, clientHeader + clientBody + '\n', 'utf8')

// Pitcher season body - extract original JSX from lines 1551-3320 (inside the arrow function)
const pitcherSeasonInner = slice(1551, 3320)

const pitcherSeasonPath = path.join(dir, 'PlayerPagePitcherSeasonBody.tsx')
fs.writeFileSync(
  pitcherSeasonPath,
  `"use client"

import type React from "react"
import dynamic from "next/dynamic"
import PitcherSeasonPitchTypesTable from "@/app/components/PitcherSeasonPitchTypesTable"
import DerivedPipelineEmptyNotice from "@/app/components/DerivedPipelineEmptyNotice"
import SeasonStatsPilot from "@/app/components/SeasonStatsPilot"
import PitchDetailsPilot from "@/app/components/PitchDetailsPilot"
import type { ViewportLayout } from "@/lib/viewportLayout"
import type { PitcherSeasonPocPayload, PitcherSeasonPitchingPeriodPayload } from "@/lib/pitcherSeasonPocTypes"
import type { PitcherSeasonPitchTypesPayload } from "@/lib/yahooGame/pitcherSeasonPitchTypes"
import {
  pitcherPocBasicRow1,
  pitcherPocBasicRow2,
  pitcherPocBasicRow3,
  pitcherPocDayNightRows,
  pitcherPocHomeAwayRows,
  pitcherPocHandCells,
  pitcherPocCatcherRows,
  pitcherPocInningRow,
  pitcherPocMetricRow1,
  pitcherPocMetricRow2,
  pitcherPocMetricRow3,
  pitcherPocSituationRows,
  pitcherPocTeamVsRows,
  pitcherPocStadiumRows,
  EMPTY_TEAM_VS_ROWS,
  EMPTY_STADIUM_VS_ROWS,
} from "@/lib/pitcherSeasonPocUi"
import { formatEra } from "@/lib/formatStat"
import { kMinusBbPctOfBf, pctOfBf } from "./playerPageShared"

const PitchTypePieChart = dynamic(() => import("@/app/components/PitchTypePieChart"), { ssr: false })

export type PlayerPagePitcherSeasonBodyProps = {
  tb: string
  sectionStripeColor: string
  pitcherSeasonSubTab: "basic" | "pitch" | "situation" | "period"
  pitcherSeasonPocApiSettled: boolean
  pitcherSeasonPocPayload: PitcherSeasonPocPayload | null
  rosterMainReady: boolean
  pitcherSeasonPitchTypesPayload: PitcherSeasonPitchTypesPayload | null
  pitcherSeasonPitchTypesLoading: boolean
  gamePitchTypes: {
    game_id: string
    pitcher_id: string
    pitches_total: number
    rows: unknown[]
    total_row?: unknown
  } | null
  zoneStatsPayload: unknown
  zoneStatsLoading: boolean
  pitcherSeasonPitchingPeriodPayload: PitcherSeasonPitchingPeriodPayload | null
  pitcherPeriodMonthRows: Array<Record<string, unknown>>
  pitcherPeriodWeekRows: Array<Record<string, unknown>>
  layout: ViewportLayout
  isMobile: boolean
  seasonPilotPlayerId: string
  catcherAppearances: { gamesAsCatcher: number; gameIds: string[] } | null
  catcherPitchers: Array<Record<string, unknown>>
  catcherDefenseBasic: {
    sbAttempts: number
    sb: number
    cs: number
    csPct: number | null
  } | null
  catcherStartingSummary: Record<string, unknown> | null
  catcherPaRoundPitchTypes: Array<{
    key: "1" | "2" | "3" | "4" | "5"
    pitches_total: number
    rows: { pitch_type: string; pitches: number; pct: number }[]
  }>
  showFielderSeasonPilotUi: boolean
  kikuchiSeasonDetailTab: "basic" | "pitch" | "situation" | "period" | "catcher"
}

export function PlayerPagePitcherSeasonBody(props: PlayerPagePitcherSeasonBodyProps) {
  const {
    tb,
    sectionStripeColor,
    pitcherSeasonSubTab,
    pitcherSeasonPocApiSettled,
    pitcherSeasonPocPayload,
    rosterMainReady,
    pitcherSeasonPitchTypesPayload,
    pitcherSeasonPitchTypesLoading,
    gamePitchTypes,
    zoneStatsPayload,
    zoneStatsLoading,
    pitcherSeasonPitchingPeriodPayload,
    pitcherPeriodMonthRows,
    pitcherPeriodWeekRows,
    layout,
    isMobile,
    seasonPilotPlayerId,
    catcherAppearances,
    catcherPitchers,
    catcherDefenseBasic,
    catcherStartingSummary,
    catcherPaRoundPitchTypes,
    showFielderSeasonPilotUi,
    kikuchiSeasonDetailTab,
  } = props

  return (
${pitcherSeasonInner}
  )
}
`,
  'utf8',
)

// Career section inner (skip outer conditional wrapper)
const careerInner = slice(4391, 4681)

const careerPath = path.join(dir, 'PlayerPageCareerSection.tsx')
fs.writeFileSync(
  careerPath,
  `"use client"

import type React from "react"
import { CareerHighStatGrid } from "@/app/components/player/CareerHighStatGrid"
import CareerBattingTableRankingStyle from "@/app/components/player/CareerBattingTableRankingStyle"
import { SectionLoadingSpinner } from "@/components/ui/spinner"
import { formatCareerHighBattingHeading } from "@/lib/playerCareerHighBatting"
import { formatCareerHighPitchingHeading } from "@/lib/playerCareerHighPitching"
import { PITCHING_STAT_COLUMNS } from "@/lib/playerCareerMergedDisplay"
import {
  battingColsLeft,
  battingColsRight,
  careerAgeAtYear,
  careerTd,
  careerTh,
  careerYearLabel,
  formatCareerCell,
  formatSalaryManFromRow,
  pitchingColsLeft,
  pitchingColsRight,
  type ProfileMergedPayload,
} from "./playerPageShared"
import type { CareerDisplayRow } from "@/lib/playerCareerMergedDisplay"

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
}

export function PlayerPageCareerSection(props: PlayerPageCareerSectionProps) {
  const {
    showSeasonCareerTabs,
    statsTab,
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
  } = props

  if (showSeasonCareerTabs && statsTab !== "career") return null

  return (
${careerInner}
  )
}
`,
  'utf8',
)

// Thin page.tsx
const pageContent = `"use client"

import { useViewportLayout } from "@/hooks/useIsDesktop"
import { PlayerPageClient } from "./PlayerPageClient"

export default function PlayerPage() {
  const { isDesktop, forceMobile } = useViewportLayout()

  return (
    <PlayerPageClient
      layout={isDesktop ? "desktop" : "mobile"}
      forceMobile={forceMobile}
    />
  )
}
`

fs.writeFileSync(path.join(dir, 'page.tsx'), pageContent, 'utf8')

console.log('Split complete:')
console.log('  playerPageShared.ts')
console.log('  PlayerPageClient.tsx')
console.log('  PlayerPagePitcherSeasonBody.tsx')
console.log('  PlayerPageCareerSection.tsx')
console.log('  page.tsx (thin)')
