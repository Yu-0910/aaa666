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
      <div className="rounded border border-[#333] bg-[#1a1a1a] p-6 text-white/70">
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
      <section className="rounded border border-[#333] bg-[#1a1a1a] p-6 text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-white/55">回答した比較数</dt>
            <dd className="mt-1 text-xl font-bold">{session.answers.length}</dd>
          </div>
          <div>
            <dt className="text-white/55">選択したソート対象</dt>
            <dd className="mt-1 text-xl font-bold">{targetLabel}</dd>
          </div>
          <div>
            <dt className="text-white/55">引き分け</dt>
            <dd className="mt-1 text-xl font-bold">{tieCount}</dd>
          </div>
          <div>
            <dt className="text-white/55">両方知らない</dt>
            <dd className="mt-1 text-xl font-bold">{unknownCount}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-8 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={() => updateRouteAndGo("/draft-candidate-sort/sort")}
          className="rounded border border-[#555] bg-[#1a1a1a] px-5 py-3 font-semibold text-white transition hover:border-[#ffff44] hover:text-[#ffff44]"
        >
          少し戻って修正する
        </button>
        <button
          type="button"
          onClick={() => updateRouteAndGo("/draft-candidate-sort/processing")}
          className="rounded bg-[#ffff44] px-5 py-3 font-semibold text-[#23272a] transition hover:bg-white"
        >
          結果を作成する
        </button>
      </div>
    </>
  )
}
