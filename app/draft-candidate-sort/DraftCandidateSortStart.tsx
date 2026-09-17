"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  type CandidateFilter,
  filterCandidatesForSort,
  getCandidateFilterLabel,
  getCandidatesForSort,
} from "./_lib/candidateData"
import {
  clearDraftSortSession,
  createDraftSortSession,
  loadDraftSortSession,
  saveDraftSortSession,
  type DraftSortSession,
} from "./_lib/draftSortStorage"

const filters: CandidateFilter[] = [
  "all",
  "highSchool",
  "university",
  "universityCorporate",
  "recommended",
]

export function DraftCandidateSortStart() {
  const router = useRouter()
  const [selectedFilter, setSelectedFilter] =
    useState<CandidateFilter>("recommended")
  const [savedSession, setSavedSession] = useState<DraftSortSession | null>(null)

  useEffect(() => {
    const saved = loadDraftSortSession()
    if (saved?.targetFilter) {
      setSelectedFilter(saved.targetFilter)
      setSavedSession(saved)
    }
  }, [])

  const selectedLabel = getCandidateFilterLabel(selectedFilter)
  const selectedAll = selectedFilter === "all"
  const allCandidates = getCandidatesForSort()
  const savedResultExpiresAt = savedSession?.resultExpiresAt
    ? new Date(savedSession.resultExpiresAt).toLocaleString("ja-JP", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : null

  function startSort() {
    const session = createDraftSortSession(selectedFilter)
    saveDraftSortSession(session)
    router.push("/draft-candidate-sort/sort")
  }

  function resumeSort() {
    if (!savedSession) return
    router.push(savedSession.currentRoute)
  }

  function clearSaved() {
    clearDraftSortSession()
    setSavedSession(null)
    setSelectedFilter("recommended")
  }

  return (
    <>
      {savedSession ? (
        <section className="mb-6 rounded border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-bold text-emerald-950">前回の続きがあります</p>
              <p className="mt-1 text-sm text-emerald-900">
                {getCandidateFilterLabel(savedSession.targetFilter)} / 回答{" "}
                {savedSession.answers.length}件
              </p>
              {savedResultExpiresAt ? (
                <p className="mt-1 text-xs text-emerald-800">
                  結果の保存期限: {savedResultExpiresAt}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={resumeSort}
                className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                続きから再開
              </button>
              <button
                type="button"
                onClick={clearSaved}
                className="rounded border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:border-emerald-500"
              >
                保存を消す
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filters.map((filter) => {
          const label = getCandidateFilterLabel(filter)
          const recommended = filter === "recommended"
          const selected = filter === selectedFilter
          const count = filterCandidatesForSort(allCandidates, filter).length

          return (
            <button
              key={filter}
              type="button"
              aria-pressed={selected}
              onClick={() => setSelectedFilter(filter)}
              className={[
                "min-h-28 rounded border bg-white p-4 text-left shadow-sm transition",
                recommended
                  ? "border-yellow-400 ring-2 ring-yellow-300"
                  : "border-slate-200 hover:border-emerald-300",
                selected ? "outline outline-3 outline-emerald-700" : "",
              ].join(" ")}
            >
              {recommended ? (
                <span className="mb-2 inline-flex rounded bg-yellow-300 px-2 py-1 text-xs font-bold text-slate-950">
                  オススメ
                </span>
              ) : null}
              <span className="block text-lg font-bold">{label}</span>
              <span className="mt-2 block text-sm text-slate-500">
                {count}人
              </span>
              {recommended ? (
                <span className="mt-2 block text-sm text-slate-600">
                  迷ったらここから
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {selectedAll ? (
        <div className="mt-8 rounded border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
          全候補を対象にすると比較回数が多くなります。時間をかけてじっくり作成したい場合におすすめです。
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-slate-600">
          選択中: <span className="font-semibold text-slate-950">{selectedLabel}</span>
        </p>
        <button
          type="button"
          onClick={startSort}
          className="rounded bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800"
        >
          開始
        </button>
      </div>
    </>
  )
}
