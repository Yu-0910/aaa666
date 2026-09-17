import type { Metadata } from "next"
import { DraftSortShell } from "../_components/DraftSortShell"
import { DraftCandidateSortResult } from "./DraftCandidateSortResult"

export const metadata: Metadata = {
  title: "結果 | 2026ドラフト候補ソート",
  robots: {
    index: false,
    follow: false,
  },
}

export default function DraftCandidateSortResultPage() {
  return (
    <DraftSortShell
      currentStep="結果"
      title="結果"
      description="番付表、ドラフト順位予想表、未評価が多い候補を確認します。"
    >
      <DraftCandidateSortResult />
    </DraftSortShell>
  )
}
