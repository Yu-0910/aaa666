/**
 * LOCKED: UI Baseline - このファイルは変更禁止
 * 
 * このファイルは、ランキングページのUI Baselineとして保存されています。
 * UIが意図せず変わってしまった場合、このファイルを参照して復元してください。
 * 
 * 作成日: 2025-01-XX
 * 状態: 正常（UI Baseline）
 * 
 * 【使用方法】
 * 1. UIが壊れた場合、このファイルを RankingPageClient.tsx にコピー
 * 2. または、import を差し替える:
 *    import RankingUILocked from "@/components/RankingUILocked"
 */

"use client"

import Link from "next/link"
import { SITE_TOP_HREF } from "@/lib/siteNavigation"

// チームカラーの定義（LOCKED）
const teamColors: { [key: string]: string } = {
  // セ・リーグ
  阪神: "#ffde00",
  "阪神タイガース": "#ffde00",
  巨人: "#ff6600",
  "読売ジャイアンツ": "#ff6600",
  DeNA: "#0067c0",
  "横浜DeNAベイスターズ": "#0067c0",
  広島: "#d60718",
  "広島東洋カープ": "#d60718",
  中日: "#004ea2",
  "中日ドラゴンズ": "#004ea2",
  ヤクルト: "#2bbb3f",
  "東京ヤクルトスワローズ": "#2bbb3f",
  // パ・リーグ
  オリックス: "#b79e51",
  "オリックス・バファローズ": "#b79e51",
  ロッテ: "#222",
  "千葉ロッテマリーンズ": "#222",
  日本ハム: "#0077c8",
  "北海道日本ハムファイターズ": "#0077c8",
  楽天: "#7a0019",
  "東北楽天ゴールデンイーグルス": "#7a0019",
  西武: "#004098",
  "埼玉西武ライオンズ": "#004098",
  ソフトバンク: "#ffdb00",
  "福岡ソフトバンクホークス": "#ffdb00",
}

export interface RankingPlayer {
  rank: number
  player: string
  name: string
  romanName?: string
  team: string
  value: number
  metric: string
  [key: string]: any
}

export interface MetricDisplay {
  key: string
  label: string
}

interface RankingUILockedProps {
  players: RankingPlayer[]
  metrics: MetricDisplay[]
  leagueName: string
  year: string
  formatValue: (label: string, value: any) => string
  onPlayerClick?: (playerId: string | number) => void
}

/**
 * LOCKED UI Component - Pure UI（データロジックを含まない）
 * 
 * このコンポーネントは、props を受け取って描画するだけのPure UIです。
 * データの取得・変換・フィルタリングは一切行いません。
 */
export default function RankingUILocked({
  players,
  metrics,
  leagueName,
  year,
  formatValue,
  onPlayerClick,
}: RankingUILockedProps) {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-[#333]">
        {/* Header */}
        <div className="container mx-auto px-4 py-1 border-b border-[#333] flex items-center justify-between">
          {/* Left: Back Button */}
          <button
            onClick={() => window.history.back()}
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
            {leagueName}　打撃成績ランキング ({year}年) - OPS順
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
                  {metrics.map((metric) => (
                    <th
                      key={metric.key}
                      className="px-2 py-3 text-[10px] font-bold border-r border-[#333] bg-[#ffff44] text-black"
                      style={{
                        minWidth: '60px',
                      }}
                    >
                      {metric.label}
                    </th>
                  ))}
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
                            <Link 
                              href={`/players/${player.playerId || player.rank}`} 
                              className="block truncate"
                              onClick={(e) => {
                                if (onPlayerClick) {
                                  e.preventDefault()
                                  onPlayerClick(player.playerId || player.rank)
                                }
                              }}
                            >
                              <span className="text-white hover:text-[#ffff44] text-[13px] font-semibold truncate">
                                {player.name.replace(/\s+/g, '')}
                              </span>
                            </Link>
                            {hasRomanName && (
                              <span className="text-[10px] text-gray-400 latin truncate">
                                {(player.romanName ?? "").trim()}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      {/* 各指標値 */}
                      {metrics.map((metric) => {
                        const value = player[metric.key]
                        const formattedValue = value !== null && value !== undefined 
                          ? formatValue(metric.label, value)
                          : '-'
                        
                        return (
                          <td
                            key={metric.key}
                            className="px-1.5 py-0.5 text-center tabular-nums font-normal border-r border-[#444] text-white"
                            style={{
                              minWidth: '60px',
                            }}
                          >
                            <span className="bebas tabular-nums text-lg tracking-wide">{formattedValue}</span>
                          </td>
                        )
                      })}
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



















