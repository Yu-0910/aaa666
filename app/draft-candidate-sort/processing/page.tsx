import type { Metadata } from "next"
import { DraftSortShell } from "../_components/DraftSortShell"
import { ProcessingRedirect } from "./ProcessingRedirect"

export const metadata: Metadata = {
  title: "結果作成中 | 2026ドラフト候補ソート",
  robots: {
    index: false,
    follow: false,
  },
}

export default function DraftCandidateSortProcessingPage() {
  return (
    <DraftSortShell
      currentStep="作成中"
      title="結果を作成しています"
      description="順位結果から、番付表とドラフト順位予想表を作成しています。"
    >
      <ProcessingRedirect />
      <div className="rounded border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto size-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-700" />
        <p className="mt-5 font-semibold">結果を作成しています</p>
      </div>
    </DraftSortShell>
  )
}

