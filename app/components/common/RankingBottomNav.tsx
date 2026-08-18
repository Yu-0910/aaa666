"use client"

import { BarChart3, Gauge, Table2 } from "lucide-react"

export type TopSeasonStatView = "cl-batting" | "cl-pitching" | "pl-batting" | "pl-pitching"
export type TopWeeklyView = TopSeasonStatView
export type TopStandingsView = "cl-season" | "pl-season" | "cl-weekly" | "pl-weekly"

type TopSeasonBottomNavProps = {
  mode?: "season"
  activeView: TopSeasonStatView
  onViewChange: (view: TopSeasonStatView) => void
}

type TopWeeklyBottomNavProps = {
  mode: "weekly"
  activeView: TopWeeklyView
  onViewChange: (view: TopWeeklyView) => void
}

type TopStandingsBottomNavProps = {
  mode: "standings"
  activeView: TopStandingsView
  onViewChange: (view: TopStandingsView) => void
}

type RankingBottomNavProps = TopSeasonBottomNavProps | TopWeeklyBottomNavProps | TopStandingsBottomNavProps

export default function RankingBottomNav(props: RankingBottomNavProps) {
  const { activeView, onViewChange } = props
  const isWeeklyMode = props.mode === "weekly"
  const isStandingsMode = props.mode === "standings"
  const handleViewChange = (view: string) => {
    // The item list is selected from the same discriminated mode as the callback.
    ;(onViewChange as (nextView: string) => void)(view)
  }

  const navItems =
    isStandingsMode
      ? ([
          { view: "cl-season", label: "セ今季", icon: Table2 },
          { view: "pl-season", label: "パ今季", icon: Table2 },
          { view: "cl-weekly", label: "セ今週", icon: Table2 },
          { view: "pl-weekly", label: "パ今週", icon: Table2 },
        ] as const)
      : isWeeklyMode
      ? ([
          { view: "cl-batting", label: "セ野手", icon: BarChart3 },
          { view: "cl-pitching", label: "セ投手", icon: Gauge },
          { view: "pl-batting", label: "パ野手", icon: BarChart3 },
          { view: "pl-pitching", label: "パ投手", icon: Gauge },
        ] as const)
      : ([
          { view: "cl-batting", label: "セ野手", icon: BarChart3 },
          { view: "cl-pitching", label: "セ投手", icon: Gauge },
          { view: "pl-batting", label: "パ野手", icon: BarChart3 },
          { view: "pl-pitching", label: "パ投手", icon: Gauge },
        ] as const)

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-2 md:hidden"
      aria-label={isStandingsMode ? "順位表表示切り替え" : isWeeklyMode ? "今週表示切り替え" : "TOP成績切り替え"}
    >
      <div className="mx-auto grid max-w-md grid-cols-4 rounded-full border border-white/35 bg-white/20 p-1 shadow-[0_4px_14px_rgba(0,0,0,0.08)] backdrop-blur-md">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeView === item.view
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => handleViewChange(item.view)}
              className={`flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-full px-1 text-[11px] font-bold leading-none transition-colors ${
                isActive
                  ? "bg-white/25 text-[#ffff44]"
                  : "bg-transparent text-white/90 hover:text-white"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
