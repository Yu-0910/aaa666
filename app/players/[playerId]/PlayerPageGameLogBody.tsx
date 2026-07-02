"use client"

import DerivedPipelineEmptyNotice from "@/app/components/DerivedPipelineEmptyNotice"
import { SectionLoadingSpinner } from "@/components/ui/spinner"
import type { PlayerGameLogApiPayload } from "@/app/api/players/[playerId]/game-log/route"

export function PlayerPageGameLogBody({
  payload,
  loading,
  settled,
}: {
  payload: PlayerGameLogApiPayload | null
  loading: boolean
  settled: boolean
}) {
  if (loading && !settled) {
    return (
      <div className="py-8">
        <SectionLoadingSpinner />
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="space-y-4">
        <DerivedPipelineEmptyNotice variant="fielder" show />
        <p className="text-[11px] text-gray-400">2026年の試合別成績データは準備中です。</p>
      </div>
    )
  }

  if (payload.role === "pitcher") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
              {["日付", "対戦", "回", "球数", "被安打", "奪三振", "四球", "失点", "自責"].map((label) => (
                <th key={label} className="border border-gray-500 px-2 py-1 text-center font-bold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.pitcherRows.map((row) => (
              <tr key={`${row.date}-${row.opponent}`} className="bg-[#111] text-white">
                <td className="border border-gray-700 px-2 py-1 text-center">{row.date}</td>
                <td className="border border-gray-700 px-2 py-1 text-center">{row.opponent}</td>
                <td className="border border-gray-700 px-2 py-1 text-center">{row.ip}</td>
                <td className="border border-gray-700 px-2 py-1 text-center">{row.pitches}</td>
                <td className="border border-gray-700 px-2 py-1 text-center">{row.h}</td>
                <td className="border border-gray-700 px-2 py-1 text-center">{row.so}</td>
                <td className="border border-gray-700 px-2 py-1 text-center">{row.bb}</td>
                <td className="border border-gray-700 px-2 py-1 text-center">{row.r}</td>
                <td className="border border-gray-700 px-2 py-1 text-center">{row.er}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
            {["日付", "対戦", "打数", "安打", "本塁打", "打点", "三振", "四球"].map((label) => (
              <th key={label} className="border border-gray-500 px-2 py-1 text-center font-bold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payload.batterRows.map((row) => (
            <tr key={`${row.date}-${row.opponent}`} className="bg-[#111] text-white">
              <td className="border border-gray-700 px-2 py-1 text-center">{row.date}</td>
              <td className="border border-gray-700 px-2 py-1 text-center">{row.opponent}</td>
              <td className="border border-gray-700 px-2 py-1 text-center">{row.ab}</td>
              <td className="border border-gray-700 px-2 py-1 text-center">{row.h}</td>
              <td className="border border-gray-700 px-2 py-1 text-center">{row.hr}</td>
              <td className="border border-gray-700 px-2 py-1 text-center">{row.rbi}</td>
              <td className="border border-gray-700 px-2 py-1 text-center">{row.so}</td>
              <td className="border border-gray-700 px-2 py-1 text-center">{row.bb}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
