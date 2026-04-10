import { redirect } from 'next/navigation'

/** 投手ランキング入口 → 完成品は 2026 のみ */
export default function PitchingRankingIndexPage() {
  redirect('/ranking/pitching/2026/PL')
}
