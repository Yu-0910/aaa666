import type { Metadata } from "next"
import { DraftSortShell } from "./_components/DraftSortShell"
import { DraftCandidateSortStart } from "./DraftCandidateSortStart"

export const metadata: Metadata = {
  title: "2026ドラフト候補ソート | Short-Stop",
  robots: {
    index: false,
    follow: false,
  },
}

export default function DraftCandidateSortPage() {
  return (
    <DraftSortShell
      currentStep="対象選択"
      title="ソート対象を選ぶ"
      description="比較したい候補者の範囲を選んで、二者択一の質問へ進みます。"
    >
      <DraftCandidateSortStart />
    </DraftSortShell>
  )
}
