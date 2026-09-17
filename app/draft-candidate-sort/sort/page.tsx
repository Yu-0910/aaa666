import type { Metadata } from "next"
import { DraftSortShell } from "../_components/DraftSortShell"
import { DraftCandidateSortQuestion } from "./DraftCandidateSortQuestion"

export const metadata: Metadata = {
  title: "候補者を比較 | 2026ドラフト候補ソート",
  robots: {
    index: false,
    follow: false,
  },
}

export default function DraftCandidateSortQuestionPage() {
  return (
    <DraftSortShell
      currentStep="比較"
      title="候補者を比較する"
      description="左右の候補者から、上に置きたい方を選びます。"
    >
      <DraftCandidateSortQuestion />
    </DraftSortShell>
  )
}
