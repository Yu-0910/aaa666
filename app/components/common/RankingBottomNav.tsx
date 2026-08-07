"use client"

import { BarChart3, Gauge } from "lucide-react"

export type TopSeasonStatView = "cl-batting" | "cl-pitching" | "pl-batting" | "pl-pitching"

type RankingBottomNavProps = {
  activeView: TopSeasonStatView
  onViewChange: (view: TopSeasonStatView) => void
}

export default function RankingBottomNav({ activeView, onViewChange }: RankingBottomNavProps) {
  const navItems = [
    { view: "cl-batting", label: "セ野手", icon: BarChart3 },
    { view: "cl-pitching", label: "セ投手", icon: Gauge },
    { view: "pl-batting", label: "パ野手", icon: BarChart3 },
    { view: "pl-pitching", label: "パ投手", icon: Gauge },
  ] as const

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-2 md:hidden"
      aria-label="TOP成績切り替え"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeView === item.view
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => onViewChange(item.view)}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md border px-1 text-[10px] font-bold transition-colors ${
                isActive
                  ? "border-white/80 bg-white/85 text-black shadow-[0_3px_10px_rgba(0,0,0,0.14)]"
                  : "border-white/35 bg-white/60 text-gray-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:bg-white/75 hover:text-black"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="leading-none">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
