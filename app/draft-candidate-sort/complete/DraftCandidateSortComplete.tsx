"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getCandidateFilterLabel } from "../_lib/candidateData"
import {
  loadDraftSortSession,
  saveDraftSortSession,
  type DraftSortSession,
} from "../_lib/draftSortStorage"

export function DraftCandidateSortComplete() {
  const router = useRouter()
  const [session, setSession] = useState<DraftSortSession | null>(null)

  useEffect(() => {
    const saved = loadDraftSortSession()
    if (!saved) {
      router.replace("/draft-candidate-sort")
      return
    }

    setSession(saved)
  }, [router])

  function updateRouteAndGo(route: DraftSortSession["currentRoute"]) {
    if (!session) return

    const nextSession: DraftSortSession = {
      ...session,
      currentRoute: route,
      updatedAt: new Date().toISOString(),
    }

    saveDraftSortSession(nextSession)
    router.push(route)
  }

  if (!session) {
    return (
      <div className="rounded border border-slate-200 bg-white p-6 text-slate-600">
        読み込んでいます。
      </div>
    )
  }

  const targetLabel = getCandidateFilterLabel(session.targetFilter)
  const tieCount = session.answers.filter((answer) => answer.choice === "tie").length
  const unknownCount = session.answers.filter(
    (answer) => answer.choice === "unknown",
  ).length

  return (
    <>
      <section className="rounded border border-slate-200 bg-white p-6 shadow-sm">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-slate-500">回答した比較数</dt>
            <dd className="mt-1 text-xl font-bold">{session.answers.length}</dd>
          </div>
          <div>
            <dt className="text-slate-500">選択したソート対象</dt>
            <dd className="mt-1 text-xl font-bold">{targetLabel}</dd>
          </div>
          <div>
            <dt className="text-slate-500">引き分け</dt>
            <dd className="mt-1 text-xl font-bold">{tieCount}</dd>
          </div>
          <div>
            <dt className="text-slate-500">両方知らない</dt>
            <dd className="mt-1 text-xl font-bold">{unknownCount}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-8 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={() => updateRouteAndGo("/draft-candidate-sort/sort")}
          className="rounded border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 transition hover:border-emerald-400"
        >
          少し戻って修正する
        </button>
        <button
          type="button"
          onClick={() => updateRouteAndGo("/draft-candidate-sort/processing")}
          className="rounded bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800"
        >
          結果を作成する
        </button>
      </div>
    </>
  )
}

