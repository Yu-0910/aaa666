"use client"

import type { CSSProperties } from "react"
import Link from "next/link"
import DerivedPipelineEmptyNotice from "@/app/components/DerivedPipelineEmptyNotice"
import { SectionLoadingSpinner } from "@/components/ui/spinner"
import { formatSlashStatDisplay } from "@/lib/battingRateFormat"
import { playerPageHref } from "@/lib/playerPageHref"
import type { PlayerMatchupDerived, PlayerMatchupOpponentRow } from "@/lib/playerMatchupTypes"
import { matchupOpponentDisplayNameJa } from "@/lib/playerNameNormalize"
import {
  compareMatchupOpponentsByOpsDesc,
  PLAYER_MATCHUP_DISPLAY_YEAR,
  PLAYER_MATCHUP_NAME_COLUMN_WIDTH_PX,
  PLAYER_MATCHUP_TABLE_COLUMNS,
  sortMatchupTeamsByOpponentCountDesc,
} from "@/lib/playerMatchupSeasonTab"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"
import { teamRomanNameFromCode } from "@/lib/standings/teamCodes"

const matchupTeamStripeColor = (team: string): string =>
  team === "その他" ? "#666666" : rankingTeamStripeColor(team)


const DATA_ROW: CSSProperties = {
  backgroundColor: "rgba(255,255,255,0.03)",
  color: "#f5f5f5",
}

function cellValue(row: PlayerMatchupOpponentRow, key: string): string {
  const na = "—"
  switch (key) {
    case "ab":
      return String(row.ab)
    case "h":
      return String(row.h)
    case "hr":
      return String(row.hr)
    case "so":
      return String(row.so)
    case "avg":
      return row.avg != null ? formatSlashStatDisplay(row.avg) : na
    case "ops":
      return row.ops != null ? formatSlashStatDisplay(row.ops) : na
    default:
      return na
  }
}

export type PlayerPageMatchupBodyProps = {
  tb: string
  sectionStripeColor: string
  role: "batter" | "pitcher"
  loading: boolean
  settled: boolean
  payload: PlayerMatchupDerived | null
  looseSpacing?: boolean
}

export function PlayerPageMatchupBody({
  tb,
  sectionStripeColor: _sectionStripeColor,
  role,
  loading,
  settled,
  payload,
  looseSpacing = true,
}: PlayerPageMatchupBodyProps) {
  const opponentLabel = role === "batter" ? "投手" : "打者"
  const h2Section = `${tb} ${looseSpacing ? "mb-5 pl-4 mt-10" : "mb-3 pl-4 mt-3"}`
  const mbScroll = looseSpacing ? "mb-8" : "mb-4"

  if (loading && !settled) {
    return (
      <div className="py-8">
        <SectionLoadingSpinner />
      </div>
    )
  }

  const teams = sortMatchupTeamsByOpponentCountDesc(payload?.teams ?? [])
  const hasRows = teams.some((t) => t.opponents.length > 0)

  if (!hasRows) {
    return (
      <div className="space-y-4">
        <DerivedPipelineEmptyNotice
          variant={role === "pitcher" ? "pitcher" : "fielder"}
          show
        />
        {settled ? (
          <p className="max-w-3xl text-[10px] leading-snug text-gray-500">
            今季（{PLAYER_MATCHUP_DISPLAY_YEAR}）の対戦相手別データは{" "}
            <code className="rounded bg-black/35 px-1 py-0.5 text-[9px]">
              npm run phase30:build:player-matchup
            </code>{" "}
            実行後に表示されます。
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-x-12 md:grid-cols-2">
        {teams.map((team) => (
          <section key={team.teamCode} className={`${mbScroll} min-w-0`}>
            <h2
              className={h2Section}
              style={{
                borderLeft: `6px solid ${matchupTeamStripeColor(team.teamDisplay)}`,
              }}
            >
              <span className="block font-black">{team.teamDisplay}</span>
              <span className="mt-0.5 block text-[15px] font-normal leading-tight text-gray-400 latin">
                {teamRomanNameFromCode(team.teamCode)}
              </span>
            </h2>
            <div className="w-full">
              <div className="player-matchup-table-scroll overflow-x-auto overflow-y-hidden">
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
                    {PLAYER_MATCHUP_TABLE_COLUMNS.map((c) => (
                      <col key={c.key} style={{ width: "48px" }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                      <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                        {opponentLabel}
                      </th>
                      {PLAYER_MATCHUP_TABLE_COLUMNS.map((c) => (
                        <th
                          key={c.key}
                          className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500"
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...team.opponents].sort(compareMatchupOpponentsByOpsDesc).map((row) => (
                      <tr key={row.opponentNpbId} style={DATA_ROW}>
                        <td
                          className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                          style={{ backgroundColor: "#1a1a1a" }}
                        >
                          <Link
                            href={playerPageHref({
                              npbPlayerId: row.opponentNpbId,
                              playerId: row.opponentPublicId,
                              name: matchupOpponentDisplayNameJa(row.opponentName),
                            })}
                            className="hover:text-[#FFFF44] transition-colors"
                          >
                            {matchupOpponentDisplayNameJa(row.opponentName)}
                          </Link>
                        </td>
                        {PLAYER_MATCHUP_TABLE_COLUMNS.map((c) => (
                          <td
                            key={c.key}
                            className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                          >
                            {cellValue(row, c.key)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
