"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Gauge } from "lucide-react"

type RankingBottomNavProps = {
  year: string | number
}

export default function RankingBottomNav({ year }: RankingBottomNavProps) {
  const pathname = usePathname()
  const navItems = [
    { href: `/ranking/${year}/CL`, label: "セ野手", icon: BarChart3 },
    { href: `/ranking/pitching/${year}/CL`, label: "セ投手", icon: Gauge },
    { href: `/ranking/${year}/PL`, label: "パ野手", icon: BarChart3 },
    { href: `/ranking/pitching/${year}/PL`, label: "パ投手", icon: Gauge },
  ] as const

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-1.5 md:hidden"
      aria-label="ランキング切り替え"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md border px-1 text-[10px] font-bold transition-colors ${
                isActive
                  ? "border-white bg-white text-black shadow-[0_4px_14px_rgba(0,0,0,0.18)]"
                  : "border-white/55 bg-white/80 text-gray-600 shadow-[0_3px_12px_rgba(0,0,0,0.12)] hover:bg-white hover:text-black"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="leading-none">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
