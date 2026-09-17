"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  filterCandidatesForSort,
  getCandidateCategoryLabel,
  getCandidatePositionGroupLabel,
  getCandidatesForSort,
  type CandidateForSort,
} from "../_lib/candidateData"
import {
  loadDraftSortSession,
  saveDraftSortSession,
  type DraftSortSession,
} from "../_lib/draftSortStorage"
import {
  applyDraftSortAnswer,
  createInitialSortState,
  getCurrentComparison,
  shouldShowTieButton,
  undoDraftSortAnswer,
  type DraftSortChoice,
  type DraftSortState,
} from "../_lib/sortEngine"

export function DraftCandidateSortQuestion() {
  const router = useRouter()
  const [session, setSession] = useState<DraftSortSession | null>(null)
  const [sortState, setSortState] = useState<DraftSortState | null>(null)

  useEffect(() => {
    const saved = loadDraftSortSession()
    if (!saved) {
      router.replace("/draft-candidate-sort")
      return
    }

    const candidates = filterCandidatesForSort(
      getCandidatesForSort(),
      saved.targetFilter,
    )
    const candidateIds =
      saved.candidateIds.length > 0
        ? saved.candidateIds
        : candidates.map((candidate) => candidate.id)
    const initialState = createInitialSortState(candidateIds)
    const replayedState = saved.answers.reduce(
      (state, answer) =>
        applyDraftSortAnswer(state, answer.choice, new Date(answer.answeredAt)),
      initialState,
    )

    setSession(saved)
    setSortState(replayedState)
  }, [router])

  const candidateById = useMemo(() => {
    return new Map(
      getCandidatesForSort().map((candidate) => [candidate.id, candidate]),
    )
  }, [])

  const currentComparison = sortState ? getCurrentComparison(sortState) : null
  const leftCandidate = currentComparison
    ? candidateById.get(currentComparison.leftId)
    : null
  const rightCandidate = currentComparison
    ? candidateById.get(currentComparison.rightId)
    : null
  const showTie = sortState ? shouldShowTieButton(sortState.answers) : true
  const totalComparisons = sortState?.comparisonQueue.length ?? 0
  const answeredComparisons = sortState?.answers.length ?? 0
  const progressPercent =
    totalComparisons > 0
      ? Math.min(100, Math.round((answeredComparisons / totalComparisons) * 100))
      : 0
  const completionText =
    sortState?.completedReason === "stable"
      ? "上位36人が確定したため終了します"
      : sortState?.completedReason === "maxQuestions"
        ? "必要な比較数に達しました"
        : "上位36人が確定した時点で終了します"

  function persist(nextState: DraftSortState) {
    if (!session) return

    const nextSession: DraftSortSession = {
      ...session,
      currentRoute: nextState.completed
        ? "/draft-candidate-sort/complete"
        : "/draft-candidate-sort/sort",
      candidateIds: nextState.candidateIds,
      answers: nextState.answers,
      ranking: nextState.ranking,
      ratings: nextState.ratings,
      completedReason: nextState.completedReason,
      unknownCounts: nextState.unknownCounts,
      tieGroups: nextState.tieGroups,
      updatedAt: new Date().toISOString(),
    }

    saveDraftSortSession(nextSession)
    setSession(nextSession)
  }

  function answer(choice: DraftSortChoice) {
    if (!sortState) return
    const nextState = applyDraftSortAnswer(sortState, choice)
    setSortState(nextState)
    persist(nextState)

    if (nextState.completed) {
      router.push("/draft-candidate-sort/complete")
    }
  }

  function undo() {
    if (!sortState) return
    const nextState = undoDraftSortAnswer(sortState)
    setSortState(nextState)
    persist(nextState)
  }

  if (!session || !sortState) {
    return (
      <div className="rounded border border-slate-200 bg-white p-6 text-slate-600">
        読み込んでいます。
      </div>
    )
  }

  if (sortState.candidateIds.length < 2) {
    return (
      <div className="rounded border border-slate-200 bg-white p-6 text-slate-600">
        候補者データ投入後、この画面で二者択一の質問を表示します。
      </div>
    )
  }

  return (
    <>
      <div className="mb-5 rounded border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>完了率 {progressPercent}%</p>
        </div>
        <p className="mt-2 text-xs text-slate-500">{completionText}</p>
        <div className="mt-3 h-2 overflow-hidden rounded bg-slate-100">
          <div
            className="h-full rounded bg-emerald-700 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <CandidateCard
          label="左の候補"
          candidate={leftCandidate}
          onSelect={() => answer("left")}
        />
        <CandidateCard
          label="右の候補"
          candidate={rightCandidate}
          onSelect={() => answer("right")}
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {showTie ? (
          <button
            type="button"
            onClick={() => answer("tie")}
            className="rounded border border-slate-200 bg-white px-4 py-3 font-semibold transition hover:border-emerald-400 hover:bg-emerald-50"
          >
            どちらも同じくらい
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => answer("unknown")}
          className="rounded border border-slate-200 bg-white px-4 py-3 font-semibold transition hover:border-emerald-400 hover:bg-emerald-50"
        >
          両方知らない
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={sortState.answers.length === 0}
          className="rounded border border-slate-200 bg-white px-4 py-3 font-semibold transition hover:border-emerald-400 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          戻る
        </button>
      </div>
    </>
  )
}

function CandidateCard({
  label,
  candidate,
  onSelect,
}: {
  label: string
  candidate: CandidateForSort | null | undefined
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="min-h-64 rounded border border-slate-200 bg-white p-3 text-left shadow-sm transition duration-150 hover:border-emerald-500 hover:bg-emerald-50 active:scale-[0.98] active:border-emerald-600 active:bg-emerald-100 active:shadow-inner focus:outline-none focus:ring-3 focus:ring-emerald-600 sm:min-h-72 sm:p-5"
      aria-label={`${label}を上にする`}
    >
      <p className="text-xs font-semibold text-slate-500 sm:text-sm">{label}</p>
      <h2 className="mt-3 break-words text-lg font-bold leading-snug sm:mt-4 sm:text-2xl">
        {candidate?.name ?? "候補者名"}
      </h2>
      <dl className="mt-4 grid gap-2 text-xs sm:mt-5 sm:gap-3 sm:text-sm">
        <div>
          <dt className="text-slate-500">所属</dt>
          <dd className="font-semibold">{candidate?.schoolOrTeam ?? "所属名"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">区分</dt>
          <dd className="font-semibold">
            {candidate ? getCandidateCategoryLabel(candidate.category) : "区分"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">ポジション</dt>
          <dd className="font-semibold">
            {candidate
              ? getCandidatePositionGroupLabel(candidate.positionGroup)
              : "ポジション"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">投打・身長体重</dt>
          <dd className="font-semibold">
            {[candidate?.throwBat, candidate?.heightWeight]
              .filter(Boolean)
              .join(" / ") || "-"}
          </dd>
        </div>
      </dl>
    </button>
  )
}
