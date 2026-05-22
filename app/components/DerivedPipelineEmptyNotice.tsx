"use client"

/**
 * 計画書 Phase 6: 今季タブで派生 JSON（`_data/derived`）が無いときの案内。
 */
export default function DerivedPipelineEmptyNotice({
  variant,
  show,
}: {
  variant: "pitcher" | "fielder"
  show: boolean
}) {
  if (!show) return null
  const role = variant === "pitcher" ? "投手" : "野手"
  return (
    <div
      className="mb-4 max-w-3xl rounded border border-amber-600/50 bg-amber-950/35 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/95"
      role="status"
      aria-live="polite"
    >
      <p className="font-bold text-amber-200">今季の計算済みデータがまだありません（{role}）</p>
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

/** 野手ブロック上部の常時注記（データがある場合も pipeline 依存であることを示す） */
export function DerivedPipelineFielderHint() {
  return (
    <p className="mb-3 max-w-3xl text-[10px] leading-snug text-gray-500">
      ※今季の各表は canonical 派生（計画書 Phase 3）の生成状況により「—」になることがあります。
    </p>
  )
}
