"use client"

import Link from "next/link"
import { BarChart3, Gauge } from "lucide-react"

type BottomNavItem = {
  href: string
  label: string
  active?: boolean
  icon: "batting" | "pitching"
}

export default function RankingPageBottomLinkNav({
  ariaLabel,
  items,
}: {
  ariaLabel: string
  items: BottomNavItem[]
}) {
  const colsClass = items.length <= 2 ? "grid-cols-2" : "grid-cols-4"

  return (
    <nav
      aria-label={ariaLabel}
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-2"
    >
      <div className={`mx-auto grid max-w-md ${colsClass} rounded-full border border-white/35 bg-white/20 p-1 shadow-[0_4px_14px_rgba(0,0,0,0.08)] backdrop-blur-md`}>
        {items.map((item) => {
          const Icon = item.icon === "pitching" ? Gauge : BarChart3
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-current={item.active ? "page" : undefined}
              className={`flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-full px-1 text-[11px] font-bold leading-none transition-colors ${
                item.active ? "bg-white/25 text-[#ffff44]" : "bg-transparent text-white/90 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="whitespace-nowrap">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
