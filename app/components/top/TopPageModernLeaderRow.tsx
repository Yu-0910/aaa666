"use client"

import Link from "next/link"
import { formatRankingStatDisplay } from "@/lib/formatStat"
import { abbreviatedRomanForUrl, fullRomanForPlayerUrl } from "@/lib/topPageLeaderName"
import type { TopLeaderRowTypography } from "@/lib/topPageBatting2025Grid"
import { playerPageHref } from "@/lib/playerPageHref"
import { matchupOpponentDisplayNameJa } from "@/lib/playerNameNormalize"
import { teamColors } from "@/app/components/top/topPageConstants"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"

type TopPageModernLeaderRowProps = {
  leader: Record<string, unknown>
  stat: unknown
  index: number
  modernLeaderRow: boolean
  typography: TopLeaderRowTypography
  /** MiniLeaderRow 用の縦バー高さ */
  miniTeamBar?: string
}

export function TopPageModernLeaderRow({
  leader,
  stat,
  index,
  modernLeaderRow,
  typography,
  miniTeamBar,
}: TopPageModernLeaderRowProps) {
  const formattedValue = formatRankingStatDisplay(String(stat ?? ""), leader.value)
  const l = leader as {
    romanName?: string
    name?: string
    team?: string
    playerId?: string
    npbPlayerId?: string
  }
  const romanShort = abbreviatedRomanForUrl({ romanName: l.romanName, name: String(l.name ?? "") })
  const romanForUrl = fullRomanForPlayerUrl({
    romanName: l.romanName,
    name: String(l.name ?? ""),
  })
  const playerNameRaw = typeof leader.name === "string" ? leader.name : ""
  const playerName = matchupOpponentDisplayNameJa(playerNameRaw).replace(/[\s\u3000]+/g, "")
  const teamKey = typeof leader.team === "string" ? leader.team : ""
  const teamBarHeight = miniTeamBar ?? (modernLeaderRow ? typography.teamBar : "h-6")
  const rankLabel = String(index + 1)

  return (
    <div
      className={`flex min-w-0 w-full ${typography.leaderRowGap} ${typography.rowPy} ${
        typography.rankBebas ? "overflow-hidden" : ""
      } ${modernLeaderRow ? "items-stretch" : "items-center"}`}
    >
      <div
        className={`${typography.rankBadge} ${typography.rankInset} shrink-0 flex items-center justify-center self-center ${
          typography.rankBebas ? "" : "rounded-full bg-[#2a2a2a]"
        }`}
      >
        <span
          className={`${typography.rankTextColor ?? "text-white"} ${typography.rankText} ${
            typography.rankBebas ? "bebas tabular-nums font-normal" : "latin tabular-nums"
          }`}
        >
          {rankLabel}
        </span>
      </div>
      <div
        className={`${typography.teamBarWidth ?? "w-1"} ${typography.teamBarInset ?? ""} mr-0.5 shrink-0 rounded-[1px] ${modernLeaderRow ? `self-center ${teamBarHeight}` : "h-6 self-center"}`}
        style={{ backgroundColor: teamColors[teamKey] || rankingTeamStripeColor(teamKey) }}
      />
      <Link
        href={playerPageHref({
          npbPlayerId: l.npbPlayerId,
          playerId: l.playerId,
          name: playerName,
          romanName: romanForUrl || romanShort,
        })}
        className={`flex-1 min-w-0 hover:opacity-80 transition-opacity ${modernLeaderRow ? "flex flex-col justify-center gap-0" : "flex items-center gap-1"}`}
      >
        {modernLeaderRow ? (
          <>
            <div
              className={`flex items-center justify-between ${typography.nameValueGap} w-full min-w-0`}
            >
              <span
                className={`flex-1 min-w-0 text-white ${typography.playerName} font-semibold leading-tight ${typography.playerNameLine} ${typography.playerTextShift ?? ""}`}
              >
                {playerName}
              </span>
              <span
                className={`text-white ${typography.statValue} bebas tabular-nums font-normal shrink-0 leading-none tracking-[-0.01em] ${typography.statValueShift}`}
              >
                {formattedValue}
              </span>
            </div>
            {romanShort && (
              <span
                className={`latin ${typography.romanName} text-gray-400 leading-snug tracking-wide truncate ${typography.playerTextShift ?? ""}`}
              >
                {romanShort}
              </span>
            )}
          </>
        ) : (
          <>
            <span className={`text-white ${typography.playerName} font-semibold leading-tight`}>
              {playerName}
            </span>
            {romanShort && (
              <span className={`latin ${typography.romanName} text-gray-400 leading-tight`}>{romanShort}</span>
            )}
          </>
        )}
      </Link>
      {!modernLeaderRow && (
        <div className={`text-white ${typography.statValue} bebas tabular-nums font-normal self-center shrink-0`}>
          {formattedValue}
        </div>
      )}
    </div>
  )
}
