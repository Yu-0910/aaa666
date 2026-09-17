import type { Metadata } from "next"
import { DraftSortShell } from "../_components/DraftSortShell"
import { DraftCandidateSortComplete } from "./DraftCandidateSortComplete"

export const metadata: Metadata = {
  title: "質問完了 | 2026ドラフト候補ソート",
  robots: {
    index: false,
    follow: false,
  },
}

export default function DraftCandidateSortCompletePage() {
  return (
    <DraftSortShell
      currentStep="完了確認"
      title="質問が完了しました"
      description="結果を作成する前に、回答内容を確定します。"
    >
      <DraftCandidateSortComplete />
    </DraftSortShell>
  )
}
