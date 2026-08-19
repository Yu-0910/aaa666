"use client"
import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Trophy } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { teamColors, TOP_PAGE_BEBAS_NUMERIC_CLASS } from "@/app/components/top/topPageConstants"
import { type TopPageLayoutMode } from "@/app/components/top/TopPagePanels"
import { fetchTopProbablesJson } from "@/lib/probables/fetchTopProbablesJson"
import { formatPitcherSeasonStatsLine } from "@/lib/probables/formatPitcherSeasonStatsLine"
import { enrichProbablesSnapshotFromApi } from "@/lib/probables/fetchEnrichedProbablesSnapshot"
import { withRakutenHanshinProbablesSample } from "@/lib/probables/rakutenHanshinProbablesSample"
import { CURRENT_ROSTER_PLAYER_ENTRIES } from "@/lib/currentRosterPlayerEntries"
import type {
  TopProbablesCard,
  TopProbablesGame,
  TopProbablesOpponentBatter,
  TopProbablesPitcherSlot,
  TopProbablesSnapshot,
} from "@/lib/probables/types"
import {
  ProbablesPaRoundPitchDataOverlay,
  ProbablesPitchDataOverlay,
} from "@/app/components/top/ProbablesPitchDataOverlay"
import { formatSlashStatDisplay } from "@/lib/battingRateFormat"
import { PLAYER_MATCHUP_NAME_COLUMN_WIDTH_PX } from "@/lib/playerMatchupSeasonTab"
import { matchupOpponentDisplayNameJa, rosterNameMatchKey } from "@/lib/playerNameNormalize"
import { playerPageHref } from "@/lib/playerPageHref"
import { formatRomanNameForRanking } from "@/lib/ranking/formatRomanNameForRanking"
import { resolveRomanNameFromMap } from "@/lib/ranking/romanNameLookup"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"
import { leagueFromTeamShort, teamShortFromCode } from "@/lib/standings/teamCodes"

type TopPageProbablesTabProps = {
  year: number
  layout: TopPageLayoutMode
}

type ProbablesLeague = "CL" | "PL"

const ROW_BG_EVEN = "#292929"
const ROW_BG_ODD = "#1f1f1f"
const TEAM_BAR_WIDTH = 4
const RAKUTEN_LOTTE_PLAYER_BLOCK_HEIGHT = 68
const RAKUTEN_LOTTE_PLAYER_BLOCK_HEIGHT_MOBILE = 60
/** 楽天 vs ロッテ: 選手名・今季成績をまとめてわずかに下げる */
const RAKUTEN_LOTTE_NAME_STATS_NUDGE_CLASS = "pt-1"

function rakutenLottePitcherNameTextClass(isMobile: boolean): string {
  return isMobile
    ? "text-[20.4px] font-bold text-white"
    : "text-[22.95px] font-bold text-white"
}

function rakutenLottePlayerBlockHeight(isMobile: boolean): number {
  return isMobile ? RAKUTEN_LOTTE_PLAYER_BLOCK_HEIGHT_MOBILE : RAKUTEN_LOTTE_PLAYER_BLOCK_HEIGHT
}

function rakutenLotteRomanTextClass(isMobile: boolean): string {
  return isMobile ? "text-[9px] text-gray-400 latin" : "text-[10px] text-gray-400 latin"
}

/** 楽天 vs ロッテ・今季成績（選手名とは別サイズ。グレー背景・黒文字） */
const RAKUTEN_LOTTE_SEASON_STATS_TEXT_MOBILE = "text-[8px]"
const RAKUTEN_LOTTE_SEASON_STATS_TEXT_DESKTOP = "text-[9px]"
const RAKUTEN_LOTTE_SEASON_STATS_OFFSET_CLASS = "mt-1.5"

function rakutenLotteSeasonStatsTextClass(isMobile: boolean): string {
  const size = isMobile ? RAKUTEN_LOTTE_SEASON_STATS_TEXT_MOBILE : RAKUTEN_LOTTE_SEASON_STATS_TEXT_DESKTOP
  return `${size} ${RAKUTEN_LOTTE_SEASON_STATS_OFFSET_CLASS} font-noto font-bold tabular-nums text-black bg-[#a8a8a8] px-1 py-0.5 inline-block max-w-full truncate whitespace-nowrap`
}

const OPPONENT_ROW_LEADING = "leading-[1.15]"
const OPPONENT_STAT_TEXT_MOBILE = "text-[9.6px]"
const OPPONENT_STAT_TEXT_DESKTOP = "text-[11.2px]"
const OPPONENT_NAME_TEXT_MOBILE_PX = 10
const OPPONENT_NAME_TEXT_DESKTOP_PX = 12
const OPPONENT_OVERLAY_CONTENT_BASE_PX = 10
/** 楽天 vs ロッテ「苦」popover 内の文字倍率（基準 1.0 の8割） */
const RAKUTEN_LOTTE_KU_CONTENT_TEXT_SCALE = 0.8

const PROBABLES_OPPONENT_TABLE_COLUMNS = [
  { key: "ops", label: "OPS" },
  { key: "avg", label: "打率" },
  { key: "hr", label: "本塁打" },
] as const

const OPPONENT_BATTER_TABLE_DATA_ROW: CSSProperties = {
  backgroundColor: "rgba(255,255,255,0.03)",
  color: "#f5f5f5",
}

const OPPONENT_BATTER_TABLE_STAT_COL_WIDTH_PX = 48

function scaledFontSizePx(px: number, scale = 1): number {
  return Math.round(px * scale * 10) / 10
}

function scaledFontSizeStyle(px: number, scale = 1): CSSProperties | undefined {
  if (scale === 1) return undefined
  return { fontSize: `${scaledFontSizePx(px, scale)}px` }
}

function scaledTextClass(px: number, scale = 1): string {
  if (scale !== 1) return ""
  if (px === 9.6) return OPPONENT_STAT_TEXT_MOBILE
  if (px === 11.2) return OPPONENT_STAT_TEXT_DESKTOP
  return `text-[${px}px]`
}

function opponentStatTextClass(isMobile: boolean, textScale = 1): string {
  const basePx = isMobile ? 9.6 : 11.2
  return scaledTextClass(basePx, textScale)
}

function opponentStatNumericClass(isMobile: boolean, textScale = 1): string {
  return `shrink-0 whitespace-nowrap text-left text-white/80 bebas tabular-nums ${opponentStatTextClass(isMobile, textScale)}`.trim()
}

function opponentStatFontSizeStyle(isMobile: boolean, textScale = 1): CSSProperties | undefined {
  const basePx = isMobile ? 9.6 : 11.2
  return scaledFontSizeStyle(basePx, textScale)
}

function formatOpponentStatLine(b: TopProbablesOpponentBatter): string {
  const ops = b.ops != null ? formatSlashStatDisplay(b.ops) : "—"
  const avg = b.avg != null ? formatSlashStatDisplay(b.avg) : "—"
  const hr = typeof b.hr === "number" ? `${b.hr}HR` : "—"
  return `${ops}／${avg}／${hr}`
}


function rowBackgroundColor(idx: number): string {
  return idx % 2 === 0 ? ROW_BG_EVEN : ROW_BG_ODD
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const

function normalizeNpbId(id: string | null | undefined): string {
  return String(id ?? "").replace(/\D/g, "").replace(/^0+/, "")
}

function pitcherAliasKeys(nameJa: string): string[] {
  const normalized = String(nameJa ?? "").trim()
  const compact = rosterNameMatchKey(normalized)
  const withoutInitial = compact
    .replace(/^[\uFF21-\uFF3A\uFF41-\uFF5A][．.]/u, "")
    .replace(/^[A-Za-z][.．]/u, "")
  const surname = normalized.match(/^[^\s\u3000]+/)?.[0] ?? compact
  const spaced = normalized.match(/^([^\s\u3000]+)[\s\u3000]+([^\s\u3000])/)
  const familyGivenInitial = spaced ? rosterNameMatchKey(`${spaced[1]}${spaced[2]}`) : ""

  return [...new Set([compact, withoutInitial, rosterNameMatchKey(surname), familyGivenInitial].filter(Boolean))]
}

function resolveProbablesPitcherRosterEntry(
  nameJa: string,
  teamCode: string,
  ids: Array<string | null | undefined>,
) {
  const normalizedIds = new Set(ids.map(normalizeNpbId).filter(Boolean))
  const teamPitchers = CURRENT_ROSTER_PLAYER_ENTRIES.filter(
    (entry) => entry.teamCode === teamCode && entry.position.includes("投"),
  )
  const byId = teamPitchers.find((entry) => normalizedIds.has(normalizeNpbId(entry.npbPlayerId)))
  if (byId) return byId

  const inputKey = rosterNameMatchKey(nameJa)
  return (
    teamPitchers.find((entry) => rosterNameMatchKey(entry.nameJa) === inputKey) ??
    teamPitchers.find((entry) => pitcherAliasKeys(entry.nameJa).includes(inputKey)) ??
    null
  )
}

function weekdayJaOneChar(dateJst: string): string {
  const m = dateJst.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ""
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  return WEEKDAY_JA[d.getUTCDay()] ?? ""
}

function formatWeekdayLabel(dateJst: string): string {
  return weekdayJaOneChar(dateJst) || dateJst
}

function formatDateLabel(dateJst: string): string {
  const m = dateJst.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return dateJst
  const wd = weekdayJaOneChar(dateJst)
  return `${parseInt(m[2]!, 10)}/${parseInt(m[3]!, 10)}${wd ? ` ${wd}` : ""}`
}

function firstDisplayedGameDate(card: TopProbablesCard): string {
  return card.games.map((g) => g.dateJst).sort()[0] ?? card.seriesStart
}

function leagueFromTeamCode(code: string): ProbablesLeague {
  return leagueFromTeamShort(teamShortFromCode(code))
}

function leagueForProbablesCard(card: TopProbablesCard): ProbablesLeague {
  const teamLeagues = [...new Set(card.teamCodes.map(leagueFromTeamCode))]
  if (teamLeagues.length === 1) return teamLeagues[0]!
  const firstGame = [...card.games].sort((a, b) => a.dateJst.localeCompare(b.dateJst))[0]
  return firstGame ? leagueFromTeamCode(firstGame.homeTeamCode) : teamLeagues[0] ?? "CL"
}

const WEEKDAY_TEXT_CLASS = "text-[13px] font-semibold text-white"

function opponentBatterNameTextClass(isMobile: boolean, textScale = 1): string {
  const sizeClass = scaledTextClass(
    isMobile ? OPPONENT_NAME_TEXT_MOBILE_PX : OPPONENT_NAME_TEXT_DESKTOP_PX,
    textScale,
  )
  return `${sizeClass} font-bold text-white`.trim()
}

function opponentBatterNameFontSizeStyle(isMobile: boolean, textScale = 1): CSSProperties | undefined {
  const basePx = isMobile ? OPPONENT_NAME_TEXT_MOBILE_PX : OPPONENT_NAME_TEXT_DESKTOP_PX
  return scaledFontSizeStyle(basePx, textScale)
}

type OpponentOverlayVariant = "tooltip" | "popover" | "hover-card" | "dialog"

/** 楽天 vs ロッテ「苦」: タップで開き、外側タップまで表示し続ける popover */
const RAKUTEN_LOTTE_KU_OVERLAY_VARIANT: OpponentOverlayVariant = "popover"

function opponentOverlayTriggerClass(opponentStripeSide: "left" | "right" | undefined): string {
  return `mt-1 border border-[#555] px-2 py-0.5 text-[10px] text-gray-400 hover:border-gray-400 hover:text-white transition-colors ${
    opponentStripeSide === "right" ? "self-end" : "self-start"
  }`
}

function opponentOverlayContentClass(textScale = 1, contentLayout: "rows" | "table" = "rows"): string {
  if (contentLayout === "table") {
    return "w-auto max-w-none rounded-none border-0 bg-black p-0 shadow-md overflow-hidden"
  }
  const sizeClass = scaledTextClass(OPPONENT_OVERLAY_CONTENT_BASE_PX, textScale)
  return `w-auto max-w-none border border-[#555] bg-black p-2 ${sizeClass} text-white shadow-md text-left text-wrap`.trim()
}

function opponentOverlayContentStyle(textScale = 1): CSSProperties | undefined {
  return scaledFontSizeStyle(OPPONENT_OVERLAY_CONTENT_BASE_PX, textScale)
}

/** 左列は右へ、右列は左へポップオーバーをわずかに寄せる（px） */
const OPPONENT_OVERLAY_HORIZONTAL_NUDGE_PX = 16

function opponentOverlayAlignOffset(opponentStripeSide: "left" | "right" | undefined): number {
  if (opponentStripeSide === "left") return OPPONENT_OVERLAY_HORIZONTAL_NUDGE_PX
  if (opponentStripeSide === "right") return -OPPONENT_OVERLAY_HORIZONTAL_NUDGE_PX
  return 0
}

function rakutenLotteKuTooltipTriggerClass(): string {
  return "flex h-[14px] min-w-[14px] items-center justify-center border border-gray-500 px-0.5 text-[9px] font-semibold text-gray-400 hover:border-gray-300 hover:text-gray-200 transition-colors leading-none shrink-0"
}

function rakutenLotteRomanRowHeight(isMobile: boolean): number {
  return isMobile ? 14 : 16
}

function rakutenLotteSideButtonPositionClass(opponentStripeSide: "left" | "right"): string {
  return opponentStripeSide === "left" ? "left-2" : "right-2"
}

function RakutenLotteSideTooltipButtons({
  opponentStripeSide,
  batters,
  pitcherPublicId,
  season,
  isMobile,
}: {
  opponentStripeSide: "left" | "right"
  batters: TopProbablesOpponentBatter[]
  pitcherPublicId: string | null
  season: number
  isMobile: boolean
}) {
  const sideClass = rakutenLotteSideButtonPositionClass(opponentStripeSide)
  return (
    <>
      <div className={`absolute top-0 z-10 ${sideClass}`}>
        <ProbablesPitchDataOverlay
          pitcherPublicId={pitcherPublicId}
          season={season}
          opponentStripeSide={opponentStripeSide}
        />
      </div>
      <div className={`absolute top-1/2 z-10 -translate-y-1/2 ${sideClass}`}>
        <ProbablesPaRoundPitchDataOverlay
          pitcherPublicId={pitcherPublicId}
          season={season}
          opponentStripeSide={opponentStripeSide}
        />
      </div>
      <div className={`absolute bottom-0 z-10 ${sideClass}`}>
        <RakutenLotteKuOverlay
          batters={batters}
          isMobile={isMobile}
          opponentStripeSide={opponentStripeSide}
        />
      </div>
    </>
  )
}

/** 球団帯(4px)+ツールチップボタン分。左右列でローマ名の中心を揃える */
const RAKUTEN_LOTTE_ROMAN_SIDE_INSET_CLASS = "px-[22px]"
/** ローマ名・選手名・今季成績を VS 側へ同量だけ寄せる（px） */
const RAKUTEN_LOTTE_VS_CENTER_NUDGE_PX = 10

function rakutenLotteVsCenterNudgeStyle(opponentStripeSide: "left" | "right" | undefined): CSSProperties | undefined {
  if (opponentStripeSide === "left") {
    return { transform: `translateX(${RAKUTEN_LOTTE_VS_CENTER_NUDGE_PX}px)` }
  }
  if (opponentStripeSide === "right") {
    return { transform: `translateX(-${RAKUTEN_LOTTE_VS_CENTER_NUDGE_PX}px)` }
  }
  return undefined
}

function RakutenLotteRomanRow({
  romanDisplay,
  hasRomanName,
  isMobile,
}: {
  romanDisplay: string
  hasRomanName: boolean
  isMobile: boolean
}) {
  const rakutenLotteRomanClass = rakutenLotteRomanTextClass(isMobile)
  const rowHeight = rakutenLotteRomanRowHeight(isMobile)
  const romanNode = hasRomanName ? (
    <span className={`${rakutenLotteRomanClass} truncate line-clamp-1 block w-full text-center`}>
      {romanDisplay}
    </span>
  ) : (
    <span className={`${rakutenLotteRomanClass} invisible`} aria-hidden>
      —
    </span>
  )

  return (
    <div className="relative w-full min-w-0" style={{ height: rowHeight }}>
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden ${RAKUTEN_LOTTE_ROMAN_SIDE_INSET_CLASS}`}
      >
        {romanNode}
      </div>
    </div>
  )
}

function opponentBatterTableCellValue(
  batter: TopProbablesOpponentBatter,
  key: (typeof PROBABLES_OPPONENT_TABLE_COLUMNS)[number]["key"],
): string {
  const na = "—"
  switch (key) {
    case "ops":
      return batter.ops != null ? formatSlashStatDisplay(batter.ops) : na
    case "avg":
      return batter.avg != null ? formatSlashStatDisplay(batter.avg) : na
    case "hr":
      return String(batter.hr)
    default:
      return na
  }
}

function OpponentBatterTable({
  batters,
  textScale = 1,
}: {
  batters: TopProbablesOpponentBatter[]
  textScale?: number
}) {
  const tableBasePx = scaledFontSizePx(10, textScale)
  const nameColWidthPx = scaledFontSizePx(PLAYER_MATCHUP_NAME_COLUMN_WIDTH_PX, textScale)
  const statColWidthPx = scaledFontSizePx(OPPONENT_BATTER_TABLE_STAT_COL_WIDTH_PX, textScale)
  const headerClass =
    "px-1 py-1 text-center font-bold latin tabular-nums border-l border-b border-gray-500 first:border-l-0 whitespace-nowrap"
  const statNumericClass = TOP_PAGE_BEBAS_NUMERIC_CLASS

  return (
    <table
      className="max-w-none rounded-none"
      style={{
        fontVariantNumeric: "tabular-nums",
        borderCollapse: "separate",
        borderSpacing: 0,
        border: "1px solid #555",
        tableLayout: "fixed",
        fontSize: `${tableBasePx}px`,
      }}
    >
      <colgroup>
        <col style={{ width: `${nameColWidthPx}px` }} />
        {PROBABLES_OPPONENT_TABLE_COLUMNS.map((col) => (
          <col key={col.key} style={{ width: `${statColWidthPx}px` }} />
        ))}
      </colgroup>
      <thead>
        <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
          <th className={`${headerClass} sticky left-0 z-20 bg-[#FFFF44] shadow-[2px_0_4px_rgba(0,0,0,0.3)]`}>
            打者
          </th>
          {PROBABLES_OPPONENT_TABLE_COLUMNS.map((col) => (
            <th key={col.key} className={headerClass}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {batters.map((batter) => {
          const displayName = matchupOpponentDisplayNameJa(batter.opponentName)
          const opponentLinkId = batter.opponentNpbId ?? batter.opponentPublicId ?? null
          return (
            <tr key={`${batter.opponentName}-${batter.ab}`} style={OPPONENT_BATTER_TABLE_DATA_ROW}>
              <td
                className="px-1 py-1 text-left latin font-black tabular-nums border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                style={{ backgroundColor: "#1a1a1a", fontSize: "1.3em" }}
              >
                {opponentLinkId ? (
                  <a
                    href={playerPageHref({
                      playerId: batter.opponentPublicId ?? undefined,
                      npbPlayerId: opponentLinkId,
                      name: batter.opponentName,
                    })}
                    className="hover:text-[#FFFF44] transition-colors"
                  >
                    {displayName}
                  </a>
                ) : (
                  displayName
                )}
              </td>
              {PROBABLES_OPPONENT_TABLE_COLUMNS.map((col) => (
                <td
                  key={col.key}
                  className={`px-0 py-1 text-center border-l border-b border-gray-500 ${statNumericClass}`}
                  style={{ fontSize: "1.6em" }}
                >
                  {opponentBatterTableCellValue(batter, col.key)}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function OpponentBatterOverlay({
  variant,
  batters,
  isMobile,
  opponentStripeSide,
  triggerNode,
  contentTextScale = 1,
  contentLayout = "rows",
}: {
  variant: OpponentOverlayVariant
  batters: TopProbablesOpponentBatter[]
  isMobile: boolean
  opponentStripeSide?: "left" | "right"
  triggerNode?: ReactNode
  contentTextScale?: number
  contentLayout?: "rows" | "table"
}) {
  const align = opponentStripeSide === "right" ? "end" : "start"
  const alignOffset = opponentOverlayAlignOffset(opponentStripeSide)
  const triggerClass = opponentOverlayTriggerClass(opponentStripeSide)
  const contentClass = opponentOverlayContentClass(contentTextScale, contentLayout)
  const contentStyle = contentLayout === "table" ? undefined : opponentOverlayContentStyle(contentTextScale)
  const rows =
    contentLayout === "table" ? (
      <OpponentBatterTable batters={batters} textScale={contentTextScale} />
    ) : (
      <OpponentBatterRows batters={batters} isMobile={isMobile} textScale={contentTextScale} />
    )

  const renderTrigger = () =>
    triggerNode ?? (
      <button type="button" className={triggerClass}>
        苦手な打者
      </button>
    )

  switch (variant) {
    case "tooltip":
      return (
        <Tooltip>
          <TooltipTrigger asChild>{renderTrigger()}</TooltipTrigger>
          <TooltipContent
            side="top"
            align={align}
            alignOffset={alignOffset}
            sideOffset={6}
            className={`${contentClass} [&>span]:hidden`}
            style={contentStyle}
          >
            {rows}
          </TooltipContent>
        </Tooltip>
      )
    case "popover":
      return (
        <Popover>
          <PopoverTrigger asChild>{renderTrigger()}</PopoverTrigger>
          <PopoverContent
            side="top"
            align={align}
            alignOffset={alignOffset}
            className={contentClass}
            style={contentStyle}
          >
            {rows}
          </PopoverContent>
        </Popover>
      )
    case "hover-card":
      return (
        <HoverCard openDelay={200} closeDelay={100}>
          <HoverCardTrigger asChild>{renderTrigger()}</HoverCardTrigger>
          <HoverCardContent
            side="top"
            align={align}
            alignOffset={alignOffset}
            className={contentClass}
            style={contentStyle}
          >
            {rows}
          </HoverCardContent>
        </HoverCard>
      )
    case "dialog":
      return (
        <Dialog>
          <DialogTrigger asChild>{renderTrigger()}</DialogTrigger>
          <DialogContent className="border border-[#555] bg-black text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm text-white">苦手な打者</DialogTitle>
            </DialogHeader>
            {rows}
          </DialogContent>
        </Dialog>
      )
  }
}

function RakutenLotteKuOverlay({
  batters,
  isMobile,
  opponentStripeSide,
}: {
  batters: TopProbablesOpponentBatter[]
  isMobile: boolean
  opponentStripeSide: "left" | "right"
}) {
  return (
    <OpponentBatterOverlay
      variant={RAKUTEN_LOTTE_KU_OVERLAY_VARIANT}
      batters={batters}
      isMobile={isMobile}
      opponentStripeSide={opponentStripeSide}
      contentTextScale={RAKUTEN_LOTTE_KU_CONTENT_TEXT_SCALE}
      contentLayout="table"
      triggerNode={
        <button type="button" className={rakutenLotteKuTooltipTriggerClass()} aria-label="苦手な打者">
          苦
        </button>
      }
    />
  )
}

function OpponentBatterRows({
  batters,
  isMobile,
  textScale = 1,
}: {
  batters: TopProbablesOpponentBatter[]
  isMobile: boolean
  textScale?: number
}) {
  const opponentBatterNameClass = opponentBatterNameTextClass(isMobile, textScale)
  const opponentBatterNameStyle = opponentBatterNameFontSizeStyle(isMobile, textScale)
  const opponentStatStyle = opponentStatFontSizeStyle(isMobile, textScale)

  return (
    <div className={`flex flex-col gap-y-0 ${OPPONENT_ROW_LEADING}`}>
      {batters.map((b, index) => {
        const displayName = matchupOpponentDisplayNameJa(b.opponentName)
        const statLine = formatOpponentStatLine(b)
        const rankLabel = `${index + 1}.\u3000`
        const opponentLinkId = b.opponentNpbId ?? b.opponentPublicId ?? null
        const nameContent = opponentLinkId ? (
          <a
            href={playerPageHref({
              playerId: b.opponentPublicId ?? undefined,
              npbPlayerId: opponentLinkId,
              name: b.opponentName,
            })}
            className={`min-w-0 truncate hover:text-[#ffff44] transition-colors ${opponentBatterNameClass}`}
            style={opponentBatterNameStyle}
          >
            {displayName}
          </a>
        ) : (
          <span className={`min-w-0 truncate ${opponentBatterNameClass}`} style={opponentBatterNameStyle}>
            {displayName}
          </span>
        )
        return (
          <div
            key={`${b.opponentName}-${b.ab}`}
            className={`flex min-w-0 items-baseline gap-x-1 ${OPPONENT_ROW_LEADING}`}
          >
            <div className="flex min-w-0 flex-1 items-baseline">
              <span className={`shrink-0 ${opponentBatterNameClass}`} style={opponentBatterNameStyle}>
                {rankLabel}
              </span>
              {nameContent}
            </div>
            <span
              className={opponentStatNumericClass(isMobile, textScale)}
              style={opponentStatStyle}
            >
              {statLine}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function columnStripeOffsetClass(opponentStripeSide: "left" | "right" | undefined): string {
  if (opponentStripeSide === "left") return "left-0"
  if (opponentStripeSide === "right") return "right-0"
  return ""
}

async function fetchMergedRomanNameMap(season: number): Promise<Record<string, string>> {
  const baseUrl = window.location.origin
  const leagues = ["CL", "PL"] as const
  const maps = await Promise.all(
    leagues.map(async (league) => {
      try {
        const res = await fetch(`${baseUrl}/api/roman-names/${season}/${league}`, { cache: "no-store" })
        if (!res.ok) return {}
        return (await res.json()) as Record<string, string>
      } catch {
        return {}
      }
    }),
  )
  return Object.assign({}, ...maps)
}

function PitcherBlock({
  slot,
  teamCode,
  isMobile,
  romanMap = {},
  opponentStripeSide,
  season,
}: {
  slot: TopProbablesPitcherSlot | null
  teamCode: string
  isMobile: boolean
  romanMap?: Record<string, string>
  opponentStripeSide?: "left" | "right"
  season: number
}) {
  const stripeColor = rankingTeamStripeColor(teamShortFromCode(teamCode))
  const nameTextClass = rakutenLottePitcherNameTextClass(isMobile)
  const columnAlign = opponentStripeSide === "right" ? "items-end" : "items-start"
  const blockHeight = rakutenLottePlayerBlockHeight(isMobile)

  const nameStripeRow = (nameNode: ReactNode) => (
    <div className="flex w-full min-w-0 flex-col items-center justify-center text-center leading-[1.05]">
      {nameNode}
    </div>
  )

  const teamStripeOnNameBlock = () =>
    opponentStripeSide != null ? (
      <div
        className={`absolute top-0 bottom-0 w-1 ${columnStripeOffsetClass(opponentStripeSide)}`}
        style={{ backgroundColor: stripeColor }}
        aria-hidden
      />
    ) : null

  if (!slot) {
    const undecided = <span className="text-gray-500 text-xs">未定</span>
    return (
      <div className={`flex w-full min-w-0 flex-col ${columnAlign}`}>
        <div className="relative w-full" style={{ height: blockHeight }}>
          {teamStripeOnNameBlock()}
          {opponentStripeSide != null ? (
            <RakutenLotteSideTooltipButtons
              opponentStripeSide={opponentStripeSide}
              batters={[]}
              pitcherPublicId={null}
              season={season}
              isMobile={isMobile}
            />
          ) : null}
          <div className="w-full" style={rakutenLotteVsCenterNudgeStyle(opponentStripeSide)}>
            {nameStripeRow(undecided)}
          </div>
        </div>
      </div>
    )
  }

  const nameRaw = (slot.pitcherNameJa ?? "未定").trim()
  const rosterPitcher = resolveProbablesPitcherRosterEntry(nameRaw, teamCode, [
    slot.pitcherPublicId,
    slot.pitcherNpbId,
  ])
  const nameForDisplay = rosterPitcher?.nameJa ?? nameRaw
  const name = matchupOpponentDisplayNameJa(nameForDisplay).replace(/[\s\u3000]+/g, "")
  const teamShort = teamShortFromCode(teamCode)
  const resolvedPitcherNpbId = rosterPitcher?.npbPlayerId ?? slot.pitcherNpbId ?? null
  const resolvedPitcherPublicId = slot.pitcherPublicId ?? slot.pitcherNpbId ?? rosterPitcher?.npbPlayerId ?? null
  const romanRaw =
    (resolvedPitcherNpbId ? romanMap[`npb:${normalizeNpbId(resolvedPitcherNpbId)}`] : undefined) ??
    (resolvedPitcherPublicId ? romanMap[`npb:${normalizeNpbId(resolvedPitcherPublicId)}`] : undefined) ??
    resolveRomanNameFromMap(nameRaw, teamShort, romanMap) ??
    resolveRomanNameFromMap(nameForDisplay, teamShort, romanMap) ??
    resolveRomanNameFromMap(name, teamShort, romanMap) ??
    ""
  const romanDisplay = romanRaw ? formatRomanNameForRanking(romanRaw, { nameJa: name }) : ""
  const hasRomanName = romanDisplay.length > 0
  const pitcherLinkId = resolvedPitcherPublicId ?? resolvedPitcherNpbId ?? undefined
  const pitcherHref =
    pitcherLinkId || romanRaw || name
      ? playerPageHref({
          npbPlayerId: pitcherLinkId ?? undefined,
          playerId: pitcherLinkId ?? undefined,
          name,
          romanName: romanRaw || undefined,
        })
      : null

  const nameEl =
    pitcherHref != null ? (
      <a
        href={pitcherHref}
        className="block truncate text-center"
      >
        <span className={`${nameTextClass} hover:text-white transition-colors truncate block text-center`}>
          {name}
        </span>
      </a>
    ) : (
      <span className={`${nameTextClass} truncate block text-center`}>{name}</span>
    )

  const seasonStatsLine = formatPitcherSeasonStatsLine(slot)
  const nameWithStats = (
    <div
      className={`flex w-full min-w-0 flex-col items-center text-center leading-[1.05] ${RAKUTEN_LOTTE_NAME_STATS_NUDGE_CLASS}`}
    >
      {nameEl}
      {seasonStatsLine ? (
        <span className={`${rakutenLotteSeasonStatsTextClass(isMobile)} line-clamp-1 text-center`}>
          {seasonStatsLine}
        </span>
      ) : null}
    </div>
  )

  return (
    <div className={`flex w-full min-w-0 flex-col ${columnAlign}`}>
      <div className="relative w-full" style={{ height: blockHeight }}>
        {teamStripeOnNameBlock()}
        {opponentStripeSide != null ? (
          <RakutenLotteSideTooltipButtons
            opponentStripeSide={opponentStripeSide}
            batters={slot.topOpponentBatters ?? []}
            pitcherPublicId={resolvedPitcherPublicId}
            season={season}
            isMobile={isMobile}
          />
        ) : null}
        <div className="w-full" style={rakutenLotteVsCenterNudgeStyle(opponentStripeSide)}>
          <RakutenLotteRomanRow
            romanDisplay={romanDisplay}
            hasRomanName={hasRomanName}
            isMobile={isMobile}
          />
          {nameStripeRow(nameWithStats)}
        </div>
      </div>
    </div>
  )
}

function TeamPitcherColumn({
  teamCode,
  slot,
  isMobile,
  romanMap = {},
  opponentStripeSide,
  season,
}: {
  teamCode: string
  slot: TopProbablesPitcherSlot | null
  isMobile: boolean
  romanMap?: Record<string, string>
  opponentStripeSide?: "left" | "right"
  season: number
}) {
  return (
    <div className="min-w-0">
      <PitcherBlock
        slot={slot}
        teamCode={teamCode}
        isMobile={isMobile}
        romanMap={romanMap}
        opponentStripeSide={opponentStripeSide}
        season={season}
      />
    </div>
  )
}

function GameRow({
  game,
  isMobile,
  idx,
  romanMap = {},
  season,
}: {
  game: TopProbablesGame
  isMobile: boolean
  idx: number
  romanMap?: Record<string, string>
  season: number
}) {
  const rowBg = rowBackgroundColor(idx)
  const rowHoverClass = "hover:bg-[#2a2a2a]"
  const vsClass = `text-[#F7FE1F] shrink-0 ${
    isMobile ? "text-xs font-semibold px-0.5" : "text-sm font-semibold px-1"
  }`

  const pitcherArea = (
    <div className="flex w-full max-w-full items-center gap-2">
      <div className="min-w-0 flex-1">
        <TeamPitcherColumn
          teamCode={game.awayTeamCode}
          slot={game.awayProbable}
          isMobile={isMobile}
          romanMap={romanMap}
          opponentStripeSide="left"
          season={season}
        />
      </div>
      <div className="flex shrink-0 items-center justify-center">
        <span className={vsClass}>VS</span>
      </div>
      <div className="min-w-0 flex-1">
        <TeamPitcherColumn
          teamCode={game.homeTeamCode}
          slot={game.homeProbable}
          isMobile={isMobile}
          romanMap={romanMap}
          opponentStripeSide="right"
          season={season}
        />
      </div>
    </div>
  )

  return (
    <div
      className={`flex items-stretch border-b border-[#333] py-1.5 last:border-b-0 transition-colors ${rowHoverClass} ${
        isMobile ? "pl-1 pr-1.5" : "pl-1.5 pr-2"
      }`}
      style={{ backgroundColor: rowBg }}
    >
      <div className="flex shrink-0 items-center justify-center self-stretch border-r border-[#555] pr-1.5 min-w-[1.1rem]">
        <span className={WEEKDAY_TEXT_CLASS}>{formatWeekdayLabel(game.dateJst)}</span>
      </div>
      <div className="min-w-0 flex-1 pl-1.5">{pitcherArea}</div>
    </div>
  )
}

function ProbablesCard({
  card,
  isMobile,
  romanMap = {},
  season,
}: {
  card: TopProbablesCard
  isMobile: boolean
  romanMap?: Record<string, string>
  season: number
}) {
  const displayCard = withRakutenHanshinProbablesSample(card)
  const [a, b] = displayCard.teamNames
  const colorA = teamColors[displayCard.teamCodes[0]] ?? "#666"
  const colorB = teamColors[displayCard.teamCodes[1]] ?? "#666"

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex shrink-0">
          <div style={{ width: TEAM_BAR_WIDTH, height: 32, backgroundColor: colorA }} />
          <div style={{ width: TEAM_BAR_WIDTH, height: 32, backgroundColor: colorB }} />
        </div>
        <div>
          <div className="text-sm font-medium">
            {a} vs {b}
          </div>
          <div className="text-[10px] text-gray-400 latin tabular-nums">
            {formatDateLabel(displayCard.seriesStart)} 〜 {formatDateLabel(displayCard.seriesEnd)}
          </div>
        </div>
      </div>

      <div className="border border-[#555] bg-black overflow-hidden">
        {displayCard.games.map((g, idx) => (
          <GameRow
            key={`${g.dateJst}-${g.gameId ?? "tbd"}`}
            game={g}
            isMobile={isMobile}
            idx={idx}
            romanMap={romanMap}
            season={season}
          />
        ))}
      </div>
    </section>
  )
}

function ProbablesLeagueSwitch({
  activeLeague,
  onChange,
  isMobile,
}: {
  activeLeague: ProbablesLeague
  onChange: (league: ProbablesLeague) => void
  isMobile: boolean
}) {
  const leagues: Array<{ league: ProbablesLeague; label: string; fullLabel: string }> = [
    { league: "CL", label: "セ", fullLabel: "セ・リーグ" },
    { league: "PL", label: "パ", fullLabel: "パ・リーグ" },
  ]
  const mobileButtonClass = (league: ProbablesLeague) =>
    `flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-full px-1 text-[11px] font-bold leading-none transition-colors ${
      activeLeague === league ? "bg-white/25 text-[#ffff44]" : "bg-transparent text-white/90 hover:text-white"
    }`
  const desktopButtonClass = (league: ProbablesLeague) =>
    `flex h-10 flex-1 items-center justify-center border text-sm font-bold transition-colors ${
      activeLeague === league
        ? "border-[#ffff44] bg-[#ffff44] text-black"
        : "border-[#555] bg-[#151515] text-white hover:border-[#ffff44] hover:text-[#ffff44]"
    }`

  if (isMobile) {
    return (
      <nav
        className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-2 md:hidden"
        aria-label="予想投手リーグ切替"
      >
        <div className="mx-auto grid max-w-md grid-cols-2 rounded-full border border-white/35 bg-white/20 p-1 shadow-[0_4px_14px_rgba(0,0,0,0.08)] backdrop-blur-md">
          {leagues.map(({ league, label, fullLabel }) => {
            const isActive = activeLeague === league
            return (
              <button
                key={league}
                type="button"
                className={mobileButtonClass(league)}
                onClick={() => onChange(league)}
                aria-current={isActive ? "page" : undefined}
                aria-label={`${fullLabel}を表示`}
              >
                <Trophy className="h-5 w-5" aria-hidden="true" />
                <span className="whitespace-nowrap">{label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    )
  }

  return (
    <nav className="mb-4 flex justify-end" aria-label="予想投手リーグ切替">
      <div className="flex w-48 gap-2">
        {leagues.map(({ league, label, fullLabel }) => (
          <button
            key={league}
            type="button"
            className={desktopButtonClass(league)}
            onClick={() => onChange(league)}
            aria-pressed={activeLeague === league}
            aria-label={`${fullLabel}を表示`}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}

export function TopPageProbablesTab({ year, layout }: TopPageProbablesTabProps) {
  const isMobile = layout === "mobile"
  const [data, setData] = useState<TopProbablesSnapshot | null>(null)
  const [romanMap, setRomanMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeLeague, setActiveLeague] = useState<ProbablesLeague>("CL")

  useEffect(() => {
    if (year !== 2026) {
      setLoading(false)
      setData(null)
      setRomanMap({})
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    setRomanMap({})

    Promise.all([fetchTopProbablesJson(year), fetchMergedRomanNameMap(year)])
      .then(async ([payload, romans]) => {
        if (cancelled) return
        const enriched = await enrichProbablesSnapshotFromApi(payload)
        if (cancelled) return
        setData(enriched)
        setRomanMap(romans)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message || "予想投手データの取得に失敗しました")
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [year])

  if (year !== 2026) {
    return (
      <div className="text-white text-center py-8 text-sm">
        予想投手タブは 2026 シーズンのみ対応しています。
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-busy="true" aria-label="読み込み中">
        <Spinner className="size-8 text-[#FFFF44]" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-white text-center py-8 text-sm space-y-2">
        <p>{error || "予想投手データの取得に失敗しました"}</p>
        <p className="text-gray-400 text-xs">
          `npm run probables:rebuild:2026` 実行後、R2 へ反映してください。
        </p>
      </div>
    )
  }

  if (data.cards.length === 0) {
    return (
      <div className="text-white text-center py-8 text-sm space-y-2">
        <p>直近の三連戦カードがありません。</p>
        <p className="text-gray-400 text-xs">
          日程取得（phase0:fetch:schedule-ahead）と SN 取得（phase35）を確認してください。
        </p>
      </div>
    )
  }

  const sortedCards = [...data.cards].sort((a, b) => {
    const dateCompare = firstDisplayedGameDate(a).localeCompare(firstDisplayedGameDate(b))
    if (dateCompare !== 0) return dateCompare
    return a.cardKey.localeCompare(b.cardKey)
  })
  const visibleCards = sortedCards.filter((card) => leagueForProbablesCard(card) === activeLeague)

  return (
    <div className={isMobile ? "space-y-6 pb-20" : "space-y-6"}>
      <ProbablesLeagueSwitch
        activeLeague={activeLeague}
        onChange={setActiveLeague}
        isMobile={isMobile}
      />
      {visibleCards.length > 0 ? (
        visibleCards.map((card) => (
          <ProbablesCard
            key={`${card.cardKey}-${card.seriesStart}`}
            card={card}
            isMobile={isMobile}
            romanMap={romanMap}
            season={year}
          />
        ))
      ) : (
        <div className="py-8 text-center text-sm text-gray-400">
          {activeLeague === "CL" ? "セ・リーグ" : "パ・リーグ"}の予想投手カードはありません。
        </div>
      )}
    </div>
  )
}
