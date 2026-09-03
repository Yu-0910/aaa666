import type { ComponentProps } from 'react'
import { Loader2Icon } from 'lucide-react'

import { cn } from '@/lib/utils'

/** インライン用（ボタン・アイコンサイズ） */
function Spinner({ className, ...props }: ComponentProps<typeof Loader2Icon>) {
  return (
    <Loader2Icon
      role="status"
      aria-label="読み込み中"
      className={cn('size-4 animate-spin shrink-0', className)}
      {...props}
    />
  )
}

/** ページ全体の Suspense / 初期ロード（黒背景・中央） */
function FullPageLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'min-h-screen site-bg text-white flex items-center justify-center',
        className
      )}
      role="status"
      aria-busy="true"
      aria-label="読み込み中"
    >
      <Spinner className="size-10 text-[#FFFF44]" />
    </div>
  )
}

/** セクション・カード内（ブロック中央） */
function SectionLoadingSpinner({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex justify-center items-center py-8', className)}
      role="status"
      aria-busy="true"
      aria-label="読み込み中"
    >
      <Spinner className="size-8 text-[#FFFF44]" />
    </div>
  )
}

export { Spinner, FullPageLoading, SectionLoadingSpinner }
