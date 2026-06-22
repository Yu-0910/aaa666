"use client"

import Link from "next/link"
import { SITE_TOP_HREF } from "@/lib/siteNavigation"
import { TEAM_PAGE_DRAWER_NAV, teamPageNavHref } from "@/lib/teamPage/teamPageNavLinks"

type Props = {
  open: boolean
  onClose: () => void
  selectedYear: number
}

export function TopPageMobileDrawer({ open, onClose, selectedYear }: Props) {
  if (!open) return null

  const rankingHref = `/ranking/${selectedYear}/PL`
  const pitchingRankingHref = `/ranking/pitching/2026/PL`

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-[100]" onClick={onClose} />
      <div className="fixed top-0 left-0 h-full w-64 bg-[#1a1a1a] z-[101] overflow-y-auto shadow-xl">
        <div className="p-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-[#ffff44]">メニュー</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-white hover:text-[#ffff44] text-2xl leading-none"
              aria-label="メニューを閉じる"
            >
              ×
            </button>
          </div>

          <nav className="space-y-2">
            <Link
              href={SITE_TOP_HREF}
              className="block py-2 px-3 hover:bg-[#2a2a2a] rounded transition-colors text-sm"
              onClick={onClose}
            >
              トップページ
            </Link>
            <Link href={rankingHref} className="block py-2 px-3 hover:bg-[#2a2a2a] rounded transition-colors text-sm" onClick={onClose}>
              打撃ランキング
            </Link>
            <Link
              href={pitchingRankingHref}
              className="block py-2 px-3 hover:bg-[#2a2a2a] rounded transition-colors text-sm"
              onClick={onClose}
            >
              投手ランキング
            </Link>
            <Link href="#" className="block py-2 px-3 hover:bg-[#2a2a2a] rounded transition-colors text-sm" onClick={onClose}>
              ドラフト情報
            </Link>

            <div>
              <div className="py-2 px-3 text-sm font-bold text-[#ffff44]">球団ページ</div>

              <div className="border-l-2 border-[#039850] pl-2">
                <div className="text-xs font-bold text-[#039850] mb-1">セ・リーグ</div>
                {TEAM_PAGE_DRAWER_NAV.CL.map((item) => (
                  <Link
                    key={item.teamCode}
                    href={teamPageNavHref(item.teamCode, selectedYear)}
                    className="block py-1 text-xs hover:text-[#ffff44] transition-colors"
                    onClick={onClose}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              <div className="border-l-2 border-[#10b8ce] pl-2 mt-2">
                <div className="text-xs font-bold text-[#10b8ce] mb-1">パ・リーグ</div>
                {TEAM_PAGE_DRAWER_NAV.PL.map((item) => (
                  <Link
                    key={item.teamCode}
                    href={teamPageNavHref(item.teamCode, selectedYear)}
                    className="block py-1 text-xs hover:text-[#ffff44] transition-colors"
                    onClick={onClose}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </nav>
        </div>
      </div>
    </>
  )
}
