'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // エラーをログに記録
    console.error('Error:', error)
  }, [error])

  return (
    <div className="min-h-screen site-bg text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">エラーが発生しました</h1>
        <p className="text-gray-400 mb-4">
          {error.message || '予期しないエラーが発生しました'}
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-[#ffff44] text-black rounded hover:bg-[#ffff66]"
          >
            再試行
          </button>
          <Link
            href="/"
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
          >
            トップページに戻る
          </Link>
        </div>
      </div>
    </div>
  )
}


















