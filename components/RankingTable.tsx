"use client"

import Link from "next/link"
import { SITE_TOP_HREF } from "@/lib/siteNavigation"
import { useRouter } from "next/navigation"

interface RankingPlayer {
  rank: number
  name: string
  romanName: string
  team: string
  value: number
  formattedValue: string
}

// formatFn を除外した MetricDefinition
interface MetricDisplayInfo {
  key: string
  label: string
  csvKey: string
  needsQualification: boolean
  sortOrder: 'desc' | 'asc'
}

interface RankingTableProps {
  year: string
  league: string
  metric: MetricDisplayInfo
  players: RankingPlayer[]
  teamColors: { [key: string]: string }
}

export default function RankingTable({
  year,
  league,
  metric,
  players,
  teamColors,
}: RankingTableProps) {
  const router = useRouter()
  const leagueName = league === 'PL' ? 'パ・リーグ' : 'セ・リーグ'
  
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-[#333]">
        {/* Header */}
        <div className="container mx-auto px-4 py-1 border-b border-[#333] flex items-center justify-between">
          {/* Left: Back Button */}
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 p-1 hover:opacity-80 transition-opacity text-[#ffff44]"
            aria-label="戻る"
          >
            <span className="text-sm">←</span>
          </button>

          {/* Center: Logo */}
          <Link href={SITE_TOP_HREF} className="absolute left-1/2 transform -translate-x-1/2">
            <img src="/logo.png" alt="Logo" className="w-7 h-7 cursor-pointer hover:opacity-80 transition-opacity" />
          </Link>

          {/* Right: Year (空) */}
          <div className="w-8"></div>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-2 py-3">
        <div className="flex items-center gap-1.5 mb-3">
          <div className="w-0.5 h-5 bg-[#039850]" />
          <h1 className="text-base font-bold text-white">
            {leagueName}　{metric.label}ランキング ({year}年)
          </h1>
        </div>

        <div className="bg-[#1a1a1a] overflow-hidden border border-[#333]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#2a2a2a]">
                  <th
                    className="px-2 py-3 text-[10px] font-bold border-r border-[#333] bg-[#ffff44] text-black sticky"
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 10,
                      minWidth: '20px',
                    }}
                  >
                    順
                  </th>
                  <th
                    className="px-2 py-3 text-[10px] font-bold border-r border-[#333] bg-[#ffff44] text-black sticky"
                    style={{
                      position: 'sticky',
                      left: '20px',
                      zIndex: 10,
                      minWidth: '120px',
                    }}
                  >
                    選手名
                  </th>
                  <th
                    className="px-2 py-3 text-[10px] font-bold border-r border-[#333] bg-[#ffff44] text-black"
                    style={{
                      minWidth: '80px',
                    }}
                  >
                    <Link
                      href={`/ranking/${year}/${league}`}
                      className="inline-block text-black hover:text-[#333] hover:underline cursor-pointer transition-all underline-offset-2 border-b-2 border-transparent hover:border-black"
                      title={`${metric.label}をクリックして指標一覧に戻る`}
                      onClick={(e) => {
                        console.log('Metric link clicked:', `/ranking/${year}/${league}`)
                      }}
                    >
                      {metric.label}
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody>
                {players.map((player, idx) => {
                  const hasRomanName = player.romanName && player.romanName.trim()
                  return (
                    <tr
                      key={player.rank}
                      className="bg-[#1f1f1f] hover:bg-[#2a2a2a] transition-colors border-b border-[#333]"
                    >
                      {/* 順位 */}
                      <td
                        className="px-1.5 py-0.5 text-center tabular-nums font-normal border-r border-[#444] text-white sticky"
                        style={{
                          position: 'sticky',
                          left: 0,
                          zIndex: 9,
                          minWidth: '20px',
                          backgroundColor: '#1f1f1f',
                        }}
                      >
                        <span className="bebas tabular-nums text-lg tracking-wide">{player.rank}</span>
                      </td>
                      
                      {/* 選手名 */}
                      <td
                        className="px-0.5 py-0.5 border-r-2 border-[#555] sticky"
                        style={{
                          position: 'sticky',
                          left: '20px',
                          zIndex: 9,
                          minWidth: '120px',
                          backgroundColor: '#1f1f1f',
                        }}
                      >
                        <div className="flex items-center gap-0.5">
                          <div className="w-1 h-8 flex-shrink-0" style={{ backgroundColor: teamColors[player.team] || '#fff' }} />
                          <div className="flex-1 min-w-0 flex flex-col justify-center leading-[1.05] h-8">
                            <Link href={`/players/${player.rank}`} className="block truncate">
                              <span className="text-white hover:text-[#ffff44] text-[13px] font-semibold truncate">
                                {player.name.replace(/\s+/g, '')}
                              </span>
                            </Link>
                            {hasRomanName && (
                              <span className="text-[10px] text-gray-400 latin truncate">
                                {player.romanName.trim()}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      {/* 指標値 */}
                      <td
                        className="px-1.5 py-0.5 text-center tabular-nums font-normal border-r border-[#444] text-white"
                        style={{
                          minWidth: '80px',
                        }}
                      >
                        <span className="bebas tabular-nums text-lg tracking-wide">{player.formattedValue}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}

