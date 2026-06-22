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
      <p className="font-bold text-amber-200">今季の計算済みデータがまだありません（{role}）</p>
      {catcherNote ? <p className="mt-1 text-[10px] text-amber-100/85">{catcherNote}</p> : null}
      <p className="mt-1.5 text-[10px] text-amber-100/85">
        <code className="rounded bg-black/35 px-1 py-0.5 text-[9px]">_data/scraped_games/canonical</code>{" "}
        に試合成績が入り、
        <code className="mx-0.5 rounded bg-black/35 px-1 py-0.5 text-[9px]">npm run phase3:derived:2026</code>
        で派生を生成すると表が埋まります。canonical が空のときは計画書{" "}
        <strong>Phase 5（canonical 実体化）</strong>
        （例: <code className="rounded bg-black/35 px-1 py-0.5 text-[9px]">npm run phase5:sportsnavi-canonical-pipeline</code>
        ）を先に実行してください。詳細は{" "}
        <code className="rounded bg-black/35 px-1 py-0.5 text-[9px]">docs/plan_full_pipeline_from_games_to_pages_and_rankings.md</code>
      </p>
    </div>
  )
}
