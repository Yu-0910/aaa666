"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { SeasonStatsApiResponse } from "@/app/api/players/[playerId]/season-stats/route"
import {
  CountPitchTypeChart,
  PitchTypeSidePanelToggle,
  PitchTypeVsHandSplitBlock,
} from "@/app/components/PitchTypeSplitViewsSection"
import { buildPitchTypeColorMap } from "@/app/components/PitchTypeSplitStackedBarSection"
import DerivedPipelineEmptyNotice from "@/app/components/DerivedPipelineEmptyNotice"
import { SectionLoadingSpinner } from "@/components/ui/spinner"
import {
  BATTER_VS_TEAM_MIN_PITCHES_DISPLAY,
  type BatterVsTeamCountPitchTypesFile,
  type BatterVsTeamCountPitchTypesTeamBlock,
  type BatterVsTeamPitchTypesSplitRow,
} from "@/lib/batterVsTeamCountPitchTypesTypes"
import { teamCodeFromShort } from "@/lib/standings/teamCodes"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"

const FIELDER_COUNT_PITCH_ROW_LABEL_CLASS =
  "text-[12px] text-gray-200 font-black tabular-nums leading-tight"

const TEAM_COLORS: Record<string, string> = {
  日本ハム: "#0077c8",
  楽天: "#7a0019",
  西武: "#004098",
  ロッテ: "#6b7280",
  オリックス: "#b79e51",
  ソフトバンク: "#ffdb00",
  巨人: "#ff6600",
  ヤクルト: "#2bbb3f",
  横浜: "#0067c0",
  中日: "#004ea2",
  阪神: "#ffde00",
  広島: "#d60718",
}

type TeamVsHandPanelState = {
  leftOpen: boolean
  rightOpen: boolean
}

function hasPitchTypesSplitRows(rows: BatterVsTeamPitchTypesSplitRow[] | null | undefined): boolean {
  return (rows?.length ?? 0) > 0 && rows.some((r) => r.pitches_total > 0)
}

/** 球数・打数のうち大きい方で並べ替え（打数は season-stats vs_team から） */
function teamExposureSortKey(
  team: BatterVsTeamCountPitchTypesTeamBlock,
  abByTeamCode: Map<string, number>,
): number {
  const ab = abByTeamCode.get(team.teamCode) ?? 0
  return Math.max(team.pitches_total, ab)
}

function parseVsTeamAbByTeamCode(stats: SeasonStatsApiResponse["payload"]): Map<string, number> {
  const m = new Map<string, number>()
  for (const row of stats?.stats ?? []) {
    if (row.split_type !== "vs_team") continue
    const raw = String(row.split_value ?? "").replace(/^vs_/, "").trim()
    const code = teamCodeFromShort(raw)
    if (!code) continue
    const ab = Number(row.ab)
    m.set(code, Number.isFinite(ab) ? Math.max(0, Math.trunc(ab)) : 0)
  }
  return m
}

export type PlayerPageFielderVsTeamPitchBodyProps = {
  tb: string
  sectionStripeColor: string
  playerId: string
  loading: boolean
  settled: boolean
  payload: BatterVsTeamCountPitchTypesFile | null
  looseSpacing?: boolean
  twoColumnTeamLayout?: boolean
}

function TeamCountPitchBlock({
  tb,
  sectionStripeColor,
  team,
  vsHandPanel,
  onVsHandToggle,
}: {
  tb: string
  sectionStripeColor: string
  team: BatterVsTeamCountPitchTypesTeamBlock
  vsHandPanel: TeamVsHandPanelState
  onVsHandToggle: (side: "left" | "right") => void
}) {
  const countColorMap = useMemo(
    () =>
      team.byCountPitchTypes.length > 0
        ? buildPitchTypeColorMap(team.byCountPitchTypes)
        : null,
    [team.byCountPitchTypes],
  )
  const hasVsL = hasPitchTypesSplitRows(team.byCountPitchTypesVsL)
  const hasVsR = hasPitchTypesSplitRows(team.byCountPitchTypesVsR)
  const sidePanelPilot = hasVsL || hasVsR

  return (
    <PitchTypeVsHandSplitBlock
      tb={tb}
      sectionStripeColor={sectionStripeColor}
      title=""
      titleVsL="対左投手"
      titleVsR="対右投手"
      sidePanelPilot={sidePanelPilot}
      hasVsLSplits={hasVsL}
      hasVsRSplits={hasVsR}
      leftOpen={vsHandPanel.leftOpen}
      rightOpen={vsHandPanel.rightOpen}
      onLeftToggle={() => onVsHandToggle("left")}
      onRightToggle={() => onVsHandToggle("right")}
      hintText="左・右を押すと対左投手／対右投手から受けた配球を表示します"
      toggleAriaLabel={`${team.label}のカウント別配球・対左右表示切替`}
      leftTitle="対左投手から受けた配球を表示"
      rightTitle="対右投手から受けた配球を表示"
      showBaseTitle={false}
      renderBaseChart={() => (
        <CountPitchTypeChart
          splits={team.byCountPitchTypes}
          baseColorMap={countColorMap}
          rowLabelClassName={FIELDER_COUNT_PITCH_ROW_LABEL_CLASS}
        />
      )}
      renderVsLChart={(stagger, generation) => (
        <CountPitchTypeChart
          splits={team.byCountPitchTypesVsL ?? null}
          staggerRowReveal={stagger}
          revealGeneration={generation}
          baseColorMap={countColorMap}
          rowLabelClassName={FIELDER_COUNT_PITCH_ROW_LABEL_CLASS}
        />
      )}
      renderVsRChart={(stagger, generation) => (
        <CountPitchTypeChart
          splits={team.byCountPitchTypesVsR ?? null}
          staggerRowReveal={stagger}
          revealGeneration={generation}
          baseColorMap={countColorMap}
          rowLabelClassName={FIELDER_COUNT_PITCH_ROW_LABEL_CLASS}
        />
      )}
      chartRevealAnimate={false}
    />
  )
}

export function PlayerPageFielderVsTeamPitchBody({
  tb,
  sectionStripeColor,
  playerId,
  loading,
  settled,
  payload,
  looseSpacing = true,
  twoColumnTeamLayout = false,
}: PlayerPageFielderVsTeamPitchBodyProps) {
  const h2Team = `${tb} ${looseSpacing ? "mb-4 pl-4 mt-0" : "mb-3 pl-4 mt-0"}`
  const h2PageTop = `${tb} ${looseSpacing ? "mb-6 pl-4 mt-3" : "mb-4 pl-4 mt-2"}`
  const mbScroll = looseSpacing ? "mb-10" : "mb-6"
  const [vsHandByTeam, setVsHandByTeam] = useState<Record<string, TeamVsHandPanelState>>({})
  const [abByTeamCode, setAbByTeamCode] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    const id = playerId.trim()
    if (!id) {
      setAbByTeamCode(new Map())
      return
    }
    let cancelled = false
    fetch(
      `/api/players/${encodeURIComponent(id)}/season-stats?year=${encodeURIComponent(DERIVED_SEASON_YEAR_DEFAULT)}`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? (r.json() as Promise<SeasonStatsApiResponse>) : null))
      .then((json) => {
        if (cancelled) return
        setAbByTeamCode(parseVsTeamAbByTeamCode(json?.payload ?? null))
      })
      .catch(() => {
        if (!cancelled) setAbByTeamCode(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [playerId])

  const visibleTeams = useMemo(() => {
    const teams = (payload?.teams ?? []).filter(
      (t) => t.pitches_total >= BATTER_VS_TEAM_MIN_PITCHES_DISPLAY,
    )
    return [...teams].sort((a, b) => {
      const diff = teamExposureSortKey(b, abByTeamCode) - teamExposureSortKey(a, abByTeamCode)
      if (diff !== 0) return diff
      return a.teamCode.localeCompare(b.teamCode)
    })
  }, [payload?.teams, abByTeamCode])

  const toggleVsHand = useCallback((teamCode: string, side: "left" | "right") => {
    setVsHandByTeam((prev) => {
      const cur = prev[teamCode] ?? { leftOpen: false, rightOpen: false }
      const key = side === "left" ? "leftOpen" : "rightOpen"
      return {
        ...prev,
        [teamCode]: { ...cur, [key]: !cur[key] },
      }
    })
  }, [])

  if (loading && !settled) {
    return (
      <div className="py-8">
        <SectionLoadingSpinner />
      </div>
    )
  }

  if (visibleTeams.length === 0) {
    return (
      <div className="space-y-4">
        <DerivedPipelineEmptyNotice variant="fielder" show />
        {settled ? (
          <p className="max-w-3xl text-[10px] leading-snug text-gray-500">
            今季（{DERIVED_SEASON_YEAR_DEFAULT}）の球団別配球データは{" "}
            <code className="rounded bg-black/35 px-1 py-0.5 text-[9px]">
              npm run phase33:build:batter-vs-team-count-pitch-types
            </code>{" "}
            実行後に表示されます。
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div>
      <h2
        className={h2PageTop}
        style={{
          borderLeft: `6px solid ${sectionStripeColor}`,
          fontWeight: 900,
        }}
      >
        カウント別の配球
      </h2>

      <div
        className={
          twoColumnTeamLayout
            ? "grid grid-cols-1 gap-x-12 md:grid-cols-2"
            : undefined
        }
      >
        {visibleTeams.map((team) => {
          const panel = vsHandByTeam[team.teamCode] ?? { leftOpen: false, rightOpen: false }
          const hasVsL = hasPitchTypesSplitRows(team.byCountPitchTypesVsL)
          const hasVsR = hasPitchTypesSplitRows(team.byCountPitchTypesVsR)
          return (
            <section key={team.teamCode} className={`${mbScroll} min-w-0`}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2
                  className={`${h2Team} min-w-0 flex-1`}
                  style={{
                    borderLeft: `6px solid ${TEAM_COLORS[team.label] || sectionStripeColor}`,
                    fontWeight: 900,
                  }}
                >
                  {team.label}
                </h2>
                {hasVsL || hasVsR ? (
                  <PitchTypeSidePanelToggle
                    leftOpen={panel.leftOpen && hasVsL}
                    rightOpen={panel.rightOpen && hasVsR}
                    onLeftToggle={() => toggleVsHand(team.teamCode, "left")}
                    onRightToggle={() => toggleVsHand(team.teamCode, "right")}
                    leftDisabled={!hasVsL}
                    rightDisabled={!hasVsR}
                    ariaLabel={`${team.label}の対左右配球表示切替`}
                    leftTitle="対左投手から受けた配球を表示"
                    rightTitle="対右投手から受けた配球を表示"
                  />
                ) : null}
              </div>
              <div className={twoColumnTeamLayout ? "max-w-[94%]" : undefined}>
                <TeamCountPitchBlock
                  tb={tb}
                  sectionStripeColor={sectionStripeColor}
                  team={team}
                  vsHandPanel={panel}
                  onVsHandToggle={(side) => toggleVsHand(team.teamCode, side)}
                />
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
