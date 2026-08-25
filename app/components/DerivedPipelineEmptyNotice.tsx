"use client"

/**
 * 計画書 Phase 6: 今季タブで派生 JSON（`_data/derived`）が無いときの案内。
 */
export default function DerivedPipelineEmptyNotice({
  variant,
  show,
}: {
  variant: "pitcher" | "fielder" | "catcher"
  show: boolean
}) {
  if (!show) return null
  const role =
    variant === "pitcher" ? "投手" : variant === "catcher" ? "捕手" : "野手"
  const catcherNote =
    variant === "catcher"
      ? "今季の試合データに捕手出場がまだ含まれていないか、派生 JSON が未生成です。"
      : null
  return (
    <div
      className="mb-4 max-w-3xl rounded border border-amber-600/50 bg-amber-950/35 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/95"
      role="status"
      aria-live="polite"
    >
      <p className="font-bold text-amber-200">今季のデータを表示できませんでした（{role}）</p>
      {catcherNote ? <p className="mt-1 text-[10px] text-amber-100/85">{catcherNote}</p> : null}
      <p className="mt-1.5 text-[10px] text-amber-100/85">
        しばらくしてから、もう一度お試しください。
      </p>
    </div>
  )
}
