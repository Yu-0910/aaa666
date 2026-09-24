"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
  rebuildDraftSortState,
  shouldShowTieButton,
  undoDraftSortAnswer,
  type DraftSortChoice,
  type DraftSortComparison,
  type DraftSortState,
} from "../_lib/sortEngine"

export function DraftCandidateSortQuestion() {
  const router = useRouter()
  const [session, setSession] = useState<DraftSortSession | null>(null)
  const [sortState, setSortState] = useState<DraftSortState | null>(null)
  const answeringRef = useRef(false)

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
    const currentCandidateIds = candidates.map((candidate) => candidate.id)
    const currentCandidateIdSet = new Set(currentCandidateIds)
    const savedCandidateIds = saved.candidateIds.filter((candidateId) =>
      currentCandidateIdSet.has(candidateId),
    )
    const candidateIds =
      savedCandidateIds.length > 0
        ? [
            ...savedCandidateIds,
            ...shuffleCandidateIds(
              currentCandidateIds.filter(
                (candidateId) => !savedCandidateIds.includes(candidateId),
              ),
            ),
          ]
        : shuffleCandidateIds(currentCandidateIds)
    const replayedState =
      saved.answers.length > 0
        ? rebuildDraftSortState(candidateIds, saved.answers)
        : createInitialSortState(candidateIds)

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
  const progressPercent = sortState?.progressPercent ?? 0
  const completionText =
    sortState?.completedReason === "sorted"
      ? "上位36人が確定したため終了します"
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
      rankEntries: nextState.rankEntries,
      relations: nextState.relations,
      progressPercent: nextState.progressPercent,
      completedReason: nextState.completedReason,
      unknownCounts: nextState.unknownCounts,
      tieGroups: nextState.tieGroups,
      updatedAt: new Date().toISOString(),
    }

    saveDraftSortSession(nextSession)
    setSession(nextSession)
  }

  function answer(choice: DraftSortChoice, comparison: DraftSortComparison | null) {
    if (!sortState || !comparison || answeringRef.current) return
    answeringRef.current = true
    const nextState = applyDraftSortAnswer(sortState, choice, new Date(), comparison)
    setSortState(nextState)
    persist(nextState)

    if (nextState.completed) {
      router.push("/draft-candidate-sort/complete")
    }
    window.setTimeout(() => {
      answeringRef.current = false
    }, 0)
  }

  function undo() {
    if (!sortState) return
    const nextState = undoDraftSortAnswer(sortState)
    setSortState(nextState)
    persist(nextState)
  }

  if (!session || !sortState) {
    return (
      <div className="rounded border border-[#333] bg-[#1a1a1a] p-6 text-white/70">
        読み込んでいます。
      </div>
    )
  }

  if (sortState.candidateIds.length < 2) {
    return (
      <div className="rounded border border-[#333] bg-[#1a1a1a] p-6 text-white/70">
        候補者データ投入後、この画面で二者択一の質問を表示します。
      </div>
    )
  }

  return (
    <>
      <div className="mb-5 rounded border border-[#333] bg-[#1a1a1a] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/70">
          <p>完了率 {progressPercent}%</p>
        </div>
        <p className="mt-2 text-xs text-white/55">{completionText}</p>
        <div className="mt-3 h-2 overflow-hidden rounded bg-[#111315]">
          <div
            className="h-full rounded bg-[#ffff44] transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <CandidateCard
          label="左の候補"
          candidate={leftCandidate}
          onSelect={() => answer("left", currentComparison)}
        />
        <CandidateCard
          label="右の候補"
          candidate={rightCandidate}
          onSelect={() => answer("right", currentComparison)}
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {showTie ? (
          <button
            type="button"
            onClick={() => answer("tie", currentComparison)}
            className="rounded border border-[#333] bg-[#1a1a1a] px-4 py-3 font-semibold text-white transition hover:border-[#ffff44] hover:text-[#ffff44]"
          >
            どちらも同じくらい
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => answer("unknown", currentComparison)}
          className="rounded border border-[#333] bg-[#1a1a1a] px-4 py-3 font-semibold text-white transition hover:border-[#ffff44] hover:text-[#ffff44]"
        >
          両方知らない
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={sortState.answers.length === 0}
          className="rounded border border-[#333] bg-[#1a1a1a] px-4 py-3 font-semibold text-white transition hover:border-[#ffff44] hover:text-[#ffff44] disabled:cursor-not-allowed disabled:opacity-50"
        >
          戻る
        </button>
      </div>
    </>
  )
}

function shuffleCandidateIds(candidateIds: string[]): string[] {
  const shuffled = [...candidateIds]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }

  return shuffled
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
      className="min-h-64 rounded border border-[#333] bg-[#1a1a1a] p-3 text-left text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition duration-150 hover:border-[#ffff44] hover:bg-[#2a2a2a] active:scale-[0.98] active:border-[#ffff44] active:bg-[#111315] active:shadow-inner focus:outline-none focus:ring-3 focus:ring-[#ffff44] sm:min-h-72 sm:p-5"
      aria-label={`${label}を上にする`}
    >
      <h2 className="break-words text-lg font-bold leading-snug text-[#ffff44] sm:text-2xl">
        {candidate?.name ?? "候補者名"}
      </h2>
      <dl className="mt-4 grid gap-2 text-xs sm:mt-5 sm:gap-3 sm:text-sm">
        <div>
          <dt className="text-white/50">所属</dt>
          <dd className="font-semibold">{candidate?.schoolOrTeam ?? "所属名"}</dd>
        </div>
        <div>
          <dt className="text-white/50">区分</dt>
          <dd className="font-semibold">
            {candidate ? getCandidateCategoryLabel(candidate.category) : "区分"}
          </dd>
        </div>
        <div>
          <dt className="text-white/50">ポジション</dt>
          <dd className="font-semibold">
            {candidate
              ? getCandidatePositionGroupLabel(candidate.positionGroup)
              : "ポジション"}
          </dd>
        </div>
        <div>
          <dt className="text-white/50">投打・身長体重</dt>
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
