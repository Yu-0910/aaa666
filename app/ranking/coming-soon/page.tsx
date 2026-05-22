/**
 * 準備中ページ
 * 2025年PL以外のランキングページへのアクセス時に表示
 */

"use client"

import Link from "next/link"
import { SITE_TOP_HREF } from "@/lib/siteNavigation"

export default function ComingSoonPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-[#333]" style={{ zIndex: 300 }}>
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
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">準備中</h1>
            <p className="text-gray-400 mb-6">
              このページは現在準備中です。
            </p>
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-[#ffff44] text-black font-semibold hover:opacity-80 transition-opacity rounded"
            >
              トップページに戻る
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

