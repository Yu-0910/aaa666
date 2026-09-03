import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen site-bg text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">404 - Page Not Found</h1>
        <p className="text-gray-400 mb-4">お探しのページが見つかりませんでした。</p>
        <Link
          href="/"
          className="text-[#ffff44] hover:underline"
        >
          トップページに戻る
        </Link>
      </div>
    </div>
  )
}



















